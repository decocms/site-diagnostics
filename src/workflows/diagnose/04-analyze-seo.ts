import {
	type OnPagePageItem,
	onPagePages,
	onPageTaskPost,
	pollOnPageTask,
} from "../../integrations/dataforseo.ts";
import { extractSeoMeta, extractSitemapUrls } from "../../lib/html.ts";
import type { PageMeta, SampleSet, SeoData, SeoIssue } from "./types.ts";

// ── JSON-LD Sampling ──────────────────────────────────────

const PDP_PATTERNS = [
	/\/p$/,
	/\/p\?/,
	/\/product\//,
	/\/products\//,
	/\/dp\//,
	/\/pdp\//,
];
const SAMPLE_SIZE = 5;
const FETCH_TIMEOUT_MS = 10_000;

function isPdpUrl(url: string): boolean {
	return PDP_PATTERNS.some((re) => re.test(url));
}

async function findPdpUrls(
	crawledPages: OnPagePageItem[],
	origin: string,
): Promise<string[]> {
	const fromCrawl = crawledPages.map((p) => p.url).filter(isPdpUrl);
	if (fromCrawl.length >= SAMPLE_SIZE) return fromCrawl.slice(0, SAMPLE_SIZE);

	// Fallback: try product sitemaps
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
			/* Sitemap not available */
		}
	}

	// Last resort: sitemap index
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
		/* Sitemap index not available */
	}

	return fromCrawl.slice(0, SAMPLE_SIZE);
}

async function sampleJsonLd(
	pdpUrls: string[],
): Promise<{ sampled: number; withJsonLd: number; types: string[] }> {
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
			for (const t of ldTypes.split(", ")) types.add(t.trim());
		}
	}

	return { sampled: pdpUrls.length, withJsonLd, types: [...types] };
}

// ── Page Meta Extraction ──────────────────────────────────

async function fetchPageMeta(url: string): Promise<PageMeta> {
	try {
		const resp = await fetch(url, {
			headers: {
				"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
				accept: "text/html,application/xhtml+xml",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!resp.ok)
			return { url, title: null, description: null, canonical: null };
		const html = await resp.text();
		const meta = extractSeoMeta(html);
		return {
			url,
			title: meta.title || null,
			description: meta.description || null,
			canonical: meta.canonical || null,
			jsonLd: meta["json-ld:types"]?.split(", ") ?? [],
			ogTags: Object.fromEntries(
				Object.entries(meta).filter(([k]) => k.startsWith("og:")),
			),
		};
	} catch {
		return { url, title: null, description: null, canonical: null };
	}
}

// ── Main Step ────────────────────────────────────────────

/**
 * SEO analysis: DataForSEO deep crawl + page meta extraction + JSON-LD sampling.
 */
export async function analyzeSeo(
	url: string,
	samples: SampleSet,
): Promise<SeoData> {
	const origin = new URL(url).origin;
	const target = url
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/$/, "");

	// Start SEO crawl and page meta fetches in parallel
	const [taskId, pageMetas] = await Promise.all([
		onPageTaskPost(target, 100),
		Promise.all(
			[samples.homepage, ...samples.pdps, ...samples.plps, ...samples.editorial]
				.filter(Boolean)
				.slice(0, 8)
				.map(fetchPageMeta),
		),
	]);

	// Poll crawl to completion
	const summary = await pollOnPageTask(taskId, 180_000);
	const pages = await onPagePages(taskId, 100);

	// Aggregate issues
	const pm = summary.pageMetrics;
	const issues: SeoIssue[] = [];
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
			type: "Broken resources",
			count: pm.brokenResources,
			severity: "low",
		});

	const pagesWithNoH1 = pages.filter((p) => p.checks.no_h1_tag).length;
	if (pagesWithNoH1 > 0)
		issues.push({
			type: "Pages missing H1 tag",
			count: pagesWithNoH1,
			severity: "medium",
		});
	const pagesWithoutMeta = pages.filter((p) => !p.meta.description).length;
	if (pagesWithoutMeta > 0)
		issues.push({
			type: "Pages missing meta description",
			count: pagesWithoutMeta,
			severity: "medium",
		});

	// Structured data detection (hybrid)
	const dfsPagesWithSD = pages.filter(
		(p) => p.checks.has_microdata || p.checks.has_json_ld,
	).length;
	let structuredDataCoverage = dfsPagesWithSD;

	if (dfsPagesWithSD === 0) {
		const pdpUrls = await findPdpUrls(pages, origin);
		if (pdpUrls.length > 0) {
			const sample = await sampleJsonLd(pdpUrls);
			structuredDataCoverage = sample.withJsonLd;
		}
	}

	// Sitemap health
	const productCount = pages.filter((p) => isPdpUrl(p.url)).length;

	return {
		audit: {
			score: pm.onpageScore,
			brokenLinks: pm.brokenLinks,
			duplicateMeta: pm.duplicateTitle + pm.duplicateDescription,
			missingMetadata: pagesWithoutMeta,
			structuredDataCoverage,
			issues,
		},
		pageMeta: pageMetas,
		sitemapHealth: {
			productCount,
			indexable: summary.domainInfo.sitemap,
			orphanedEstimate: 0,
		},
		domainSignals: {
			ssl: summary.domainInfo.ssl,
			sitemap: summary.domainInfo.sitemap,
			robotsTxt: summary.domainInfo.robotsTxt,
			http2: summary.domainInfo.http2,
			cms: summary.domainInfo.cms,
		},
	};
}
