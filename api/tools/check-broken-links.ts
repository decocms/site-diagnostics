import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { isPrivateHost } from "../../src/lib/ssrf.ts";
import { firecrawlMap } from "../lib/firecrawl.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const MAX_REDIRECTS = 5;
const LONG_CHAIN_THRESHOLD = 3;
const MAX_SOURCE_PAGES = 20;
const MAX_TARGETS = 2000;
const PAGE_FETCH_TIMEOUT_MS = 15_000;
const LINK_CHECK_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)";

// Default wall-clock budget: 80s keeps a safe margin under typical
// upstream proxy timeouts (e.g. Cloudflare's ~100s). Capped below 90s
// because in-flight checkLink calls can extend up to LINK_CHECK_TIMEOUT_MS
// past the "stop dispatching" point.
const DEFAULT_TIME_BUDGET_MS = 80_000;
// When the deadline is this close, workers stop picking up new items.
// Must be > LINK_CHECK_TIMEOUT_MS so in-flight link checks can finish
// before the overall deadline is reached.
const BUDGET_SAFETY_MARGIN_MS = 12_000;

// ── Schemas ────────────────────────────────────────────────

export const checkBrokenLinksInputSchema = z.object({
	url: urlInput.describe("Site root URL to crawl"),
	maxPages: z
		.number()
		.min(1)
		.max(500)
		.default(100)
		.describe("Max pages to discover and scan for outbound links"),
	checkExternal: z
		.boolean()
		.default(false)
		.describe(
			"Also check external (cross-host) link targets. External servers rate-limit or block bots, producing false positives. Default false.",
		),
	concurrency: z
		.number()
		.min(1)
		.max(20)
		.default(5)
		.describe(
			"Parallel HTTP requests when fetching pages and checking targets",
		),
	timeBudgetMs: z
		.number()
		.min(10_000)
		.max(90_000)
		.default(DEFAULT_TIME_BUDGET_MS)
		.describe(
			"Wall-clock budget for the whole scan. When the budget is about to run out, the tool stops dispatching new work and returns what it has with partialResults: true. Keep under 90s to stay below typical proxy timeouts.",
		),
});

export type CheckBrokenLinksInput = z.infer<typeof checkBrokenLinksInputSchema>;

const errorKindSchema = z.enum([
	"http",
	"timeout",
	"dns",
	"connection",
	"redirect-loop",
]);

export const checkBrokenLinksOutputSchema = z.object({
	url: z.string(),
	pagesCrawled: z.number(),
	linksChecked: z.number(),
	targetsSkipped: z
		.number()
		.describe(
			"Unique link targets that were never queued because the MAX_TARGETS cap was reached",
		),
	targetsUnchecked: z
		.number()
		.describe(
			"Unique link targets that were queued but not checked because the time budget ran out",
		),
	partialResults: z
		.boolean()
		.describe(
			"True when the time budget ran out before all work completed. The agent should treat findings as a partial snapshot — future runs will cover what was missed.",
		),
	broken: z.array(
		z.object({
			targetUrl: z.string(),
			status: z.number().describe("HTTP status, or 0 for transport errors"),
			errorKind: errorKindSchema,
			scope: z.enum(["internal", "external"]),
			sourcePages: z.array(z.string()),
			sourcePagesTotal: z.number(),
		}),
	),
	redirectChains: z.array(
		z.object({
			targetUrl: z.string(),
			chain: z
				.array(z.string())
				.describe("Full redirect chain, start to final"),
			hops: z.number(),
			finalStatus: z.number(),
			scope: z.enum(["internal", "external"]),
			sourcePages: z.array(z.string()),
			sourcePagesTotal: z.number(),
		}),
	),
	error: z.string().optional(),
});

export type CheckBrokenLinksOutput = z.infer<
	typeof checkBrokenLinksOutputSchema
>;

// ── Helpers ────────────────────────────────────────────────

/** Classify a thrown fetch error into an errorKind. */
function classifyFetchError(err: unknown): "timeout" | "dns" | "connection" {
	const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
	if (/timeout|AbortError|timed out/i.test(msg)) return "timeout";
	if (/ENOTFOUND|DNS|getaddrinfo/i.test(msg)) return "dns";
	return "connection";
}

/** Extract all <a href> links, resolve to absolute, dedupe, classify scope. */
function extractLinksWithScope(
	html: string,
	baseUrl: string,
): { href: string; scope: "internal" | "external" }[] {
	const base = new URL(baseUrl);
	const seen = new Set<string>();
	const out: { href: string; scope: "internal" | "external" }[] = [];
	const regex = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

	for (const match of html.matchAll(regex)) {
		const href = match[1].trim();
		if (
			!href ||
			href.startsWith("#") ||
			href.startsWith("javascript:") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:")
		) {
			continue;
		}

		try {
			const resolved = new URL(href, base);
			if (!/^https?:$/.test(resolved.protocol)) continue;
			resolved.hash = "";
			const canonical = resolved.href;
			if (seen.has(canonical)) continue;
			seen.add(canonical);
			out.push({
				href: canonical,
				scope: resolved.hostname === base.hostname ? "internal" : "external",
			});
		} catch {
			// Invalid URL, skip
		}
	}

	return out;
}

/**
 * Fetch a page and return its HTML plus the final URL after redirects.
 * The final URL is the base we must use when resolving relative hrefs —
 * using the pre-redirect URL mis-resolves `../` and same-directory paths
 * whenever a redirect changes the path's directory.
 */
async function fetchHtml(
	url: string,
): Promise<{ html: string; finalUrl: string } | null> {
	try {
		const u = new URL(url);
		if (!/^https?:$/.test(u.protocol)) return null;
		if (isPrivateHost(u.hostname)) return null;

		const resp = await fetch(url, {
			headers: {
				"user-agent": USER_AGENT,
				accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			redirect: "follow",
			signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
		});

		const contentType = resp.headers.get("content-type") ?? "";
		if (!contentType.includes("html")) return null;
		return { html: await resp.text(), finalUrl: resp.url };
	} catch {
		return null;
	}
}

interface LinkCheckResult {
	status: number;
	chain: string[];
	errorKind?: "timeout" | "dns" | "connection" | "redirect-loop";
}

/** Check a link target by HEAD (fallback GET). Track redirect chain manually. */
async function checkLink(url: string): Promise<LinkCheckResult> {
	const chain: string[] = [url];
	const visited = new Set<string>([url]);
	let current = url;

	for (let i = 0; i <= MAX_REDIRECTS; i++) {
		let target: URL;
		try {
			target = new URL(current);
		} catch {
			return { status: 0, chain, errorKind: "connection" };
		}
		if (!/^https?:$/.test(target.protocol)) {
			return { status: 0, chain, errorKind: "connection" };
		}
		if (isPrivateHost(target.hostname)) {
			return { status: 0, chain, errorKind: "connection" };
		}

		let resp: Response;
		try {
			resp = await fetch(current, {
				method: "HEAD",
				redirect: "manual",
				headers: { "user-agent": USER_AGENT },
				signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
			});
			// Some servers reject HEAD — fall back to GET
			if (resp.status === 405 || resp.status === 403 || resp.status === 501) {
				resp = await fetch(current, {
					method: "GET",
					redirect: "manual",
					headers: { "user-agent": USER_AGENT },
					signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
				});
			}
		} catch (err) {
			return { status: 0, chain, errorKind: classifyFetchError(err) };
		}

		// Non-redirect response: we're done
		if (resp.status < 300 || resp.status >= 400) {
			return { status: resp.status, chain };
		}

		const location = resp.headers.get("location");
		if (!location) return { status: resp.status, chain };

		let next: string;
		try {
			next = new URL(location, current).href;
		} catch {
			return { status: resp.status, chain, errorKind: "connection" };
		}

		if (visited.has(next)) {
			chain.push(next);
			return { status: 0, chain, errorKind: "redirect-loop" };
		}
		visited.add(next);
		chain.push(next);
		current = next;
	}

	// Exceeded MAX_REDIRECTS without a terminal response
	return { status: 0, chain, errorKind: "redirect-loop" };
}

/**
 * Run an async mapper over items with a concurrency cap. When shouldStop
 * returns true, workers finish any in-flight call and stop picking up
 * new items — the resulting array has undefined slots for items that
 * were never dispatched.
 */
async function mapConcurrent<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
	shouldStop?: () => boolean,
): Promise<(R | undefined)[]> {
	const out: (R | undefined)[] = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (true) {
			if (shouldStop?.()) return;
			const i = cursor++;
			if (i >= items.length) return;
			out[i] = await fn(items[i]);
		}
	}

	const n = Math.min(limit, Math.max(items.length, 1));
	await Promise.all(Array.from({ length: n }, worker));
	return out;
}

// ── Tool Definition ────────────────────────────────────────

export const checkBrokenLinksTool = (_env: Env) =>
	createTool({
		id: "check_broken_links",
		description:
			"Scan a site for broken links and problematic redirects. Crawls up to N pages via Firecrawl map, " +
			"fetches each to extract outbound <a href> links, then checks every unique target with HEAD/GET " +
			"to determine status. Returns broken links grouped by target URL (with source-page attribution) " +
			"and long redirect chains. Bounded by a wall-clock budget (timeBudgetMs) — when the budget runs " +
			"out, returns partial results with partialResults: true so large sites degrade gracefully instead " +
			"of timing out. Use for: link health audits, periodic broken-link monitoring.",
		inputSchema: checkBrokenLinksInputSchema,
		outputSchema: checkBrokenLinksOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages, checkExternal, concurrency, timeBudgetMs } =
				context;

			// Wall-clock budget. Set once up-front; both phase 2 (page fetching)
			// and phase 3 (target checking) share it. When the deadline is
			// within BUDGET_SAFETY_MARGIN_MS, workers stop dispatching new
			// items so any in-flight calls can complete before we return.
			const deadline = Date.now() + timeBudgetMs;
			let budgetExhausted = false;
			const shouldStop = () => {
				if (Date.now() > deadline - BUDGET_SAFETY_MARGIN_MS) {
					budgetExhausted = true;
					return true;
				}
				return false;
			};

			try {
				// 1. Discover pages on the site
				const map = await firecrawlMap(url, { limit: maxPages });
				const pages = map.links.slice(0, maxPages);

				// 2. Fetch each page's HTML in parallel and extract outbound links
				const htmlPerPage = await mapConcurrent(
					pages,
					concurrency,
					fetchHtml,
					shouldStop,
				);

				// 3. Build unique target → { scope, source pages } index
				const linkIndex = new Map<
					string,
					{ scope: "internal" | "external"; sources: Set<string> }
				>();

				pages.forEach((pageUrl, i) => {
					const fetched = htmlPerPage[i];
					if (!fetched) return;
					// Resolve relative hrefs against the final URL after redirects;
					// attribute the source page by the original (pre-redirect) URL
					// since that's what a human would recognize.
					for (const { href, scope } of extractLinksWithScope(
						fetched.html,
						fetched.finalUrl,
					)) {
						if (scope === "external" && !checkExternal) continue;
						let entry = linkIndex.get(href);
						if (!entry) {
							entry = { scope, sources: new Set() };
							linkIndex.set(href, entry);
						}
						entry.sources.add(pageUrl);
					}
				});

				// Apply target cap (rare — guards against huge sites)
				const allTargets = Array.from(linkIndex.keys());
				const targets = allTargets.slice(0, MAX_TARGETS);
				const targetsSkipped = allTargets.length - targets.length;

				// 4. Check every unique target (subject to time budget)
				const results = await mapConcurrent(
					targets,
					concurrency,
					checkLink,
					shouldStop,
				);

				// 5. Classify into broken vs redirect-chain-long
				const broken: CheckBrokenLinksOutput["broken"] = [];
				const redirectChains: CheckBrokenLinksOutput["redirectChains"] = [];
				let targetsUnchecked = 0;

				results.forEach((result, i) => {
					const target = targets[i];
					const entry = linkIndex.get(target);
					if (!entry) return;

					// Budget ran out before this target was dispatched — skip silently.
					// It'll be picked up by a future run.
					if (!result) {
						targetsUnchecked++;
						return;
					}

					const sources = Array.from(entry.sources);
					const sourcesTrimmed = sources.slice(0, MAX_SOURCE_PAGES);
					const sourcePagesTotal = sources.length;

					const isHttpError = result.status >= 400;
					const isTransportError = result.status === 0;

					if (isHttpError || isTransportError) {
						broken.push({
							targetUrl: target,
							status: result.status,
							errorKind: result.errorKind ?? "http",
							scope: entry.scope,
							sourcePages: sourcesTrimmed,
							sourcePagesTotal,
						});
						return;
					}

					// Success: check for long redirect chain
					const hops = result.chain.length - 1;
					if (hops > LONG_CHAIN_THRESHOLD) {
						redirectChains.push({
							targetUrl: target,
							chain: result.chain,
							hops,
							finalStatus: result.status,
							scope: entry.scope,
							sourcePages: sourcesTrimmed,
							sourcePagesTotal,
						});
					}
				});

				return {
					url,
					pagesCrawled: pages.length,
					linksChecked: targets.length - targetsUnchecked,
					targetsSkipped,
					targetsUnchecked,
					partialResults: budgetExhausted,
					broken,
					redirectChains,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					pagesCrawled: 0,
					linksChecked: 0,
					targetsSkipped: 0,
					targetsUnchecked: 0,
					partialResults: budgetExhausted,
					broken: [],
					redirectChains: [],
					error: msg,
				};
			}
		},
	});
