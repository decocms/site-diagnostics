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

// ── Performance Analysis Step ─────────────────────────────

export interface HarData {
	url: string;
	ttfbMs: number | null;
	totalRequests: number;
	totalKB: number;
	resourceBreakdown?: Record<string, { count: number; bytes: number }>;
	failedRequests?: Array<{ path: string; status: number }>;
	thirdPartyInventory?: Array<{ domain: string; requests: number; kb: number }>;
	cacheHits: number;
	cacheMisses: number;
}

export interface LighthouseData {
	url: string;
	scores: Record<string, number | null>;
	webVitals: {
		lcp: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
		cls: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
		tbt: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
		fcp: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
		si: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
		tti: {
			score: number | null;
			value: number | null;
			display: string | null;
		} | null;
	};
	diagnostics: Array<{
		id: string;
		title: string;
		score: number | null;
		displayValue: string | null;
		numericValue: number | null;
	}>;
}

export interface ScreenshotData {
	url: string;
	imageUrl?: string;
	device: "desktop" | "mobile";
	blocked?: boolean;
}

export interface PerfData {
	hars: HarData[];
	lighthouses: LighthouseData[];
	screenshots: ScreenshotData[];
}

// ── SEO Analysis Step ─────────────────────────────────────

export interface SeoIssue {
	type: string;
	count: number;
	severity: "critical" | "medium" | "low";
}

export interface PageMeta {
	url: string;
	title: string | null;
	description: string | null;
	h1?: string | null;
	canonical: string | null;
	robots?: string | null;
	jsonLd?: string[];
	ogTags?: Record<string, string>;
}

export interface SeoData {
	audit: {
		score: number;
		brokenLinks: number;
		duplicateMeta: number;
		missingMetadata: number;
		structuredDataCoverage: number;
		issues: SeoIssue[];
	};
	pageMeta: PageMeta[];
	sitemapHealth: {
		productCount: number;
		indexable: boolean;
		orphanedEstimate: number;
	};
	domainSignals: {
		ssl: boolean;
		sitemap: boolean;
		robotsTxt: boolean;
		http2: boolean;
		cms: string | null;
	};
}

// ── Content Analysis Step ─────────────────────────────────

export interface PdpScrape {
	url: string;
	hasReviews: boolean;
	hasCrossSell: boolean;
	hasJsonLd: boolean;
	jsonLdTypes: string[];
	descriptionLength: number;
	imageCount: number;
	imageAlts: number;
}

export interface EditorialScrape {
	url: string;
	wordCount: number;
	publishDate: string | null;
	hasAuthor: boolean;
	hasSeoMeta: boolean;
}

export interface ContentData {
	pdpScrapes: PdpScrape[];
	editorialScrapes: EditorialScrape[];
	screenshots: ScreenshotData[];
}

// ── Research Step ─────────────────────────────────────────

export interface TrafficData {
	globalRank: number | null;
	countryRank: number | null;
	totalVisits: number | null;
	bounceRate: number | null;
	pagesPerVisit: number | null;
	trafficSources: Array<{ name: string; share: number }>;
	topCountries: Array<{ country: string; share: number | null }>;
	topKeywords: Array<{
		keyword: string;
		searchVolume: number | null;
		cpc: number | null;
	}>;
	monthlyVisits: Array<{ month: string; visits: number | null }>;
	aiTraffic?: {
		chatgpt: number | null;
		claude: number | null;
		perplexity: number | null;
		gemini: number | null;
		copilot: number | null;
	};
}

export interface BusinessData {
	summary: string;
	marketPosition?: string;
	competitors: string[];
	recentNews: string[];
	businessContext?: string;
}

export interface SerpData {
	keyword: string;
	results: Array<{ position: number; url: string; title: string }>;
	relatedSearches: string[];
	peopleAlsoAsk: string[];
}

export interface KeywordData {
	keyword: string;
	volume: number;
	difficulty: number;
	cpc: number;
	competition: string;
	monthlyTrends: Array<{ year: number; month: number; volume: number }>;
}

export interface ResearchData {
	traffic: TrafficData | null;
	business: BusinessData | null;
	serp: SerpData[];
	keywords: KeywordData[];
}

// ── Proprietary Source Configs ────────────────────────────

export interface CdnConfig {
	endpoint: string;
	token: string;
	domain?: string;
}

export interface HyperDxConfig {
	apiKey: string;
	serviceNames: string[];
}

export interface BigQueryConfig {
	projectId: string;
	dataset: string;
	credentials: Record<string, unknown>;
}

export interface RepoConfig {
	owner: string;
	repo: string;
	token: string;
}

/**
 * Per-org credential bundle stored as JSON in the `org_credentials.creds`
 * column. Each key is optional — orgs configure only the sources they own.
 */
export interface OrgCredentials {
	cdn?: CdnConfig;
	hyperdx?: HyperDxConfig;
	bigquery?: BigQueryConfig;
	repo?: RepoConfig;
}

// ── Proprietary Source Outputs ────────────────────────────

export interface TimeSeriesPoint {
	t: string;
	v: number;
}

export interface CdnData {
	requestsPerSecond: TimeSeriesPoint[];
	topPages: Array<{ path: string; hits: number; avgResponseTimeMs: number }>;
	geoDistribution: Array<{ country: string; percentage: number }>;
	cacheHitRate: number;
	cacheHitByPath: Array<{ pattern: string; hitRate: number }>;
	edgeVsOriginRatio: number;
	ttfbP50: number;
	ttfbP95: number;
	ttfbP99: number;
	errorRate: number;
	errorsByStatus: Array<{ status: number; count: number; topPaths: string[] }>;
	error5xxTrend: TimeSeriesPoint[];
	totalBandwidthGB: number;
	avgResponseSizeKB: number;
}

export interface HyperDxData {
	errorRate: number;
	topErrors: Array<{
		message: string;
		count: number;
		firstSeen: string;
		lastSeen: string;
		service: string;
	}>;
	latency: { p50: number; p95: number; p99: number };
	errorPaths: Array<{ path: string; count: number; statusCode: number }>;
	recentSpikes: Array<{ timestamp: string; metric: string; value: number }>;
}

export interface AnalyticsData {
	bounceByPageType: Record<string, number>;
	conversionFunnel: Array<{ step: string; sessions: number; dropoff: number }>;
	trafficTrend: Array<{
		date: string;
		sessions: number;
		users: number;
		revenue: number | null;
	}>;
	deviceSplit: { desktop: number; mobile: number; tablet: number };
	topLandingPages: Array<{
		path: string;
		sessions: number;
		bounceRate: number;
		avgDuration: number;
		revenue: number | null;
	}>;
	searchConsole: Array<{
		query: string;
		clicks: number;
		impressions: number;
		ctr: number;
		position: number;
	}>;
}

export interface RepoData {
	framework: string | null;
	packageManager: string | null;
	deps: Array<{
		name: string;
		version: string;
		latest: string | null;
		outdated: boolean;
	}>;
	bundleSize: {
		totalKB: number | null;
		byRoute: Array<{ route: string; kb: number }>;
	};
	antiPatterns: Array<{
		file: string;
		line: number;
		pattern: string;
		severity: "high" | "medium" | "low";
		suggestion: string;
	}>;
	recentCommits: Array<{
		sha: string;
		message: string;
		author: string;
		date: string;
	}>;
	openIssues: number;
}
