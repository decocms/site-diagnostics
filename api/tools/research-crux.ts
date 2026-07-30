import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	fetchCrUXData,
	fetchCrUXHistory,
	passesCWV,
	rateMetric,
} from "../lib/pagespeed.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchCruxInputSchema = z.object({
	url: urlInput.describe(
		"Origin URL to fetch CrUX data for (e.g. https://www.example.com)",
	),
	byUrl: z
		.boolean()
		.default(false)
		.describe(
			"If true, fetch data for exact URL. If false (default), fetch origin-level data (more likely to have data).",
		),
	includeHistory: z
		.boolean()
		.default(true)
		.describe(
			"If true, also fetch 25-week historical trends for sparkline analysis.",
		),
});

export type ResearchCruxInput = z.infer<typeof researchCruxInputSchema>;

const histogramEntrySchema = z.object({
	start: z.number(),
	end: z.number().optional(),
	density: z.number(),
});

const cruxMetricSchema = z.object({
	histogram: z.array(histogramEntrySchema),
	percentiles: z.object({ p75: z.number() }),
});

const cruxRecordSchema = z.object({
	lcp: cruxMetricSchema.optional(),
	inp: cruxMetricSchema.optional(),
	cls: cruxMetricSchema.optional(),
	fcp: cruxMetricSchema.optional(),
	ttfb: cruxMetricSchema.optional(),
});

const historyMetricSchema = z.object({
	histogramTimeseries: z.array(
		z.object({
			start: z.number(),
			end: z.number().optional(),
			densities: z.array(z.number()),
		}),
	),
	percentilesTimeseries: z.object({ p75s: z.array(z.number()) }),
});

export const researchCruxOutputSchema = z.object({
	origin: z.string(),
	hasData: z
		.boolean()
		.describe("False if the origin has insufficient traffic for CrUX data."),
	collectionPeriod: z.object({
		firstDate: z.string(),
		lastDate: z.string(),
	}),
	phone: cruxRecordSchema.optional(),
	desktop: cruxRecordSchema.optional(),
	all: cruxRecordSchema.optional(),
	cwvAssessment: z
		.object({
			passes: z.boolean(),
			ratings: z.object({
				lcp: z.enum(["good", "needs-improvement", "poor"]).nullable(),
				inp: z.enum(["good", "needs-improvement", "poor"]).nullable(),
				cls: z.enum(["good", "needs-improvement", "poor"]).nullable(),
			}),
		})
		.optional(),
	history: z
		.object({
			collectionPeriods: z.array(
				z.object({ firstDate: z.string(), lastDate: z.string() }),
			),
			record: z.object({
				lcp: historyMetricSchema.optional(),
				inp: historyMetricSchema.optional(),
				cls: historyMetricSchema.optional(),
				fcp: historyMetricSchema.optional(),
				ttfb: historyMetricSchema.optional(),
			}),
			trendSummary: z
				.string()
				.describe(
					"Human-readable trend analysis: improving/stable/degrading per metric",
				),
		})
		.optional(),
	error: z.string().optional(),
});

export type ResearchCruxOutput = z.infer<typeof researchCruxOutputSchema>;

// ── Trend analysis helper ──────────────────────────────────

function describeTrends(
	record:
		| {
				lcp?: { percentilesTimeseries: { p75s: number[] } };
				inp?: { percentilesTimeseries: { p75s: number[] } };
				cls?: { percentilesTimeseries: { p75s: number[] } };
				fcp?: { percentilesTimeseries: { p75s: number[] } };
				ttfb?: { percentilesTimeseries: { p75s: number[] } };
		  }
		| undefined,
): string {
	if (!record) return "No history data";
	const labels = {
		lcp: "LCP",
		inp: "INP",
		cls: "CLS",
		fcp: "FCP",
		ttfb: "TTFB",
	};
	const lines: string[] = [];
	for (const key of ["lcp", "inp", "cls", "fcp", "ttfb"] as const) {
		const m = record[key];
		if (!m?.percentilesTimeseries?.p75s) continue;
		const values = m.percentilesTimeseries.p75s.filter(
			(v) => v !== null && v !== undefined,
		);
		if (values.length < 4) continue;
		const recent = values.slice(-4);
		const older = values.slice(-8, -4);
		if (older.length === 0) continue;
		const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
		const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
		const change = ((recentAvg - olderAvg) / olderAvg) * 100;
		let direction: string;
		if (Math.abs(change) < 3) direction = "stable";
		else if (change < 0)
			direction = `improving (${Math.abs(change).toFixed(0)}% better)`;
		else direction = `degrading (${change.toFixed(0)}% worse)`;
		lines.push(`${labels[key]}: ${direction}`);
	}
	return lines.length > 0 ? lines.join(". ") : "Insufficient data for trend";
}

// ── Tool Definition ────────────────────────────────────────

export const researchCruxTool = (_env: Env) =>
	createTool({
		id: "research_crux",
		description:
			"Fetch Chrome UX Report (CrUX) real-user field data for a website. " +
			"Returns REAL USER measurements (not lab simulations) for Core Web Vitals — " +
			"LCP, INP, CLS, FCP, TTFB — as 28-day rolling averages with p75 percentiles and " +
			"good/needs-improvement/poor histogram distributions. Includes 25-week historical " +
			"trends for sparkline analysis and improving/stable/degrading classification. " +
			"Use for: the authoritative real-world performance picture (what users actually experience), " +
			"Core Web Vitals pass/fail assessment for SEO, and identifying performance regression trends. " +
			"NOTE: Sites with low traffic may return hasData: false.",
		inputSchema: researchCruxInputSchema,
		outputSchema: researchCruxOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, byUrl, includeHistory } = context;
			try {
				const originUrl = byUrl ? url : new URL(url).origin;

				const [currentData, history] = await Promise.all([
					fetchCrUXData(originUrl, byUrl),
					includeHistory
						? fetchCrUXHistory(originUrl, "PHONE", byUrl).catch(() => null)
						: Promise.resolve(null),
				]);

				if (!currentData.hasData) {
					return {
						origin: originUrl,
						hasData: false,
						collectionPeriod: currentData.collectionPeriod,
					};
				}

				const phone = currentData.phone ?? currentData.all;
				let cwvAssessment:
					| {
							passes: boolean;
							ratings: {
								lcp: "good" | "needs-improvement" | "poor" | null;
								inp: "good" | "needs-improvement" | "poor" | null;
								cls: "good" | "needs-improvement" | "poor" | null;
							};
					  }
					| undefined;

				if (phone) {
					cwvAssessment = {
						passes: passesCWV(phone),
						ratings: {
							lcp: phone.lcp
								? rateMetric("lcp", phone.lcp.percentiles.p75)
								: null,
							inp: phone.inp
								? rateMetric("inp", phone.inp.percentiles.p75)
								: null,
							cls: phone.cls
								? rateMetric("cls", phone.cls.percentiles.p75)
								: null,
						},
					};
				}

				return {
					origin: originUrl,
					hasData: true,
					collectionPeriod: currentData.collectionPeriod,
					phone: currentData.phone,
					desktop: currentData.desktop,
					all: currentData.all,
					cwvAssessment,
					history: history
						? {
								collectionPeriods: history.collectionPeriods,
								record: history.record,
								trendSummary: describeTrends(history.record),
							}
						: undefined,
				};
			} catch (error) {
				return {
					origin: url,
					hasData: false,
					collectionPeriod: { firstDate: "", lastDate: "" },
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	});
