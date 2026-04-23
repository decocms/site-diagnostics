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
		.describe("Unique link targets that were not checked (cap reached)"),
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

/** Fetch a page and return its HTML, or null if not HTML / failed. */
async function fetchHtml(url: string): Promise<string | null> {
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
		return await resp.text();
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

/** Run an async mapper over items with a concurrency cap. */
async function mapConcurrent<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (true) {
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
			"and long redirect chains. Use for: link health audits, periodic broken-link monitoring.",
		inputSchema: checkBrokenLinksInputSchema,
		outputSchema: checkBrokenLinksOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages, checkExternal, concurrency } = context;

			try {
				// 1. Discover pages on the site
				const map = await firecrawlMap(url, { limit: maxPages });
				const pages = map.links.slice(0, maxPages);

				// 2. Fetch each page's HTML in parallel and extract outbound links
				const htmlPerPage = await mapConcurrent(pages, concurrency, fetchHtml);

				// 3. Build unique target → { scope, source pages } index
				const linkIndex = new Map<
					string,
					{ scope: "internal" | "external"; sources: Set<string> }
				>();

				pages.forEach((pageUrl, i) => {
					const html = htmlPerPage[i];
					if (!html) return;
					for (const { href, scope } of extractLinksWithScope(html, pageUrl)) {
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

				// 4. Check every unique target
				const results = await mapConcurrent(targets, concurrency, checkLink);

				// 5. Classify into broken vs redirect-chain-long
				const broken: CheckBrokenLinksOutput["broken"] = [];
				const redirectChains: CheckBrokenLinksOutput["redirectChains"] = [];

				results.forEach((result, i) => {
					const target = targets[i];
					const entry = linkIndex.get(target);
					if (!entry) return;
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
					linksChecked: targets.length,
					targetsSkipped,
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
					broken: [],
					redirectChains: [],
					error: msg,
				};
			}
		},
	});
