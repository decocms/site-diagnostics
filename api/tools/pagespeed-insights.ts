import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const PSI_ENDPOINT =
	"https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 90_000;

// Lighthouse audit IDs we care about surfacing from the Lab result.
const LAB_METRIC_AUDITS = [
	"largest-contentful-paint",
	"cumulative-layout-shift",
	"total-blocking-time",
	"first-contentful-paint",
	"speed-index",
	"interactive",
	"server-response-time",
] as const;

// Audit IDs that Lighthouse classifies as "opportunities" (measurable time
// savings if addressed). Hard-coded rather than scanned from
// lighthouseResult.categories.performance.auditRefs because that grouping
// isn't consistent across Lighthouse versions.
const OPPORTUNITY_AUDIT_IDS = new Set([
	"render-blocking-resources",
	"unused-javascript",
	"unused-css-rules",
	"unminified-javascript",
	"unminified-css",
	"modern-image-formats",
	"uses-optimized-images",
	"uses-responsive-images",
	"offscreen-images",
	"uses-text-compression",
	"uses-long-cache-ttl",
	"total-byte-weight",
	"efficient-animated-content",
	"legacy-javascript",
	"redirects",
	"preload-lcp-image",
]);

// Diagnostics (flagged conditions, not necessarily with time savings).
const DIAGNOSTIC_AUDIT_IDS = new Set([
	"mainthread-work-breakdown",
	"bootup-time",
	"dom-size",
	"critical-request-chains",
	"network-requests",
	"third-party-summary",
	"largest-contentful-paint-element",
	"layout-shifts",
	"long-tasks",
]);

// ── Schemas ────────────────────────────────────────────────

export const pagespeedInsightsInputSchema = z.object({
	url: urlInput.describe("URL to analyze"),
	strategy: z
		.enum(["mobile", "desktop"])
		.default("mobile")
		.describe(
			"Form factor. Mobile is what Google uses for ranking; default mobile unless you have a specific reason to check desktop.",
		),
	categories: z
		.array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
		.default(["performance"])
		.describe(
			"Lighthouse categories to run. More categories = slower. Default: performance only.",
		),
});

export type PagespeedInsightsInput = z.infer<
	typeof pagespeedInsightsInputSchema
>;

const cruxCategorySchema = z
	.enum(["FAST", "AVERAGE", "SLOW", "NONE"])
	.describe(
		"Google's band classification. FAST = Good. AVERAGE = Needs Improvement. SLOW = Poor. NONE = insufficient data.",
	);

const cruxMetricSchema = z.object({
	p75: z
		.number()
		.describe(
			"75th percentile value of real-user measurements in the last 28 days. Units: ms for LCP/FCP/INP/TTFB, unitless for CLS.",
		),
	category: cruxCategorySchema,
});

const cruxMetricsSchema = z.object({
	lcp: cruxMetricSchema.optional(),
	cls: cruxMetricSchema.optional(),
	inp: cruxMetricSchema.optional(),
	fcp: cruxMetricSchema.optional(),
	ttfb: cruxMetricSchema.optional(),
});

const labAuditSchema = z.object({
	numericValue: z.number().optional(),
	displayValue: z.string().optional(),
	score: z.number().nullable().optional(),
});

export const pagespeedInsightsOutputSchema = z.object({
	url: z.string(),
	strategy: z.string(),
	fetchTime: z.string().describe("When the Lab run executed (ISO 8601)"),
	lighthouseVersion: z.string(),

	// Field (CrUX) — the authoritative signal for Google's CWV ranking.
	urlField: cruxMetricsSchema
		.optional()
		.describe("CrUX data for this specific URL over the last 28 days."),
	urlFieldAvailable: z
		.boolean()
		.describe(
			"True when CrUX has enough real-user data for this specific URL. Small/low-traffic pages often lack URL-level data.",
		),
	originField: cruxMetricsSchema
		.optional()
		.describe(
			"CrUX data aggregated across the entire origin. More often available than urlField; use as fallback.",
		),
	originFieldAvailable: z.boolean(),

	// Lab (Lighthouse) — synthetic single-run. Use for opportunities, not for
	// severity classification against user-facing thresholds.
	lab: z.object({
		performanceScore: z.number().nullable(),
		accessibilityScore: z.number().nullable().optional(),
		bestPracticesScore: z.number().nullable().optional(),
		seoScore: z.number().nullable().optional(),
		lcp: labAuditSchema.optional(),
		cls: labAuditSchema.optional(),
		tbt: labAuditSchema.optional(),
		fcp: labAuditSchema.optional(),
		si: labAuditSchema.optional(),
		tti: labAuditSchema.optional(),
		ttfb: labAuditSchema.optional(),
	}),

	opportunities: z
		.array(
			z.object({
				id: z.string(),
				title: z.string(),
				potentialSavingsMs: z.number().optional(),
				potentialSavingsBytes: z.number().optional(),
				score: z.number().nullable().optional(),
				displayValue: z.string().optional(),
			}),
		)
		.describe(
			"Lighthouse opportunities — specific issues with measurable savings if fixed.",
		),

	diagnostics: z
		.array(
			z.object({
				id: z.string(),
				title: z.string(),
				score: z.number().nullable().optional(),
				displayValue: z.string().optional(),
				numericValue: z.number().optional(),
			}),
		)
		.describe(
			"Lighthouse diagnostics — flagged conditions worth investigating (main-thread work, bootup time, DOM size, third parties, etc.).",
		),

	error: z.string().optional(),
});

export type PagespeedInsightsOutput = z.infer<
	typeof pagespeedInsightsOutputSchema
>;

// ── Helpers ────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: PSI responses are loosely typed JSON
type CruxMetric = { percentile?: number; category?: string } | any;
// biome-ignore lint/suspicious/noExplicitAny: PSI responses are loosely typed JSON
type LoadingExperience = { metrics?: Record<string, CruxMetric> } | any;

/**
 * Map a CrUX metric. For CLS, the `percentile` integer stores the CLS value
 * × 100 (so a value of 21 means CLS=0.21) — normalize on read so consumers
 * get the raw CLS float.
 */
function mapCruxMetric(
	metric: CruxMetric | undefined,
	isCls = false,
): z.infer<typeof cruxMetricSchema> | undefined {
	if (!metric || typeof metric.percentile !== "number") return undefined;
	const category = (metric.category as string) ?? "NONE";
	return {
		p75: isCls ? metric.percentile / 100 : metric.percentile,
		category: category as "FAST" | "AVERAGE" | "SLOW" | "NONE",
	};
}

function mapLoadingExperience(exp: LoadingExperience | undefined): {
	metrics: z.infer<typeof cruxMetricsSchema>;
	available: boolean;
} {
	if (!exp?.metrics) return { metrics: {}, available: false };
	const m = exp.metrics;
	const metrics: z.infer<typeof cruxMetricsSchema> = {
		lcp: mapCruxMetric(m.LARGEST_CONTENTFUL_PAINT_MS),
		cls: mapCruxMetric(m.CUMULATIVE_LAYOUT_SHIFT_SCORE, true),
		inp: mapCruxMetric(m.INTERACTION_TO_NEXT_PAINT),
		fcp: mapCruxMetric(m.FIRST_CONTENTFUL_PAINT_MS),
		ttfb: mapCruxMetric(m.EXPERIMENTAL_TIME_TO_FIRST_BYTE),
	};
	const available = Object.values(metrics).some((v) => v !== undefined);
	return { metrics, available };
}

// biome-ignore lint/suspicious/noExplicitAny: Lighthouse audit shape is loose
function mapLabAudit(audit: any): z.infer<typeof labAuditSchema> | undefined {
	if (!audit) return undefined;
	return {
		numericValue: audit.numericValue,
		displayValue: audit.displayValue,
		score: audit.score ?? null,
	};
}

// ── Tool Definition ────────────────────────────────────────

export const pagespeedInsightsTool = (_env: Env) =>
	createTool({
		id: "pagespeed_insights",
		description:
			"Run Google PageSpeed Insights on a URL. Returns both Field (CrUX real-user data — Google's actual Core Web Vitals ranking signal, 28-day p75 aggregates) and Lab (Lighthouse synthetic single-run) metrics. " +
			"Use Field (urlField / originField) for CWV band classification — these are what Google actually assesses for ranking. Use Lab (opportunities, diagnostics) to identify specific fixes. " +
			"Field data may be unavailable for low-traffic URLs (urlFieldAvailable: false); fall back to originField when that happens. Requires PAGESPEED_API_KEY env var for authenticated quota.",
		inputSchema: pagespeedInsightsInputSchema,
		outputSchema: pagespeedInsightsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false, // each call runs a fresh Lab audit; Lab results vary run-to-run
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, strategy, categories } = context;

			try {
				const params = new URLSearchParams();
				params.set("url", url);
				params.set("strategy", strategy);
				for (const cat of categories) params.append("category", cat);
				const apiKey = process.env.PAGESPEED_API_KEY;
				if (apiKey) params.set("key", apiKey);

				const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
					headers: { accept: "application/json" },
					signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
				});

				if (!response.ok) {
					const body = await response.text();
					throw new Error(
						`PageSpeed Insights API error (${response.status}): ${body.slice(0, 500)}`,
					);
				}

				// biome-ignore lint/suspicious/noExplicitAny: PSI response is loose JSON
				const json: any = await response.json();
				const lr = json.lighthouseResult ?? {};
				const audits = (lr.audits ?? {}) as Record<string, unknown>;
				const cats = (lr.categories ?? {}) as Record<string, unknown>;

				const { metrics: urlFieldMetrics, available: urlFieldAvailable } =
					mapLoadingExperience(json.loadingExperience);
				const { metrics: originFieldMetrics, available: originFieldAvailable } =
					mapLoadingExperience(json.originLoadingExperience);

				// biome-ignore lint/suspicious/noExplicitAny: loose score shape
				const scoreOf = (key: string) =>
					((cats[key] as any)?.score as number | null | undefined) ?? null;

				// Opportunities: audits flagged as opportunities by id, with savings.
				const opportunities: PagespeedInsightsOutput["opportunities"] = [];
				for (const [id, audit] of Object.entries(audits)) {
					if (!OPPORTUNITY_AUDIT_IDS.has(id)) continue;
					// biome-ignore lint/suspicious/noExplicitAny: loose audit shape
					const a = audit as any;
					// Only surface ones that actually have room to improve.
					if (a.score === 1) continue;
					const details = a.details ?? {};
					opportunities.push({
						id,
						title: a.title ?? id,
						score: a.score ?? null,
						displayValue: a.displayValue,
						potentialSavingsMs:
							typeof details.overallSavingsMs === "number"
								? details.overallSavingsMs
								: undefined,
						potentialSavingsBytes:
							typeof details.overallSavingsBytes === "number"
								? details.overallSavingsBytes
								: undefined,
					});
				}
				opportunities.sort(
					(a, b) =>
						(b.potentialSavingsMs ?? 0) - (a.potentialSavingsMs ?? 0) ||
						(b.potentialSavingsBytes ?? 0) - (a.potentialSavingsBytes ?? 0),
				);

				const diagnostics: PagespeedInsightsOutput["diagnostics"] = [];
				for (const [id, audit] of Object.entries(audits)) {
					if (!DIAGNOSTIC_AUDIT_IDS.has(id)) continue;
					// biome-ignore lint/suspicious/noExplicitAny: loose audit shape
					const a = audit as any;
					diagnostics.push({
						id,
						title: a.title ?? id,
						score: a.score ?? null,
						displayValue: a.displayValue,
						numericValue:
							typeof a.numericValue === "number" ? a.numericValue : undefined,
					});
				}

				// Surface selected metric audits in a typed lab block.
				// biome-ignore lint/suspicious/noExplicitAny: loose audit shape
				const byId = (id: string) => audits[id] as any;

				return {
					url: lr.finalUrl ?? url,
					strategy,
					fetchTime: lr.fetchTime ?? new Date().toISOString(),
					lighthouseVersion: lr.lighthouseVersion ?? "unknown",

					urlField: urlFieldAvailable ? urlFieldMetrics : undefined,
					urlFieldAvailable,
					originField: originFieldAvailable ? originFieldMetrics : undefined,
					originFieldAvailable,

					lab: {
						performanceScore: scoreOf("performance"),
						accessibilityScore: scoreOf("accessibility"),
						bestPracticesScore: scoreOf("best-practices"),
						seoScore: scoreOf("seo"),
						lcp: mapLabAudit(byId("largest-contentful-paint")),
						cls: mapLabAudit(byId("cumulative-layout-shift")),
						tbt: mapLabAudit(byId("total-blocking-time")),
						fcp: mapLabAudit(byId("first-contentful-paint")),
						si: mapLabAudit(byId("speed-index")),
						tti: mapLabAudit(byId("interactive")),
						ttfb: mapLabAudit(byId("server-response-time")),
					},

					opportunities,
					diagnostics,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					strategy,
					fetchTime: new Date().toISOString(),
					lighthouseVersion: "unknown",
					urlFieldAvailable: false,
					originFieldAvailable: false,
					lab: { performanceScore: null },
					opportunities: [],
					diagnostics: [],
					error: msg,
				};
			}
		},
	});

// Kept for any future callers / tests.
export { LAB_METRIC_AUDITS };
