import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { keywordsForKeywords } from "../lib/dataforseo.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchKeywordsInputSchema = z.object({
	keywords: z
		.array(z.string().min(1))
		.min(1)
		.max(50)
		.describe(
			"Seed keywords to research (returns related keywords with metrics)",
		),
	locationCode: z
		.number()
		.default(2076)
		.describe("DataForSEO location code (default: 2076 = Brazil)"),
	languageCode: z
		.string()
		.default("pt")
		.describe("Language code (default: pt = Portuguese)"),
});

export type ResearchKeywordsInput = z.infer<typeof researchKeywordsInputSchema>;

export const researchKeywordsOutputSchema = z.object({
	keywords: z.array(
		z.object({
			keyword: z.string(),
			volume: z.number(),
			difficulty: z.number(),
			cpc: z.number(),
			competition: z.string(),
			monthlyTrends: z.array(
				z.object({
					year: z.number(),
					month: z.number(),
					volume: z.number(),
				}),
			),
		}),
	),
	error: z.string().optional(),
});

export type ResearchKeywordsOutput = z.infer<
	typeof researchKeywordsOutputSchema
>;

// ── Tool Definition ────────────────────────────────────────

export const researchKeywordsTool = (_env: Env) =>
	createTool({
		id: "research_keywords",
		description:
			"Get keyword search volume, difficulty, CPC, and monthly trends from DataForSEO. " +
			"Provide seed keywords and get back related keywords with metrics. " +
			"Use for: identifying high-volume keyword opportunities, estimating organic traffic potential, " +
			"calculating paid vs. organic rebalancing savings (CPC × volume), and seasonality analysis.",
		inputSchema: researchKeywordsInputSchema,
		outputSchema: researchKeywordsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { keywords: seedKeywords, locationCode, languageCode } = context;

			try {
				const results = await keywordsForKeywords(
					seedKeywords,
					locationCode,
					languageCode,
				);

				return {
					keywords: results.map((kw) => ({
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
					})),
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return { keywords: [], error: msg };
			}
		},
	});
