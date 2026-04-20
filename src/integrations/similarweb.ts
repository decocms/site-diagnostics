const BASE_URL = "https://api.apify.com/v2";

function getApiToken(): string {
	const token = process.env.APIFY_API_TOKEN;
	if (!token)
		throw new Error("APIFY_API_TOKEN environment variable is required");
	return token;
}

// ── Types ─────────────────────────────────────────────────

export interface TrafficSource {
	name: string;
	share: number;
}

export interface KeywordData {
	keyword: string;
	searchVolume: number | null;
	cpc: number | null;
	estimatedValue: number | null;
}

export interface MonthlyVisit {
	month: string;
	visits: number | null;
}

export interface CountryShare {
	country: string;
	share: number | null;
}

export interface AiTraffic {
	chatgpt: number | null;
	claude: number | null;
	perplexity: number | null;
	gemini: number | null;
	copilot: number | null;
}

export interface TrafficResult {
	url: string;
	domain: string;
	title?: string | null;
	globalRank?: number | null;
	countryRank?: number | null;
	country?: string | null;
	category?: string | null;
	categoryRank?: number | null;
	totalVisits?: number | null;
	bounceRate?: number | null;
	pagesPerVisit?: number | null;
	avgVisitDurationSecs?: number | null;
	trafficSources: TrafficSource[];
	topCountries: CountryShare[];
	topKeywords: KeywordData[];
	monthlyVisits: MonthlyVisit[];
	aiTraffic?: AiTraffic;
}

// ── Apify Actor Shape ─────────────────────────────────────

interface SimilarwebItem {
	searchUrl?: string;
	url?: string;
	domain?: string;
	title?: string;
	rankGlobal?: number;
	countryRank?: number;
	country?: string;
	category?: string;
	categoryRank?: number;
	totalVisits?: number;
	bounceRate?: number;
	pagesPerVisit?: number;
	timeOnSite?: number;
	directTraffic?: number;
	searchTraffic?: number;
	socialTraffic?: number;
	referralTraffic?: number;
	mailTraffic?: number;
	paidReferralsTraffic?: number;
	countryShare?: Array<{ country: string; share: number }>;
	topKeywords?: Array<{
		keyword: string;
		searchVolume?: number;
		cpc?: number;
		estimatedValue?: number;
	}>;
	monthlyVisits?: Array<{ month: string; visits: number }>;
	aiTrafficShareChatgpt?: number | null;
	aiTrafficShareClaude?: number | null;
	aiTrafficSharePerplexity?: number | null;
	aiTrafficShareGemini?: number | null;
	aiTrafficShareCopilot?: number | null;
}

// ── Public API ────────────────────────────────────────────

export async function researchTraffic(
	urls: string[],
): Promise<TrafficResult[]> {
	const token = getApiToken();
	const actorId = "radeance~similarweb-scraper";

	const res = await fetch(
		`${BASE_URL}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeoutSecs=120`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				urls,
				include_similar_sites: false,
				include_indepth_data: false,
			}),
		},
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Apify Similarweb actor failed (${res.status}): ${text}`);
	}

	const items: SimilarwebItem[] = await res.json();

	return items.map((item) => ({
		url: item.searchUrl ?? item.url ?? "",
		domain: item.domain ?? "",
		title: item.title,
		globalRank: item.rankGlobal,
		countryRank: item.countryRank,
		country: item.country,
		category: item.category,
		categoryRank: item.categoryRank,
		totalVisits: item.totalVisits,
		bounceRate: item.bounceRate,
		pagesPerVisit: item.pagesPerVisit,
		avgVisitDurationSecs: item.timeOnSite,
		trafficSources: [
			{ name: "direct", share: item.directTraffic ?? 0 },
			{ name: "search", share: item.searchTraffic ?? 0 },
			{ name: "social", share: item.socialTraffic ?? 0 },
			{ name: "referral", share: item.referralTraffic ?? 0 },
			{ name: "mail", share: item.mailTraffic ?? 0 },
			{ name: "paid", share: item.paidReferralsTraffic ?? 0 },
		].filter((s) => s.share > 0),
		topCountries: item.countryShare ?? [],
		topKeywords: (item.topKeywords ?? []).map((kw) => ({
			keyword: kw.keyword,
			searchVolume: kw.searchVolume ?? null,
			cpc: kw.cpc ?? null,
			estimatedValue: kw.estimatedValue ?? null,
		})),
		monthlyVisits: item.monthlyVisits ?? [],
		aiTraffic:
			item.aiTrafficShareChatgpt != null ||
			item.aiTrafficShareClaude != null ||
			item.aiTrafficSharePerplexity != null
				? {
						chatgpt: item.aiTrafficShareChatgpt ?? null,
						claude: item.aiTrafficShareClaude ?? null,
						perplexity: item.aiTrafficSharePerplexity ?? null,
						gemini: item.aiTrafficShareGemini ?? null,
						copilot: item.aiTrafficShareCopilot ?? null,
					}
				: undefined,
	}));
}
