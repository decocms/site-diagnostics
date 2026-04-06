const BASE_URL = "https://api.dataforseo.com/v3";

function getAuthHeader(): string {
	const apiKey = process.env.DATAFORSEO_API_KEY;
	if (!apiKey)
		throw new Error(
			"DATAFORSEO_API_KEY environment variable is required (format: base64-encoded login:password)",
		);
	// The key can be either base64-encoded or raw login:password
	// Detect by trying to decode — if it decodes to a valid login:password, it's already encoded
	let encoded = apiKey;
	try {
		const decoded = atob(apiKey);
		if (!decoded.includes(":")) {
			encoded = btoa(apiKey);
		}
	} catch {
		encoded = btoa(apiKey);
	}
	return `Basic ${encoded}`;
}

function getHeaders(): Record<string, string> {
	return {
		Authorization: getAuthHeader(),
		"Content-Type": "application/json",
	};
}

// ── Types ─────────────────────────────────────────────────

export interface SerpResult {
	position: number;
	url: string;
	title: string;
	description: string;
	domain: string;
}

export interface SerpOutput {
	results: SerpResult[];
	relatedSearches: string[];
	peopleAlsoAsk: string[];
	aiOverview: string | null;
	totalResults: number;
}

export interface OnPageDomainInfo {
	name: string;
	cms: string | null;
	ip: string | null;
	totalPages: number;
	ssl: boolean;
	sitemap: boolean;
	robotsTxt: boolean;
	http2: boolean;
}

export interface OnPageMetrics {
	onpageScore: number;
	linksExternal: number;
	linksInternal: number;
	duplicateTitle: number;
	duplicateDescription: number;
	duplicateContent: number;
	brokenLinks: number;
	brokenResources: number;
	nonIndexable: number;
}

export interface OnPageSummary {
	crawlProgress: string;
	domainInfo: OnPageDomainInfo;
	pageMetrics: OnPageMetrics;
}

export interface OnPagePageItem {
	url: string;
	statusCode: number;
	onpageScore: number | null;
	meta: {
		title: string | null;
		description: string | null;
		canonical: string | null;
		internalLinksCount: number;
		externalLinksCount: number;
	};
	content: {
		plainTextWordCount: number;
	};
	checks: Record<string, boolean>;
}

export interface KeywordInfo {
	keyword: string;
	volume: number;
	difficulty: number;
	cpc: number;
	competition: string;
	competitionIndex: number;
	monthlySearches: { year: number; month: number; searchVolume: number }[];
}

// ── SERP API ──────────────────────────────────────────────

export async function serpLive(
	keyword: string,
	locationCode = 2076,
	languageCode = "pt",
): Promise<SerpOutput> {
	const response = await fetch(
		`${BASE_URL}/serp/google/organic/live/advanced`,
		{
			method: "POST",
			headers: getHeaders(),
			body: JSON.stringify([
				{
					keyword,
					location_code: locationCode,
					language_code: languageCode,
					depth: 10,
				},
			]),
			signal: AbortSignal.timeout(30_000),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`DataForSEO SERP error (${response.status}): ${error}`);
	}

	const data = await response.json();
	const task = data.tasks?.[0];
	const items = task?.result?.[0]?.items ?? [];

	const results: SerpResult[] = [];
	const relatedSearches: string[] = [];
	const peopleAlsoAsk: string[] = [];
	let aiOverview: string | null = null;

	for (const item of items) {
		if (item.type === "organic") {
			results.push({
				position: item.rank_absolute,
				url: item.url,
				title: item.title,
				description: item.description ?? "",
				domain: item.domain,
			});
		}
		if (item.type === "people_also_ask") {
			for (const q of item.items ?? []) {
				if (q?.title) peopleAlsoAsk.push(q.title);
			}
		}
		if (item.type === "related_searches") {
			for (const q of item.items ?? []) {
				if (typeof q === "string") relatedSearches.push(q);
				else if (q?.title) relatedSearches.push(q.title);
			}
		}
		if (item.type === "ai_overview" && item.markdown) {
			aiOverview = item.markdown;
		}
	}

	return {
		results,
		relatedSearches,
		peopleAlsoAsk,
		aiOverview,
		totalResults: task?.result?.[0]?.total_results ?? 0,
	};
}

// ── On-Page API ───────────────────────────────────────────

export async function onPageTaskPost(
	target: string,
	maxPages = 100,
): Promise<string> {
	const response = await fetch(`${BASE_URL}/on_page/task_post`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify([
			{
				target,
				max_crawl_pages: maxPages,
				enable_content_parsing: true,
			},
		]),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`DataForSEO OnPage task_post error (${response.status}): ${error}`,
		);
	}

	const data = await response.json();
	const taskId = data.tasks?.[0]?.id;
	if (!taskId) throw new Error("DataForSEO OnPage: no task ID returned");
	return taskId;
}

export async function onPageSummary(taskId: string): Promise<OnPageSummary> {
	const response = await fetch(`${BASE_URL}/on_page/summary/${taskId}`, {
		method: "GET",
		headers: getHeaders(),
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`DataForSEO OnPage summary error (${response.status}): ${error}`,
		);
	}

	const data = await response.json();
	const result = data.tasks?.[0]?.result?.[0];

	const di = result?.domain_info ?? {};
	const pm = result?.page_metrics ?? {};

	return {
		crawlProgress: result?.crawl_progress ?? "in_progress",
		domainInfo: {
			name: di.name ?? "",
			cms: di.cms ?? null,
			ip: di.ip ?? null,
			totalPages: di.pages_crawled ?? 0,
			ssl: di.checks?.ssl ?? false,
			sitemap: di.checks?.sitemap ?? false,
			robotsTxt: di.checks?.robots_txt ?? false,
			http2: di.checks?.http2 ?? false,
		},
		pageMetrics: {
			onpageScore: pm.onpage_score ?? 0,
			linksExternal: pm.links_external ?? 0,
			linksInternal: pm.links_internal ?? 0,
			duplicateTitle: pm.duplicate_title ?? 0,
			duplicateDescription: pm.duplicate_description ?? 0,
			duplicateContent: pm.duplicate_content ?? 0,
			brokenLinks: pm.broken_links ?? 0,
			brokenResources: pm.broken_resources ?? 0,
			nonIndexable: pm.non_indexable ?? 0,
		},
	};
}

export async function onPagePages(
	taskId: string,
	limit = 100,
	offset = 0,
): Promise<OnPagePageItem[]> {
	const response = await fetch(`${BASE_URL}/on_page/pages`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify([
			{
				id: taskId,
				limit,
				offset,
				filters: [["resource_type", "=", "html"]],
			},
		]),
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`DataForSEO OnPage pages error (${response.status}): ${error}`,
		);
	}

	const data = await response.json();
	const items = data.tasks?.[0]?.result?.[0]?.items ?? [];

	return items.map(
		// biome-ignore lint/suspicious/noExplicitAny: DataForSEO response
		(item: any): OnPagePageItem => ({
			url: item.url ?? "",
			statusCode: item.status_code ?? 0,
			onpageScore: item.onpage_score ?? null,
			meta: {
				title: item.meta?.title ?? null,
				description: item.meta?.description ?? null,
				canonical: item.meta?.canonical ?? null,
				internalLinksCount: item.meta?.internal_links_count ?? 0,
				externalLinksCount: item.meta?.external_links_count ?? 0,
			},
			content: {
				plainTextWordCount: item.meta?.content?.plain_text_word_count ?? 0,
			},
			checks: item.checks ?? {},
		}),
	);
}

// ── Polling helper ────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export async function pollOnPageTask(
	taskId: string,
	maxWaitMs = 180_000,
): Promise<OnPageSummary> {
	const maxAttempts = Math.ceil(maxWaitMs / POLL_INTERVAL_MS);
	let summary = await onPageSummary(taskId);

	for (
		let i = 0;
		i < maxAttempts && summary.crawlProgress !== "finished";
		i++
	) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		summary = await onPageSummary(taskId);
	}

	return summary;
}

// ── Keywords API ──────────────────────────────────────────

export async function keywordsForKeywords(
	keywords: string[],
	locationCode = 2076,
	languageCode = "pt",
): Promise<KeywordInfo[]> {
	const response = await fetch(
		`${BASE_URL}/keywords_data/google_ads/keywords_for_keywords/live`,
		{
			method: "POST",
			headers: getHeaders(),
			body: JSON.stringify([
				{
					keywords,
					location_code: locationCode,
					language_code: languageCode,
				},
			]),
			signal: AbortSignal.timeout(30_000),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`DataForSEO keywords error (${response.status}): ${error}`);
	}

	const data = await response.json();
	const items = data.tasks?.[0]?.result ?? [];

	// biome-ignore lint/suspicious/noExplicitAny: DataForSEO response
	return items.map((item: any) => ({
		keyword: item.keyword as string,
		volume: (item.search_volume as number) ?? 0,
		difficulty: (item.competition_index as number) ?? 0,
		cpc: (item.cpc as number) ?? 0,
		competition: (item.competition as string) ?? "",
		competitionIndex: (item.competition_index as number) ?? 0,
		monthlySearches: (
			(item.monthly_searches as {
				year: number;
				month: number;
				search_volume: number;
			}[]) ?? []
		).map((m: { year: number; month: number; search_volume: number }) => ({
			year: m.year,
			month: m.month,
			searchVolume: m.search_volume,
		})),
	}));
}
