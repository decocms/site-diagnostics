import {
	keywordsForKeywords,
	serpLive,
} from "../../integrations/dataforseo.ts";
import { researchBusiness } from "../../integrations/perplexity.ts";
import { researchTraffic } from "../../integrations/similarweb.ts";
import type {
	BusinessData,
	DiscoveryResult,
	KeywordData,
	ResearchData,
	SerpData,
	TrafficData,
} from "./types.ts";

// ── Helpers ──────────────────────────────────────────────

/**
 * Extract brand name from homepage title or domain.
 * "Brand Name - Tagline" → "Brand Name"
 */
function extractBrandName(
	homepage: DiscoveryResult["homepage"],
	url: string,
): string {
	const title = homepage.seoMeta?.title || "";
	// Take first segment before common separators
	const brand = title.split(/\s*[|\-–—:]\s*/)[0]?.trim();
	if (brand && brand.length > 1 && brand.length < 40) return brand;
	// Fallback: domain without TLD
	const hostname = new URL(url).hostname.replace(/^www\./, "");
	return hostname.split(".")[0];
}

/**
 * Extract top category names from crawl results for keyword seeds.
 */
function extractCategorySeeds(discovery: DiscoveryResult): string[] {
	const plpUrls = discovery.crawl.sampleUrls.plp;
	const categories: string[] = [];
	for (const plpUrl of plpUrls.slice(0, 5)) {
		try {
			const segments = new URL(plpUrl).pathname.split("/").filter(Boolean);
			const last = segments[segments.length - 1];
			if (last) categories.push(last.replace(/-/g, " "));
		} catch {
			/* skip */
		}
	}
	return categories.slice(0, 3);
}

/**
 * Determine location/language codes based on domain.
 */
function getLocaleConfig(url: string): {
	locationCode: number;
	languageCode: string;
} {
	if (url.includes(".br")) return { locationCode: 2076, languageCode: "pt" };
	return { locationCode: 2840, languageCode: "en" };
}

// ── Main Step ────────────────────────────────────────────

/**
 * Research step: traffic intelligence, business context, SERP analysis, keywords.
 * All sub-tasks run in parallel for speed.
 */
export async function research(
	url: string,
	discovery: DiscoveryResult,
): Promise<ResearchData> {
	const brandName = extractBrandName(discovery.homepage, url);
	const categorySeeds = extractCategorySeeds(discovery);
	const { locationCode, languageCode } = getLocaleConfig(url);

	// Build keyword seeds: brand + brand+category combinations
	const keywordSeeds = [brandName];
	for (const cat of categorySeeds) {
		keywordSeeds.push(`${brandName} ${cat}`);
	}

	// SERP queries: brand name + brand+top-category
	const serpQueries = [brandName];
	if (categorySeeds[0]) serpQueries.push(`${brandName} ${categorySeeds[0]}`);

	// Run all research in parallel
	const [trafficResult, businessResult, serpResults, keywordsResult] =
		await Promise.all([
			safeTraffic(url),
			safeBusiness(brandName, new URL(url).hostname, categorySeeds[0]),
			Promise.all(
				serpQueries.map((kw) => safeSerp(kw, locationCode, languageCode)),
			),
			safeKeywords(keywordSeeds.slice(0, 5), locationCode, languageCode),
		]);

	return {
		traffic: trafficResult,
		business: businessResult,
		serp: serpResults.filter((s): s is SerpData => s !== null),
		keywords: keywordsResult,
	};
}

// ── Safe Wrappers (non-fatal failures) ───────────────────

async function safeTraffic(url: string): Promise<TrafficData | null> {
	try {
		const results = await researchTraffic([url]);
		const item = results[0];
		if (!item) return null;
		return {
			globalRank: item.globalRank ?? null,
			countryRank: item.countryRank ?? null,
			totalVisits: item.totalVisits ?? null,
			bounceRate: item.bounceRate ?? null,
			pagesPerVisit: item.pagesPerVisit ?? null,
			trafficSources: item.trafficSources,
			topCountries: item.topCountries,
			topKeywords: item.topKeywords.map((kw) => ({
				keyword: kw.keyword,
				searchVolume: kw.searchVolume,
				cpc: kw.cpc,
			})),
			monthlyVisits: item.monthlyVisits,
			aiTraffic: item.aiTraffic,
		};
	} catch {
		return null;
	}
}

async function safeBusiness(
	companyName: string,
	domain: string,
	category?: string,
): Promise<BusinessData | null> {
	try {
		const result = await researchBusiness(companyName, domain, category);
		return {
			summary: result.summary,
			marketPosition: result.marketPosition,
			competitors: result.competitors,
			recentNews: result.recentNews,
			businessContext: result.businessContext,
		};
	} catch {
		return null;
	}
}

async function safeSerp(
	keyword: string,
	locationCode: number,
	languageCode: string,
): Promise<SerpData | null> {
	try {
		const result = await serpLive(keyword, locationCode, languageCode);
		return {
			keyword,
			results: result.results.map((r) => ({
				position: r.position,
				url: r.url,
				title: r.title,
			})),
			relatedSearches: result.relatedSearches,
			peopleAlsoAsk: result.peopleAlsoAsk,
		};
	} catch {
		return null;
	}
}

async function safeKeywords(
	seeds: string[],
	locationCode: number,
	languageCode: string,
): Promise<KeywordData[]> {
	try {
		const results = await keywordsForKeywords(
			seeds,
			locationCode,
			languageCode,
		);
		return results.map((kw) => ({
			keyword: kw.keyword,
			volume: kw.volume,
			difficulty: kw.difficulty,
			cpc: kw.cpc,
			competition: kw.competition,
			monthlyTrends: kw.monthlySearches.map((m) => ({
				year: m.year,
				month: m.month,
				volume: m.searchVolume,
			})),
		}));
	} catch {
		return [];
	}
}
