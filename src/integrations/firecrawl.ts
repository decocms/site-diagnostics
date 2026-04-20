const BASE_URL = "https://api.firecrawl.dev/v1";

function getApiKey(): string {
	const key = process.env.FIRECRAWL_API_KEY;
	if (!key)
		throw new Error("FIRECRAWL_API_KEY environment variable is required");
	return key;
}

function getHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		"Content-Type": "application/json",
	};
}

// ── Types ─────────────────────────────────────────────────

export interface ScrapeMetadata {
	title: string;
	description: string;
	language: string;
	sourceURL: string;
	statusCode: number;
	ogImage: string | null;
	favicon: string | null;
	ogSiteName: string | null;
}

export interface BrandingData {
	logo?: string;
	colors?: {
		primary?: string;
		secondary?: string;
		accent?: string;
		background?: string;
		textPrimary?: string;
		textSecondary?: string;
	};
	fonts?: { family: string }[];
	typography?: {
		fontFamilies?: {
			primary?: string;
			heading?: string;
			code?: string;
		};
	};
	images?: {
		logo?: string;
		favicon?: string;
		ogImage?: string;
	};
}

export interface ScrapeResult {
	markdown: string;
	metadata: ScrapeMetadata;
	branding?: BrandingData;
}

export interface MapResult {
	links: string[];
}

// ── Scrape ────────────────────────────────────────────────

export async function firecrawlScrape(
	url: string,
	options?: {
		formats?: ("markdown" | "html" | "branding")[];
		waitFor?: number;
		timeout?: number;
	},
): Promise<ScrapeResult> {
	const response = await fetch(`${BASE_URL}/scrape`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({
			url,
			formats: options?.formats ?? ["markdown"],
			waitFor: options?.waitFor,
			timeout: options?.timeout ?? 60000,
		}),
		signal: AbortSignal.timeout(90_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Firecrawl scrape error (${response.status}): ${error}`);
	}

	const data = await response.json();

	return {
		markdown: data.data?.markdown ?? "",
		metadata: {
			title: data.data?.metadata?.title ?? "",
			description: data.data?.metadata?.description ?? "",
			language: data.data?.metadata?.language ?? "",
			sourceURL: data.data?.metadata?.sourceURL ?? url,
			statusCode: data.data?.metadata?.statusCode ?? 200,
			ogImage: data.data?.metadata?.ogImage ?? null,
			favicon: data.data?.metadata?.favicon ?? null,
			ogSiteName: data.data?.metadata?.ogSiteName ?? null,
		},
		branding: data.data?.branding ?? undefined,
	};
}

// ── Map (URL Discovery) ──────────────────────────────────

export async function firecrawlMap(
	url: string,
	options?: { limit?: number },
): Promise<MapResult> {
	const response = await fetch(`${BASE_URL}/map`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({
			url,
			limit: options?.limit ?? 500,
		}),
		signal: AbortSignal.timeout(60_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Firecrawl map error (${response.status}): ${error}`);
	}

	const data = await response.json();

	return {
		links: data.links ?? [],
	};
}
