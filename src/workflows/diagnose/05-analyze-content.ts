import { uploadScreenshot } from "../../../api/lib/storage.ts";
import { screenshot } from "../../integrations/browserless.ts";
import { firecrawlScrape } from "../../integrations/firecrawl.ts";
import type {
	ContentData,
	DiscoveryResult,
	EditorialScrape,
	PdpScrape,
	SampleSet,
	ScreenshotData,
} from "./types.ts";

// ── Helpers ──────────────────────────────────────────────

const REVIEW_PATTERNS = [
	/review/i,
	/avalia[çc][ãa]o/i,
	/rating/i,
	/stars?/i,
	/estrela/i,
	/customer.?feedback/i,
	/opini[oõ]/i,
];

const CROSS_SELL_PATTERNS = [
	/related.?product/i,
	/you.?may.?also/i,
	/recommend/i,
	/compre.?junto/i,
	/quem.?comprou/i,
	/similar.?product/i,
	/frequently.?bought/i,
	/cross.?sell/i,
];

function hasPattern(text: string, patterns: RegExp[]): boolean {
	return patterns.some((re) => re.test(text));
}

function extractJsonLdTypes(markdown: string): string[] {
	// Look for JSON-LD mentions in scrape markdown (Firecrawl typically captures them)
	const types = new Set<string>();
	const matches = markdown.match(/"@type"\s*:\s*"([^"]+)"/g);
	if (matches) {
		for (const m of matches) {
			const type = m.match(/"@type"\s*:\s*"([^"]+)"/)?.[1];
			if (type) types.add(type);
		}
	}
	return [...types];
}

function countImages(markdown: string): { total: number; withAlts: number } {
	const imageRegex = /!\[([^\]]*)\]\([^)]+\)/g;
	let total = 0;
	let withAlts = 0;
	let match: RegExpExecArray | null = imageRegex.exec(markdown);
	while (match !== null) {
		total++;
		if (match[1]?.trim()) withAlts++;
		match = imageRegex.exec(markdown);
	}
	return { total, withAlts };
}

async function uploadFn(buf: Buffer, filename: string): Promise<string> {
	await uploadScreenshot(buf, filename);
	return `/api/screenshots/${filename}`;
}

// ── PDP Analysis ─────────────────────────────────────────

async function scrapePdp(url: string): Promise<PdpScrape> {
	try {
		const result = await firecrawlScrape(url, { formats: ["markdown"] });
		const md = result.markdown;
		const jsonLdTypes = extractJsonLdTypes(md);
		const images = countImages(md);

		return {
			url,
			hasReviews: hasPattern(md, REVIEW_PATTERNS),
			hasCrossSell: hasPattern(md, CROSS_SELL_PATTERNS),
			hasJsonLd: jsonLdTypes.length > 0,
			jsonLdTypes,
			descriptionLength: md.length,
			imageCount: images.total,
			imageAlts: images.withAlts,
		};
	} catch {
		return {
			url,
			hasReviews: false,
			hasCrossSell: false,
			hasJsonLd: false,
			jsonLdTypes: [],
			descriptionLength: 0,
			imageCount: 0,
			imageAlts: 0,
		};
	}
}

// ── Editorial Analysis ───────────────────────────────────

async function scrapeEditorial(url: string): Promise<EditorialScrape> {
	try {
		const result = await firecrawlScrape(url, { formats: ["markdown"] });
		const md = result.markdown;
		const wordCount = md.split(/\s+/).filter(Boolean).length;

		// Extract publish date from markdown (look for common patterns)
		const dateMatch = md.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/);
		const publishDate = dateMatch?.[0] ?? null;

		const hasAuthor = /(?:author|autor|escrito por|written by|por\s)/i.test(md);
		const hasSeoMeta = !!(result.metadata.title && result.metadata.description);

		return { url, wordCount, publishDate, hasAuthor, hasSeoMeta };
	} catch {
		return {
			url,
			wordCount: 0,
			publishDate: null,
			hasAuthor: false,
			hasSeoMeta: false,
		};
	}
}

// ── Main Step ────────────────────────────────────────────

/**
 * Content analysis: scrape PDPs and editorial pages, detect reviews,
 * cross-sell, JSON-LD, and take screenshots of key pages.
 */
export async function analyzeContent(
	samples: SampleSet,
	discovery: DiscoveryResult,
): Promise<ContentData> {
	// Select up to 5 PDPs (from samples + discovery)
	const pdpUrls = [...samples.pdps];
	for (const url of discovery.crawl.sampleUrls.pdp) {
		if (pdpUrls.length >= 5) break;
		if (!pdpUrls.includes(url)) pdpUrls.push(url);
	}

	// Select editorial pages
	const editorialUrls = samples.editorial.slice(0, 2);

	// Screenshot one PDP
	const screenshotUrl = pdpUrls[0];

	// Run all in parallel
	const [pdpScrapes, editorialScrapes, screenshotResult] = await Promise.all([
		Promise.all(pdpUrls.map(scrapePdp)),
		Promise.all(editorialUrls.map(scrapeEditorial)),
		screenshotUrl
			? screenshot(screenshotUrl, uploadFn, { device: "desktop" })
			: Promise.resolve(null),
	]);

	const screenshots: ScreenshotData[] = [];
	if (screenshotResult) {
		screenshots.push({
			url: screenshotResult.url,
			imageUrl: screenshotResult.imageUrl,
			device: screenshotResult.device,
			blocked: screenshotResult.blocked,
		});
	}

	return { pdpScrapes, editorialScrapes, screenshots };
}
