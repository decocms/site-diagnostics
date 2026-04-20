// ── Discovery Step ────────────────────────────────────────

export interface CrawlResult {
	totalPages: number;
	pageCounts: {
		pdp: number;
		plp: number;
		blog: number;
		institutional: number;
		other: number;
	};
	sampleUrls: {
		pdp: string[];
		plp: string[];
		blog: string[];
		institutional: string[];
	};
	allUrls: string[];
}

export interface SitemapResult {
	exists: boolean;
	productSitemapUrls: string[];
	totalProductUrls: number;
}

export interface RobotsResult {
	exists: boolean;
	rules: string;
	sitemapUrls: string[];
}

export interface HomepageResult {
	status: number;
	headers: Record<string, string>;
	seoMeta: Record<string, string>;
	links: string[];
	platform: string | null;
	cdn: string | null;
}

export interface EditorialProbe {
	path: string;
	exists: boolean;
	linkCount: number;
}

export interface DiscoveryResult {
	crawl: CrawlResult;
	sitemap: SitemapResult;
	robots: RobotsResult;
	homepage: HomepageResult;
	editorial: { paths: EditorialProbe[] };
}

// ── Sample Selection Step ─────────────────────────────────

export interface SampleSet {
	homepage: string;
	pdps: string[];
	plps: string[];
	editorial: string[];
}
