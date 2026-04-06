import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { serpLive } from "../lib/dataforseo.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchSerpInputSchema = z.object({
	keyword: z
		.string()
		.min(1)
		.max(200)
		.describe("The search keyword or phrase to research"),
	locationCode: z
		.number()
		.default(2076)
		.describe("DataForSEO location code (default: 2076 = Brazil)"),
	languageCode: z
		.string()
		.default("pt")
		.describe("Language code (default: pt = Portuguese)"),
});

export type ResearchSerpInput = z.infer<typeof researchSerpInputSchema>;

export const researchSerpOutputSchema = z.object({
	keyword: z.string(),
	organicResults: z.array(
		z.object({
			position: z.number(),
			url: z.string(),
			title: z.string(),
			description: z.string(),
			domain: z.string(),
		}),
	),
	relatedSearches: z.array(z.string()),
	peopleAlsoAsk: z.array(z.string()),
	aiOverview: z.string().nullable(),
	totalResults: z.number(),
	error: z.string().optional(),
});

export type ResearchSerpOutput = z.infer<typeof researchSerpOutputSchema>;

// ── Tool Definition ────────────────────────────────────────

export const researchSerpTool = (_env: Env) =>
	createTool({
		id: "research_serp",
		description:
			"Research Google SERP results for a keyword via DataForSEO. " +
			"Returns top 10 organic results, related searches, people also ask, and AI overview. " +
			"Use for: competitive benchmarking (who ranks for brand/category keywords), " +
			"identifying content opportunities, and estimating competitive landscape.",
		inputSchema: researchSerpInputSchema,
		outputSchema: researchSerpOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { keyword, locationCode, languageCode } = context;

			try {
				const result = await serpLive(keyword, locationCode, languageCode);

				return {
					keyword,
					organicResults: result.results,
					relatedSearches: result.relatedSearches,
					peopleAlsoAsk: result.peopleAlsoAsk,
					aiOverview: result.aiOverview,
					totalResults: result.totalResults,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					keyword,
					organicResults: [],
					relatedSearches: [],
					peopleAlsoAsk: [],
					aiOverview: null,
					totalResults: 0,
					error: msg,
				};
			}
		},
	});
