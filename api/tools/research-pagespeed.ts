import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { fetchPageSpeed, rateMetric } from "../lib/pagespeed.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchPagespeedInputSchema = z.object({
	url: urlInput.describe("The URL to analyze"),
	strategy: z
		.enum(["mobile", "desktop"])
		.default("mobile")
		.describe("Form factor to analyze (default: mobile)"),
});

export type ResearchPagespeedInput = z.infer<
	typeof researchPagespeedInputSchema
>;

const auditSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	score: z.number().nullable(),
	displayValue: z.string().optional(),
	numericValue: z.number().optional(),
	savingsMs: z.number().optional(),
	savingsBytes: z.number().optional(),
});

export const researchPagespeedOutputSchema = z.object({
	url: z.string(),
	strategy: z.enum(["mobile", "desktop"]),
	performanceScore: z.number().describe("0-100 Lighthouse performance score"),
	labMetrics: z.object({
		fcp: z.number(),
		lcp: z.number(),
		cls: z.number(),
		tbt: z.number(),
		si: z.number(),
		tti: z.number(),
		ttfb: z.number(),
	}),
	opportunities: z.array(auditSchema),
	diagnostics: z.array(auditSchema),
	ratings: z.object({
		lcp: z.enum(["good", "needs-improvement", "poor"]),
		cls: z.enum(["good", "needs-improvement", "poor"]),
		fcp: z.enum(["good", "needs-improvement", "poor"]),
	}),
	fetchedAt: z.string(),
	error: z.string().optional(),
});

export type ResearchPagespeedOutput = z.infer<
	typeof researchPagespeedOutputSchema
>;

// ── Tool Definition ────────────────────────────────────────

export const researchPagespeedTool = (_env: Env) =>
	createTool({
		id: "research_pagespeed",
		description:
			"Run Google PageSpeed Insights (hosted Lighthouse) analysis on a URL. " +
			"Returns 0-100 performance score, lab-measured Core Web Vitals (LCP, CLS, FCP, TBT, SI, TTI, TTFB), " +
			"and prioritized optimization opportunities with estimated savings (ms/KB). " +
			"Runs on Google's infrastructure without needing a browserless token — alternative to lighthouse_audit " +
			"when you need hosted analysis. Use for: homepage/PDP/PLP performance scoring, identifying the biggest " +
			"wins (unused JS, unoptimized images, render-blocking resources), and comparing mobile vs desktop.",
		inputSchema: researchPagespeedInputSchema,
		outputSchema: researchPagespeedOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, strategy } = context;
			try {
				const result = await fetchPageSpeed(url, strategy);
				return {
					url: result.url,
					strategy: result.strategy,
					performanceScore: result.performanceScore,
					labMetrics: result.labMetrics,
					opportunities: result.opportunities,
					diagnostics: result.diagnostics,
					ratings: {
						lcp: rateMetric("lcp", result.labMetrics.lcp),
						cls: rateMetric("cls", result.labMetrics.cls),
						fcp: rateMetric("fcp", result.labMetrics.fcp),
					},
					fetchedAt: result.fetchedAt,
				};
			} catch (error) {
				return {
					url,
					strategy,
					performanceScore: 0,
					labMetrics: {
						fcp: 0,
						lcp: 0,
						cls: 0,
						tbt: 0,
						si: 0,
						tti: 0,
						ttfb: 0,
					},
					opportunities: [],
					diagnostics: [],
					ratings: {
						lcp: "poor" as const,
						cls: "poor" as const,
						fcp: "poor" as const,
					},
					fetchedAt: new Date().toISOString(),
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	});
