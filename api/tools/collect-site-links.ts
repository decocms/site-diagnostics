import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { isPrivateHost } from "../../src/lib/ssrf.ts";
import { firecrawlMap } from "../lib/firecrawl.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const MAX_SOURCE_PAGES = 20;
const MAX_LINKS = 2000;
const PAGE_FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)";

// ── Schemas ────────────────────────────────────────────────

export const collectSiteLinksInputSchema = z.object({
	url: urlInput.describe("Site root URL"),
	maxPages: z
		.number()
		.min(1)
		.max(200)
		.default(100)
		.describe("Max pages to discover and fetch for link extraction"),
	checkExternal: z
		.boolean()
		.default(false)
		.describe(
			"Include external (cross-host) link targets in the output. Default false keeps the result focused on internal link rot.",
		),
	concurrency: z
		.number()
		.min(1)
		.max(20)
		.default(10)
		.describe("Parallel HTTP requests when fetching pages"),
});

export type CollectSiteLinksInput = z.infer<typeof collectSiteLinksInputSchema>;

export const collectSiteLinksOutputSchema = z.object({
	url: z.string(),
	pagesCrawled: z.number().describe("Pages returned by Firecrawl map"),
	pagesFetched: z
		.number()
		.describe("Pages successfully fetched and parsed as HTML"),
	linksSkipped: z
		.number()
		.describe(
			"Unique targets dropped because the MAX_LINKS cap was reached (extremely large sites)",
		),
	links: z
		.array(
			z.object({
				targetUrl: z.string(),
				scope: z.enum(["internal", "external"]),
				sourcePages: z
					.array(z.string())
					.describe(
						"Up to MAX_SOURCE_PAGES source pages that link to this target",
					),
				sourcePagesTotal: z.number(),
			}),
		)
		.describe("Unique link targets discovered across all fetched pages"),
	error: z.string().optional(),
});

export type CollectSiteLinksOutput = z.infer<
	typeof collectSiteLinksOutputSchema
>;

// ── Helpers ────────────────────────────────────────────────

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

export const collectSiteLinksTool = (_env: Env) =>
	createTool({
		id: "collect_site_links",
		description:
			"Discover all unique outbound <a href> link targets across a site. Uses Firecrawl map to list pages, fetches each in parallel, extracts links, and deduplicates by target URL with source-page attribution. Does NOT check link status — pair with check_urls to check the returned targets in paginated batches. Use for: broken-link scanning, link inventory, internal/external link audits.",
		inputSchema: collectSiteLinksInputSchema,
		outputSchema: collectSiteLinksOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages, checkExternal, concurrency } = context;

			try {
				const map = await firecrawlMap(url, { limit: maxPages });
				const pages = map.links.slice(0, maxPages);

				const linkIndex = new Map<
					string,
					{ scope: "internal" | "external"; sources: Set<string> }
				>();
				let pagesFetched = 0;

				// Stream: fetch + extract inside the same worker task so each
				// page's HTML can be GC'd as soon as its links are merged into
				// linkIndex. Accumulating all HTML first blew through the 128MB
				// per-request memory limit on Cloudflare Workers for sites
				// with heavy markup (e.g. ecom catalogs with inline product
				// JSON). Peak memory now scales with concurrency × page size
				// instead of total pages × page size.
				await mapConcurrent(pages, concurrency, async (pageUrl) => {
					const fetched = await fetchHtml(pageUrl);
					if (!fetched) return;
					pagesFetched++;
					// Resolve relative hrefs against the final URL after
					// redirects; attribute the source page by the original
					// (pre-redirect) URL since that's what a human recognizes.
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

				const allEntries = Array.from(linkIndex.entries());
				const capped = allEntries.slice(0, MAX_LINKS);
				const linksSkipped = allEntries.length - capped.length;

				const links = capped.map(([targetUrl, data]) => {
					const sources = Array.from(data.sources);
					return {
						targetUrl,
						scope: data.scope,
						sourcePages: sources.slice(0, MAX_SOURCE_PAGES),
						sourcePagesTotal: sources.length,
					};
				});

				return {
					url,
					pagesCrawled: pages.length,
					pagesFetched,
					linksSkipped,
					links,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					pagesCrawled: 0,
					pagesFetched: 0,
					linksSkipped: 0,
					links: [],
					error: msg,
				};
			}
		},
	});
