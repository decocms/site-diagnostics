import { fetchPage } from "../../integrations/fetch.ts";
import { firecrawlMap } from "../../integrations/firecrawl.ts";
import type {
	CrawlResult,
	DiscoveryResult,
	EditorialProbe,
	HomepageResult,
	RobotsResult,
	SitemapResult,
} from "./types.ts";

// ── URL Categorization ────────────────────────────────────

const PDP_PATTERNS = [
	/\/p$/,
	/\/p\?/,
	/\/product\//,
	/\/products\/[^/]+$/,
	/\/dp\//,
	/\/item\//,
	/\/produto\//,
	/\/-\/A-/,
];

const PLP_PATTERNS = [
	/\/c\//,
	/\/collections\//,
	/\/category\//,
	/\/categoria\//,
	/\/departamento\//,
	/\/busca/,
	/\/search/,
	/\/s\?/,
	/\/(masculino|feminino|infantil|unissex)(\/|$)/,
	/\/(calcados|roupas|acessorios|tenis|chinelo|sandalia)(\/|$)/,
	/\/(shoes|clothing|accessories|footwear)(\/|$)/,
	/\/(sale|outlet|lancamentos|novidades|promocao)(\/|$)/,
];

const BLOG_PATTERNS = [
	/\/blog/,
	/\/news/,
	/\/artigo/,
	/\/articles?\//,
	/\/posts?\//,
	/\/magazine/,
	/\/editorial/,
	/\/stories/,
];

const INSTITUTIONAL_PATTERNS = [
	/\/about/,
	/\/sobre/,
	/\/contact/,
	/\/contato/,
	/\/faq/,
	/\/help/,
	/\/ajuda/,
	/\/terms/,
	/\/termos/,
	/\/privacy/,
	/\/politica/,
	/\/institucional/,
	/\/stores?$/,
	/\/lojas?$/,
	/\/work-with-us/,
	/\/trabalhe-conosco/,
];

interface Categories {
	pdp: string[];
	plp: string[];
	blog: string[];
	institutional: string[];
	other: string[];
}

function categorizeUrls(urls: string[]): Categories {
	const categories: Categories = {
		pdp: [],
		plp: [],
		blog: [],
		institutional: [],
		other: [],
	};

	for (const url of urls) {
		const path = url.toLowerCase();

		if (
			/\.(xml|json|css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)(\?|$)/.test(path)
		)
			continue;

		if (PDP_PATTERNS.some((p) => p.test(path))) {
			categories.pdp.push(url);
		} else if (PLP_PATTERNS.some((p) => p.test(path))) {
			categories.plp.push(url);
		} else if (BLOG_PATTERNS.some((p) => p.test(path))) {
			categories.blog.push(url);
		} else if (INSTITUTIONAL_PATTERNS.some((p) => p.test(path))) {
			categories.institutional.push(url);
		} else {
			categories.other.push(url);
		}
	}

	return categories;
}

// ── Platform Detection ────────────────────────────────────

function detectPlatform(
	headers: Record<string, string>,
	body: string,
): string | null {
	const server = headers.server?.toLowerCase() ?? "";
	const powered = headers["x-powered-by"]?.toLowerCase() ?? "";
	const via = headers.via?.toLowerCase() ?? "";

	if (body.includes("vtex") || headers["x-vtex-cache"]) return "vtex";
	if (body.includes("shopify") || server.includes("shopify")) return "shopify";
	if (body.includes("__NEXT_DATA__")) return "next.js";
	if (body.includes("__NUXT__")) return "nuxt";
	if (powered.includes("express")) return "express";
	if (body.includes("deco.cx") || body.includes("deco-sites")) return "deco";
	if (body.includes("magento") || body.includes("Magento")) return "magento";
	if (body.includes("woocommerce") || body.includes("WooCommerce"))
		return "woocommerce";

	if (via.includes("varnish")) return null; // CDN layer, not platform
	return null;
}

function detectCdn(headers: Record<string, string>): string | null {
	const server = headers.server?.toLowerCase() ?? "";
	const via = headers.via?.toLowerCase() ?? "";

	if (headers["cf-ray"] || server.includes("cloudflare")) return "cloudflare";
	if (headers["x-served-by"]?.includes("cache-")) return "fastly";
	if (headers["x-amz-cf-id"] || via.includes("cloudfront")) return "cloudfront";
	if (headers["x-akamai-transformed"] || server.includes("akamai"))
		return "akamai";
	if (via.includes("varnish")) return "varnish";
	if (headers["x-vercel-id"]) return "vercel";
	if (headers["x-netlify-request-id"]) return "netlify";

	return null;
}

// ── Editorial Probing ─────────────────────────────────────

const EDITORIAL_PATHS = [
	"/blog",
	"/editorial",
	"/revista",
	"/conteudo",
	"/magazine",
	"/news",
	"/noticias",
	"/stories",
];

async function probeEditorialPaths(baseUrl: string): Promise<EditorialProbe[]> {
	const origin = new URL(baseUrl).origin;

	const probes = await Promise.all(
		EDITORIAL_PATHS.map(async (path): Promise<EditorialProbe> => {
			const result = await fetchPage(`${origin}${path}`, {
				extractLinks: true,
				maxBodyKB: 64,
				timeoutMs: 10_000,
			});

			const exists = result.status >= 200 && result.status < 400;
			return {
				path,
				exists,
				linkCount: exists ? (result.links?.length ?? 0) : 0,
			};
		}),
	);

	return probes;
}

// ── Sitemap Fetching ──────────────────────────────────────

async function fetchSitemap(baseUrl: string): Promise<SitemapResult> {
	const origin = new URL(baseUrl).origin;
	const result = await fetchPage(`${origin}/sitemap.xml`, {
		extractLinks: false,
		maxBodyKB: 1024,
		timeoutMs: 15_000,
	});

	if (result.status !== 200 || !result.sitemapUrls) {
		return { exists: false, productSitemapUrls: [], totalProductUrls: 0 };
	}

	// If it's a sitemap index, find product sitemaps
	const urls = result.sitemapUrls;
	const productSitemaps = urls.filter(
		(u) =>
			u.includes("product") ||
			u.includes("produto") ||
			u.includes("item") ||
			u.includes("catalog"),
	);

	// If we found product sitemaps in the index, fetch one to count entries
	let totalProductUrls = 0;
	if (productSitemaps.length > 0) {
		const firstProduct = await fetchPage(productSitemaps[0], {
			extractLinks: false,
			maxBodyKB: 2048,
			timeoutMs: 15_000,
		});
		if (firstProduct.sitemapUrls) {
			// Rough estimate: count entries in first product sitemap × number of product sitemaps
			totalProductUrls =
				firstProduct.sitemapUrls.length * productSitemaps.length;
		}
	}

	return {
		exists: true,
		productSitemapUrls: productSitemaps,
		totalProductUrls,
	};
}

// ── Robots.txt Fetching ───────────────────────────────────

async function fetchRobots(baseUrl: string): Promise<RobotsResult> {
	const origin = new URL(baseUrl).origin;
	const result = await fetchPage(`${origin}/robots.txt`, {
		extractLinks: false,
		maxBodyKB: 64,
		timeoutMs: 10_000,
	});

	if (result.status !== 200 || !result.body) {
		return { exists: false, rules: "", sitemapUrls: [] };
	}

	// Extract Sitemap directives from robots.txt
	const sitemapUrls: string[] = [];
	for (const line of result.body.split("\n")) {
		const match = line.match(/^Sitemap:\s*(.+)/i);
		if (match) sitemapUrls.push(match[1].trim());
	}

	return {
		exists: true,
		rules: result.body,
		sitemapUrls,
	};
}

// ── Homepage Fetching ─────────────────────────────────────

async function fetchHomepage(url: string): Promise<HomepageResult> {
	const result = await fetchPage(url, {
		extractLinks: true,
		maxBodyKB: 512,
		timeoutMs: 15_000,
	});

	const headers = result.headers ?? {};
	const body = result.body ?? "";

	return {
		status: result.status,
		headers,
		seoMeta: result.seo ?? {},
		links: result.links ?? [],
		platform: detectPlatform(headers, body),
		cdn: detectCdn(headers),
	};
}

// ── Crawl Site ────────────────────────────────────────────

const MAX_SAMPLE = 10;

async function crawlSite(url: string, maxPages: number): Promise<CrawlResult> {
	const result = await firecrawlMap(url, { limit: maxPages });
	const categories = categorizeUrls(result.links);

	return {
		totalPages: result.links.length,
		pageCounts: {
			pdp: categories.pdp.length,
			plp: categories.plp.length,
			blog: categories.blog.length,
			institutional: categories.institutional.length,
			other: categories.other.length,
		},
		sampleUrls: {
			pdp: categories.pdp.slice(0, MAX_SAMPLE),
			plp: categories.plp.slice(0, MAX_SAMPLE),
			blog: categories.blog.slice(0, MAX_SAMPLE),
			institutional: categories.institutional.slice(0, MAX_SAMPLE),
		},
		allUrls: result.links,
	};
}

// ── Main Entry Point ──────────────────────────────────────

export async function discover(url: string): Promise<DiscoveryResult> {
	const [crawl, sitemap, robots, homepage, editorialPaths] = await Promise.all([
		crawlSite(url, 500),
		fetchSitemap(url),
		fetchRobots(url),
		fetchHomepage(url),
		probeEditorialPaths(url),
	]);

	return {
		crawl,
		sitemap,
		robots,
		homepage,
		editorial: { paths: editorialPaths },
	};
}
