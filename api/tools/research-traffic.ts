import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runActor } from "../lib/apify.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchTrafficInputSchema = z.object({
	urls: z
		.array(z.string().url())
		.min(1)
		.max(10)
		.describe(
			"List of website URLs to analyze (e.g. ['https://www.example.com/', 'https://www.competitor.com/'])",
		),
});

export type ResearchTrafficInput = z.infer<typeof researchTrafficInputSchema>;

const trafficSourceSchema = z.object({
	name: z.string(),
	share: z.number(),
});

const keywordSchema = z.object({
	keyword: z.string(),
	searchVolume: z.number().optional(),
	cpc: z.number().optional(),
	estimatedValue: z.number().optional(),
});

const monthlyVisitSchema = z.object({
	month: z.string(),
	visits: z.number(),
});

const countryShareSchema = z.object({
	country: z.string(),
	share: z.number(),
});

const aiTrafficSchema = z.object({
	chatgpt: z.number().nullable(),
	claude: z.number().nullable(),
	perplexity: z.number().nullable(),
	gemini: z.number().nullable(),
	copilot: z.number().nullable(),
});

export const researchTrafficOutputSchema = z.object({
	results: z.array(
		z.object({
			url: z.string(),
			domain: z.string(),
			title: z.string().optional(),
			globalRank: z.number().optional(),
			countryRank: z.number().optional(),
			country: z.string().optional(),
			category: z.string().optional(),
			categoryRank: z.number().optional(),
			totalVisits: z.number().optional(),
			bounceRate: z.number().optional(),
			pagesPerVisit: z.number().optional(),
			avgVisitDurationSecs: z.number().optional(),
			trafficSources: z.array(trafficSourceSchema),
			topCountries: z.array(countryShareSchema),
			topKeywords: z.array(keywordSchema),
			monthlyVisits: z.array(monthlyVisitSchema),
			aiTraffic: aiTrafficSchema.optional(),
		}),
	),
	error: z.string().optional(),
});

export type ResearchTrafficOutput = z.infer<typeof researchTrafficOutputSchema>;

// ── Apify actor output shape ───────────────────────────────

interface SimilarwebItem {
	searchUrl?: string;
	url?: string;
	domain?: string;
	title?: string;
	rankGlobal?: number;
	countryRank?: number;
	country?: string;
	category?: string;
	categoryRank?: number;
	totalVisits?: number;
	bounceRate?: number;
	pagesPerVisit?: number;
	timeOnSite?: number;
	directTraffic?: number;
	searchTraffic?: number;
	socialTraffic?: number;
	referralTraffic?: number;
	mailTraffic?: number;
	paidReferralsTraffic?: number;
	countryShare?: Array<{ country: string; share: number }>;
	topKeywords?: Array<{
		keyword: string;
		searchVolume?: number;
		cpc?: number;
		estimatedValue?: number;
	}>;
	monthlyVisits?: Array<{ month: string; visits: number }>;
	aiTrafficShareChatgpt?: number | null;
	aiTrafficShareClaude?: number | null;
	aiTrafficSharePerplexity?: number | null;
	aiTrafficShareGemini?: number | null;
	aiTrafficShareCopilot?: number | null;
}

// ── Tool Definition ────────────────────────────────────────

export const researchTrafficTool = (_env: Env) =>
	createTool({
		id: "research_traffic",
		description:
			"Get website traffic intelligence from Similarweb via Apify. " +
			"Returns global/country rank, monthly visits, traffic source breakdown " +
			"(direct, search, social, referral, email, paid), engagement metrics " +
			"(bounce rate, pages/visit, avg duration), top keywords with search volume and CPC, " +
			"country share, and AI traffic share (ChatGPT, Claude, Perplexity, Gemini). " +
			"Use for: benchmarking a site against competitors, identifying dominant traffic channels, " +
			"estimating organic vs paid traffic mix, and validating SEO opportunity sizing.",
		inputSchema: researchTrafficInputSchema,
		outputSchema: researchTrafficOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { urls } = context;

			try {
				const items = await runActor<
					{
						urls: string[];
						include_similar_sites: boolean;
						include_indepth_data: boolean;
					},
					SimilarwebItem
				>("radeance/similarweb-scraper", {
					urls,
					include_similar_sites: false,
					include_indepth_data: false,
				});

				const results = items.map((item) => ({
					url: item.searchUrl ?? item.url ?? "",
					domain: item.domain ?? "",
					title: item.title,
					globalRank: item.rankGlobal,
					countryRank: item.countryRank,
					country: item.country,
					category: item.category,
					categoryRank: item.categoryRank,
					totalVisits: item.totalVisits,
					bounceRate: item.bounceRate,
					pagesPerVisit: item.pagesPerVisit,
					avgVisitDurationSecs: item.timeOnSite,
					trafficSources: [
						{ name: "direct", share: item.directTraffic ?? 0 },
						{ name: "search", share: item.searchTraffic ?? 0 },
						{ name: "social", share: item.socialTraffic ?? 0 },
						{ name: "referral", share: item.referralTraffic ?? 0 },
						{ name: "mail", share: item.mailTraffic ?? 0 },
						{ name: "paid", share: item.paidReferralsTraffic ?? 0 },
					].filter((s) => s.share > 0),
					topCountries: item.countryShare ?? [],
					topKeywords: (item.topKeywords ?? []).map((kw) => ({
						keyword: kw.keyword,
						searchVolume: kw.searchVolume,
						cpc: kw.cpc,
						estimatedValue: kw.estimatedValue,
					})),
					monthlyVisits: item.monthlyVisits ?? [],
					aiTraffic:
						item.aiTrafficShareChatgpt != null ||
						item.aiTrafficShareClaude != null ||
						item.aiTrafficSharePerplexity != null
							? {
									chatgpt: item.aiTrafficShareChatgpt ?? null,
									claude: item.aiTrafficShareClaude ?? null,
									perplexity: item.aiTrafficSharePerplexity ?? null,
									gemini: item.aiTrafficShareGemini ?? null,
									copilot: item.aiTrafficShareCopilot ?? null,
								}
							: undefined,
				}));

				return { results };
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return { results: [], error: msg };
			}
		},
	});
