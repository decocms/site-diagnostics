import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	onPagePages,
	onPageTaskPost,
	pollOnPageTask,
} from "../lib/dataforseo.ts";
import { extractSeoMeta, extractSitemapUrls } from "../lib/html.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── JSON-LD Sampling ──────────────────────────────────────

/** Common URL patterns that indicate a product detail page */
const PDP_PATTERNS = [
	/\/p$/, // deco.cx / VTEX: /slug/p
	/\/p\?/, // deco.cx / VTEX with query params
	/\/product\//,
	/\/products\//,
	/\/dp\//, // Amazon-style
	/\/pdp\//,
];

function isPdpUrl(url: string): boolean {
	return PDP_PATTERNS.some((re) => re.test(url));
}

const SAMPLE_SIZE = 5;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Find PDP URLs from crawl results, falling back to the product sitemap.
 */
async function findPdpUrls(
	crawledPages: { url: string }[],
	origin: string,
): Promise<string[]> {
	// 1. Try crawl results first
	const fromCrawl = crawledPages.map((p) => p.url).filter(isPdpUrl);
	if (fromCrawl.length >= SAMPLE_SIZE) {
		return fromCrawl.slice(0, SAMPLE_SIZE);
	}

	// 2. Fallback: try product sitemap
	const sitemapCandidates = [
		`${origin}/sitemap/product-0.xml`,
		`${origin}/sitemap-products.xml`,
	];

	for (const sitemapUrl of sitemapCandidates) {
		try {
			const resp = await fetch(sitemapUrl, {
				headers: {
					"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
				},
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!resp.ok) continue;
			const xml = await resp.text();
			const urls = extractSitemapUrls(xml);
			if (urls.length > 0) {
				// Spread samples evenly across the sitemap
				const step = Math.max(1, Math.floor(urls.length / SAMPLE_SIZE));
				const sampled: string[] = [];
				for (
					let i = 0;
					i < urls.length && sampled.length < SAMPLE_SIZE;
					i += step
				) {
					sampled.push(urls[i]);
				}
				return sampled;
			}
		} catch {
			// Sitemap not available, continue
		}
	}

	// 3. Last resort: try sitemap index → find a product sitemap
	try {
		const resp = await fetch(`${origin}/sitemap.xml`, {
			headers: {
				"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (resp.ok) {
			const xml = await resp.text();
			const sitemaps = extractSitemapUrls(xml);
			const productSitemap = sitemaps.find((s) => /product/i.test(s));
			if (productSitemap) {
				const resp2 = await fetch(productSitemap, {
					headers: {
						"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
					},
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				});
				if (resp2.ok) {
					const xml2 = await resp2.text();
					const urls = extractSitemapUrls(xml2);
					if (urls.length > 0) {
						const step = Math.max(1, Math.floor(urls.length / SAMPLE_SIZE));
						const sampled: string[] = [];
						for (
							let i = 0;
							i < urls.length && sampled.length < SAMPLE_SIZE;
							i += step
						) {
							sampled.push(urls[i]);
						}
						return sampled;
					}
				}
			}
		}
	} catch {
		// Sitemap index not available
	}

	// Merge whatever we found from crawl
	return fromCrawl.slice(0, SAMPLE_SIZE);
}

interface JsonLdSample {
	sampled: number;
	withJsonLd: number;
	types: string[];
}

/**
 * Fetch a sample of PDP URLs and check for JSON-LD presence using extractSeoMeta.
 */
async function sampleJsonLd(pdpUrls: string[]): Promise<JsonLdSample> {
	const types = new Set<string>();
	let withJsonLd = 0;

	const results = await Promise.allSettled(
		pdpUrls.map(async (pdpUrl) => {
			const resp = await fetch(pdpUrl, {
				headers: {
					"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
					accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!resp.ok) return null;
			const html = await resp.text();
			return extractSeoMeta(html);
		}),
	);

	for (const r of results) {
		if (r.status !== "fulfilled" || !r.value) continue;
		const ldTypes = r.value["json-ld:types"];
		if (ldTypes) {
			withJsonLd++;
			for (const t of ldTypes.split(", ")) {
				types.add(t.trim());
			}
		}
	}

	return {
		sampled: pdpUrls.length,
		withJsonLd,
		types: [...types],
	};
}

// ── Schemas ────────────────────────────────────────────────

export const auditSeoInputSchema = z.object({
	url: urlInput.describe("The site URL to audit (domain will be extracted)"),
	maxPages: z
		.number()
		.max(1000)
		.default(100)
		.describe("Maximum pages to crawl"),
});

export type AuditSeoInput = z.infer<typeof auditSeoInputSchema>;

export const auditSeoOutputSchema = z.object({
	url: z.string(),
	crawlStatus: z.string(),
	totalPagesCrawled: z.number(),
	onpageScore: z.number(),
	domainInfo: z.object({
		cms: z.string().nullable().optional(),
		ssl: z.boolean(),
		sitemap: z.boolean(),
		robotsTxt: z.boolean(),
		http2: z.boolean(),
	}),
	issues: z.array(
		z.object({
			type: z.string(),
			count: z.number(),
			severity: z.enum(["critical", "medium", "low"]),
		}),
	),
	contentStats: z.object({
		avgWordCount: z.number(),
		pagesWithStructuredData: z.number(),
		pagesWithMetaDescription: z.number(),
		pagesWithoutMetaDescription: z.number(),
		pagesWithoutH1: z.number(),
		totalInternalLinks: z.number(),
		totalBlogPosts: z.number(),
	}),
	onPageSignals: z.array(
		z.object({
			label: z.string(),
			value: z.string(),
			status: z.enum(["pass", "warn", "fail"]),
		}),
	),
	error: z.string().optional(),
});

export type AuditSeoOutput = z.infer<typeof auditSeoOutputSchema>;

// ── Tool Definition ────────────────────────────────────────

export const auditSeoTool = (_env: Env) =>
	createTool({
		id: "audit_seo",
		description:
			"Deep SEO audit using DataForSEO's on-page crawler. Crawls up to 1000 pages and returns: " +
			"SEO score, broken links, duplicate titles/descriptions, missing meta tags, missing H1, " +
			"pages without JSON-LD, content word counts, domain info (CMS, SSL, sitemap, HTTP/2). " +
			"Use for: quantifying SEO issues at scale across the ENTIRE site (not just sample pages). " +
			"Takes 1-3 minutes to complete (polls until crawl finishes).",
		inputSchema: auditSeoInputSchema,
		outputSchema: auditSeoOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages } = context;

			try {
				// Strip protocol and www for DataForSEO target
				const target = url
					.replace(/^https?:\/\//, "")
					.replace(/^www\./, "")
					.replace(/\/$/, "");

				// Submit crawl task
				const taskId = await onPageTaskPost(target, maxPages);

				// Poll until complete (max 3 minutes)
				const summary = await pollOnPageTask(taskId, 180_000);

				// Fetch per-page data
				const pages = await onPagePages(taskId, 100);

				// Aggregate issues
				const pm = summary.pageMetrics;
				const issues: AuditSeoOutput["issues"] = [];

				if (pm.brokenLinks > 0)
					issues.push({
						type: "Broken links",
						count: pm.brokenLinks,
						severity: "critical",
					});
				if (pm.duplicateTitle > 0)
					issues.push({
						type: "Duplicate title tags",
						count: pm.duplicateTitle,
						severity: "medium",
					});
				if (pm.duplicateDescription > 0)
					issues.push({
						type: "Duplicate meta descriptions",
						count: pm.duplicateDescription,
						severity: "medium",
					});
				if (pm.duplicateContent > 0)
					issues.push({
						type: "Duplicate content pages",
						count: pm.duplicateContent,
						severity: "medium",
					});
				if (pm.nonIndexable > 0)
					issues.push({
						type: "Non-indexable pages",
						count: pm.nonIndexable,
						severity: "medium",
					});
				if (pm.brokenResources > 0)
					issues.push({
						type: "Broken resources (images, scripts)",
						count: pm.brokenResources,
						severity: "low",
					});

				// Page-level aggregations
				const pagesWithNoH1 = pages.filter((p) => p.checks.no_h1_tag).length;
				if (pagesWithNoH1 > 0)
					issues.push({
						type: "Pages missing H1 tag",
						count: pagesWithNoH1,
						severity: "medium",
					});

				const pagesWithoutMeta = pages.filter(
					(p) => !p.meta.description,
				).length;
				if (pagesWithoutMeta > 0)
					issues.push({
						type: "Pages missing meta description",
						count: pagesWithoutMeta,
						severity: "medium",
					});

				// Content stats
				const htmlPages = pages.filter(
					(p) => p.statusCode >= 200 && p.statusCode < 400,
				);
				const totalWordCount = htmlPages.reduce(
					(sum, p) => sum + p.content.plainTextWordCount,
					0,
				);
				const avgWordCount =
					htmlPages.length > 0
						? Math.round(totalWordCount / htmlPages.length)
						: 0;
				const pagesWithMetaDescription = pages.filter(
					(p) => p.meta.description,
				).length;
				const blogPages = pages.filter((p) => p.url.includes("/blog"));

				// Structured data: DataForSEO's has_json_ld is unreliable
				// (misses many sites). Always supplement with our own PDP sampling.
				const dfsPagesWithSD = pages.filter(
					(p) => p.checks.has_microdata || p.checks.has_json_ld,
				).length;

				let pagesWithStructuredData = dfsPagesWithSD;
				let structuredDataValue: string;
				let structuredDataStatus: "pass" | "warn" | "fail";

				if (dfsPagesWithSD > 0) {
					// DataForSEO already found structured data — trust it
					structuredDataValue = `Found on ${dfsPagesWithSD}/${pages.length} pages`;
					structuredDataStatus = "pass";
				} else {
					// DataForSEO says 0 — verify by sampling product pages ourselves
					const origin = new URL(url).origin;
					const pdpUrls = await findPdpUrls(pages, origin);

					if (pdpUrls.length > 0) {
						const sample = await sampleJsonLd(pdpUrls);
						if (sample.withJsonLd > 0) {
							pagesWithStructuredData = sample.withJsonLd;
							const typeStr = sample.types.join(", ");
							structuredDataValue = `Found on ${sample.withJsonLd}/${sample.sampled} sampled PDPs (${typeStr})`;
							structuredDataStatus = "pass";
						} else {
							structuredDataValue = `Not found (sampled ${sample.sampled} PDPs)`;
							structuredDataStatus = "fail";
						}
					} else {
						structuredDataValue = "No structured data found";
						structuredDataStatus = "fail";
					}
				}

				// On-page signals
				const onPageSignals: AuditSeoOutput["onPageSignals"] = [
					{
						label: "SSL / HTTPS",
						value: summary.domainInfo.ssl ? "Enabled" : "Not enabled",
						status: summary.domainInfo.ssl ? "pass" : "fail",
					},
					{
						label: "XML Sitemap",
						value: summary.domainInfo.sitemap ? "Found" : "Not found",
						status: summary.domainInfo.sitemap ? "pass" : "fail",
					},
					{
						label: "Robots.txt",
						value: summary.domainInfo.robotsTxt ? "Found" : "Not found",
						status: summary.domainInfo.robotsTxt ? "pass" : "fail",
					},
					{
						label: "HTTP/2",
						value: summary.domainInfo.http2 ? "Supported" : "Not supported",
						status: summary.domainInfo.http2 ? "pass" : "warn",
					},
					{
						label: "Structured Data",
						value: structuredDataValue,
						status: structuredDataStatus,
					},
					{
						label: "Average Word Count",
						value: `${avgWordCount} words/page`,
						status:
							avgWordCount >= 1000
								? "pass"
								: avgWordCount >= 500
									? "warn"
									: "fail",
					},
				];

				return {
					url,
					crawlStatus: summary.crawlProgress,
					totalPagesCrawled: summary.domainInfo.totalPages,
					onpageScore: pm.onpageScore,
					domainInfo: {
						cms: summary.domainInfo.cms,
						ssl: summary.domainInfo.ssl,
						sitemap: summary.domainInfo.sitemap,
						robotsTxt: summary.domainInfo.robotsTxt,
						http2: summary.domainInfo.http2,
					},
					issues,
					contentStats: {
						avgWordCount,
						pagesWithStructuredData,
						pagesWithMetaDescription,
						pagesWithoutMetaDescription: pagesWithoutMeta,
						pagesWithoutH1: pagesWithNoH1,
						totalInternalLinks: pm.linksInternal,
						totalBlogPosts: blogPages.length,
					},
					onPageSignals,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					crawlStatus: "error",
					totalPagesCrawled: 0,
					onpageScore: 0,
					domainInfo: {
						ssl: false,
						sitemap: false,
						robotsTxt: false,
						http2: false,
					},
					issues: [],
					contentStats: {
						avgWordCount: 0,
						pagesWithStructuredData: 0,
						pagesWithMetaDescription: 0,
						pagesWithoutMetaDescription: 0,
						pagesWithoutH1: 0,
						totalInternalLinks: 0,
						totalBlogPosts: 0,
					},
					onPageSignals: [],
					error: msg,
				};
			}
		},
	});
