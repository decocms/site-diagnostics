/**
 * Google PageSpeed Insights API + Chrome UX Report (CrUX) API clients.
 *
 * Both APIs require a single Google Cloud API key with these enabled:
 *   - Chrome UX Report API
 *   - PageSpeed Insights API
 *
 * Set GOOGLE_PAGESPEED_API_KEY in the environment.
 */

const CRUX_API = "https://chromeuxreport.googleapis.com/v1/records";
const PSI_API =
	"https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

function getApiKey(): string {
	const key = process.env.GOOGLE_PAGESPEED_API_KEY;
	if (!key) {
		throw new Error(
			"GOOGLE_PAGESPEED_API_KEY environment variable is required. " +
				"Get one from Google Cloud Console with CrUX API and PageSpeed Insights API enabled.",
		);
	}
	return key;
}

// ── CrUX Types ─────────────────────────────────────────────

export type FormFactor = "PHONE" | "DESKTOP" | "ALL_FORM_FACTORS";

export interface CrUXHistogramEntry {
	start: number;
	end?: number;
	density: number;
}

export interface CrUXMetric {
	histogram: CrUXHistogramEntry[];
	percentiles: { p75: number };
}

export interface CrUXRecord {
	lcp?: CrUXMetric;
	inp?: CrUXMetric;
	cls?: CrUXMetric;
	fcp?: CrUXMetric;
	ttfb?: CrUXMetric;
}

export interface CrUXData {
	phone?: CrUXRecord;
	desktop?: CrUXRecord;
	all?: CrUXRecord;
	collectionPeriod: { firstDate: string; lastDate: string };
	hasData: boolean;
}

export interface CrUXHistoryMetric {
	histogramTimeseries: Array<{
		start: number;
		end?: number;
		densities: number[];
	}>;
	percentilesTimeseries: { p75s: number[] };
}

export interface CrUXHistoryRecord {
	lcp?: CrUXHistoryMetric;
	inp?: CrUXHistoryMetric;
	cls?: CrUXHistoryMetric;
	fcp?: CrUXHistoryMetric;
	ttfb?: CrUXHistoryMetric;
}

export interface CrUXHistoryData {
	record: CrUXHistoryRecord;
	collectionPeriods: Array<{ firstDate: string; lastDate: string }>;
}

// ── PageSpeed Types ────────────────────────────────────────

export interface PageSpeedAudit {
	id: string;
	title: string;
	description: string;
	score: number | null;
	displayValue?: string;
	numericValue?: number;
	savingsMs?: number;
	savingsBytes?: number;
}

export interface PageSpeedData {
	url: string;
	strategy: "mobile" | "desktop";
	performanceScore: number;
	labMetrics: {
		fcp: number;
		lcp: number;
		cls: number;
		tbt: number;
		si: number;
		tti: number;
		ttfb: number;
	};
	opportunities: PageSpeedAudit[];
	diagnostics: PageSpeedAudit[];
	fieldData?: CrUXRecord;
	fetchedAt: string;
}

// ── Internal helpers ───────────────────────────────────────

const METRIC_MAP: Record<string, keyof CrUXRecord> = {
	largest_contentful_paint: "lcp",
	interaction_to_next_paint: "inp",
	cumulative_layout_shift: "cls",
	first_contentful_paint: "fcp",
	experimental_time_to_first_byte: "ttfb",
};

function toNumber(v: unknown): number {
	return typeof v === "string" ? Number.parseFloat(v) : (v as number);
}

function mapMetrics(apiMetrics: Record<string, unknown>): CrUXRecord {
	const record: CrUXRecord = {};
	for (const [apiKey, shortKey] of Object.entries(METRIC_MAP)) {
		const m = apiMetrics[apiKey] as
			| {
					histogram: Array<{
						start: unknown;
						end?: unknown;
						density: unknown;
					}>;
					percentiles: { p75: unknown };
			  }
			| undefined;
		if (m) {
			record[shortKey] = {
				histogram: m.histogram.map((h) => ({
					start: toNumber(h.start),
					end: h.end !== undefined ? toNumber(h.end) : undefined,
					density: toNumber(h.density),
				})),
				percentiles: { p75: toNumber(m.percentiles.p75) },
			};
		}
	}
	return record;
}

function mapHistoryMetrics(
	apiMetrics: Record<string, unknown>,
): CrUXHistoryRecord {
	const record: CrUXHistoryRecord = {};
	for (const [apiKey, shortKey] of Object.entries(METRIC_MAP)) {
		const m = apiMetrics[apiKey] as CrUXHistoryMetric | undefined;
		if (m) (record as Record<string, CrUXHistoryMetric>)[shortKey] = m;
	}
	return record;
}

function formatDate(d: { year: number; month: number; day: number }): string {
	return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

// ── CrUX API ───────────────────────────────────────────────

async function fetchCrUXRecord(
	urlOrOrigin: string,
	formFactor?: FormFactor,
	byUrl?: boolean,
): Promise<{
	record: CrUXRecord;
	collectionPeriod?: { firstDate: string; lastDate: string };
} | null> {
	const apiKey = getApiKey();
	const body: Record<string, string> = byUrl
		? { url: urlOrOrigin }
		: { origin: urlOrOrigin };
	if (formFactor && formFactor !== "ALL_FORM_FACTORS") {
		body.formFactor = formFactor;
	}

	const res = await fetch(`${CRUX_API}:queryRecord?key=${apiKey}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (res.status === 404) return null;
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`CrUX API error (${res.status}): ${err}`);
	}

	const data = (await res.json()) as {
		record: {
			metrics: Record<string, unknown>;
			collectionPeriod?: {
				firstDate: { year: number; month: number; day: number };
				lastDate: { year: number; month: number; day: number };
			};
		};
	};

	return {
		record: mapMetrics(data.record.metrics),
		collectionPeriod: data.record.collectionPeriod
			? {
					firstDate: formatDate(data.record.collectionPeriod.firstDate),
					lastDate: formatDate(data.record.collectionPeriod.lastDate),
				}
			: undefined,
	};
}

export async function fetchCrUXData(
	urlOrOrigin: string,
	byUrl = false,
): Promise<CrUXData> {
	const [phone, desktop, all] = await Promise.all([
		fetchCrUXRecord(urlOrOrigin, "PHONE", byUrl).catch(() => null),
		fetchCrUXRecord(urlOrOrigin, "DESKTOP", byUrl).catch(() => null),
		fetchCrUXRecord(urlOrOrigin, undefined, byUrl).catch(() => null),
	]);

	const collectionPeriod = all?.collectionPeriod ??
		phone?.collectionPeriod ??
		desktop?.collectionPeriod ?? { firstDate: "", lastDate: "" };

	return {
		phone: phone?.record,
		desktop: desktop?.record,
		all: all?.record,
		collectionPeriod,
		hasData: !!(phone || desktop || all),
	};
}

export async function fetchCrUXHistory(
	urlOrOrigin: string,
	formFactor: FormFactor = "PHONE",
	byUrl = false,
): Promise<CrUXHistoryData | null> {
	const apiKey = getApiKey();
	const body: Record<string, string> = byUrl
		? { url: urlOrOrigin }
		: { origin: urlOrOrigin };
	if (formFactor !== "ALL_FORM_FACTORS") {
		body.formFactor = formFactor;
	}

	const res = await fetch(`${CRUX_API}:queryHistoryRecord?key=${apiKey}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (res.status === 404) return null;
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`CrUX History API error (${res.status}): ${err}`);
	}

	const data = (await res.json()) as {
		record: {
			metrics: Record<string, unknown>;
			collectionPeriods: Array<{
				firstDate: { year: number; month: number; day: number };
				lastDate: { year: number; month: number; day: number };
			}>;
		};
	};

	return {
		record: mapHistoryMetrics(data.record.metrics),
		collectionPeriods: data.record.collectionPeriods.map((cp) => ({
			firstDate: formatDate(cp.firstDate),
			lastDate: formatDate(cp.lastDate),
		})),
	};
}

// ── PageSpeed Insights API ─────────────────────────────────

function extractAudit(
	audits: Record<string, unknown>,
	id: string,
): PageSpeedAudit | null {
	const a = audits[id] as
		| {
				id: string;
				title: string;
				description: string;
				score: number | null;
				displayValue?: string;
				numericValue?: number;
				details?: {
					overallSavingsMs?: number;
					overallSavingsBytes?: number;
				};
		  }
		| undefined;
	if (!a) return null;
	return {
		id: a.id,
		title: a.title,
		description: a.description,
		score: a.score,
		displayValue: a.displayValue,
		numericValue: a.numericValue,
		savingsMs: a.details?.overallSavingsMs,
		savingsBytes: a.details?.overallSavingsBytes,
	};
}

function getNumeric(audits: Record<string, unknown>, id: string): number {
	const a = audits[id] as { numericValue?: number } | undefined;
	return a?.numericValue ?? 0;
}

export async function fetchPageSpeed(
	url: string,
	strategy: "mobile" | "desktop" = "mobile",
): Promise<PageSpeedData> {
	const apiKey = getApiKey();
	const params = new URLSearchParams({
		url,
		key: apiKey,
		strategy,
		category: "performance",
	});

	const res = await fetch(`${PSI_API}?${params}`);
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`PageSpeed API error (${res.status}): ${err}`);
	}

	const data = (await res.json()) as {
		id: string;
		lighthouseResult: {
			categories: { performance: { score: number } };
			audits: Record<string, unknown>;
		};
		loadingExperience?: { metrics?: Record<string, unknown> };
	};

	const audits = data.lighthouseResult.audits;
	const performanceScore = Math.round(
		(data.lighthouseResult.categories.performance.score ?? 0) * 100,
	);

	const labMetrics = {
		fcp: getNumeric(audits, "first-contentful-paint"),
		lcp: getNumeric(audits, "largest-contentful-paint"),
		cls: getNumeric(audits, "cumulative-layout-shift"),
		tbt: getNumeric(audits, "total-blocking-time"),
		si: getNumeric(audits, "speed-index"),
		tti: getNumeric(audits, "interactive"),
		ttfb: getNumeric(audits, "server-response-time"),
	};

	const opportunities: PageSpeedAudit[] = [];
	const diagnostics: PageSpeedAudit[] = [];

	for (const key of Object.keys(audits)) {
		const audit = extractAudit(audits, key);
		if (!audit) continue;
		if ((audit.savingsMs ?? 0) > 0 || (audit.savingsBytes ?? 0) > 0) {
			opportunities.push(audit);
		} else if (audit.score !== null && audit.score < 1) {
			diagnostics.push(audit);
		}
	}
	opportunities.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));

	return {
		url: data.id,
		strategy,
		performanceScore,
		labMetrics,
		opportunities: opportunities.slice(0, 20),
		diagnostics: diagnostics.slice(0, 20),
		fetchedAt: new Date().toISOString(),
	};
}

// ── Rating helpers ─────────────────────────────────────────

export const CWV_THRESHOLDS = {
	lcp: { good: 2500, poor: 4000, unit: "ms", label: "LCP" },
	inp: { good: 200, poor: 500, unit: "ms", label: "INP" },
	cls: { good: 0.1, poor: 0.25, unit: "", label: "CLS" },
	fcp: { good: 1800, poor: 3000, unit: "ms", label: "FCP" },
	ttfb: { good: 800, poor: 1800, unit: "ms", label: "TTFB" },
} as const;

export type CWVMetric = keyof typeof CWV_THRESHOLDS;
export type Rating = "good" | "needs-improvement" | "poor";

export function rateMetric(name: CWVMetric, value: number): Rating {
	const t = CWV_THRESHOLDS[name];
	if (value <= t.good) return "good";
	if (value <= t.poor) return "needs-improvement";
	return "poor";
}

export function passesCWV(crux: CrUXRecord): boolean {
	const lcp = crux.lcp?.percentiles.p75;
	const inp = crux.inp?.percentiles.p75;
	const cls = crux.cls?.percentiles.p75;
	if (lcp === undefined || inp === undefined || cls === undefined) return false;
	return (
		rateMetric("lcp", lcp) === "good" &&
		rateMetric("inp", inp) === "good" &&
		rateMetric("cls", cls) === "good"
	);
}
