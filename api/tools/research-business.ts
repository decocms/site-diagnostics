import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { perplexityAsk } from "../lib/perplexity.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const researchBusinessInputSchema = z.object({
	companyName: z
		.string()
		.min(1)
		.describe("The company or brand name to research"),
	domain: z
		.string()
		.min(1)
		.describe("The company's website domain (e.g. 'olympikus.com.br')"),
	category: z
		.string()
		.optional()
		.describe(
			"Business category for context (e.g. 'sporting goods e-commerce', 'fashion retail')",
		),
});

export type ResearchBusinessInput = z.infer<typeof researchBusinessInputSchema>;

export const researchBusinessOutputSchema = z.object({
	companyName: z.string(),
	summary: z.string(),
	marketPosition: z.string().optional(),
	competitors: z.array(z.string()),
	recentNews: z.array(z.string()),
	trafficEstimate: z.string().optional(),
	businessContext: z.string().optional(),
	citations: z.array(z.string()),
	error: z.string().optional(),
});

export type ResearchBusinessOutput = z.infer<
	typeof researchBusinessOutputSchema
>;

// ── Tool Definition ────────────────────────────────────────

const SYSTEM_PROMPT =
	"You are a business intelligence analyst. Provide detailed, factual information " +
	"about companies and their market position. Focus on: company overview, market share, " +
	"key competitors, recent strategic moves, DTC vs wholesale mix, traffic estimates, " +
	"and revenue/funding data when publicly available. Be specific with numbers and sources.";

export const researchBusinessTool = (_env: Env) =>
	createTool({
		id: "research_business",
		description:
			"Research business context about a company using Perplexity (web-grounded AI). " +
			"Returns company summary, market position, competitors, recent news, and traffic estimates. " +
			"Use for: understanding the business behind the website, identifying strategic context " +
			"(DTC priorities, market gaps), and framing diagnostic findings as business opportunities.",
		inputSchema: researchBusinessInputSchema,
		outputSchema: researchBusinessOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { companyName, domain, category } = context;

			try {
				const categoryCtx = category ? ` in the ${category} space` : "";
				const query =
					`Tell me about ${companyName} (${domain})${categoryCtx}. Include:\n` +
					"1. Company overview and market position\n" +
					"2. Main competitors (list their names)\n" +
					"3. Recent news, strategic moves, or earnings highlights\n" +
					"4. Estimated monthly website traffic if available\n" +
					"5. Key business context (DTC vs wholesale, growth trends, marketing strategy)";

				const result = await perplexityAsk(SYSTEM_PROMPT, query);

				// Parse the freeform answer into structured fields
				const lines = result.answer.split("\n").filter((l) => l.trim());

				// Extract competitors - look for competitor-related lines
				const competitors: string[] = [];
				const recentNews: string[] = [];
				let marketPosition = "";
				let trafficEstimate = "";
				let businessContext = "";

				for (const line of lines) {
					const lower = line.toLowerCase();
					if (
						lower.includes("competitor") ||
						lower.includes("rival") ||
						lower.includes("compete")
					) {
						// Extract brand names from competitor mentions
						const brands = line.match(
							/(?:Nike|Adidas|Asics|New Balance|Puma|Mizuno|Hoka|Under Armour|Skechers|Farm|Reserva|Animale|Zara|H&M|Renner|C&A|Riachuelo|Arezzo|Vivara|Pandora|Tiffany|Cartier|Havaianas|Ipanema|Rider|Kenner)\b/gi,
						);
						if (brands) competitors.push(...brands);
					}
					if (
						lower.includes("traffic") ||
						lower.includes("visits") ||
						lower.includes("visitors")
					) {
						trafficEstimate = line.trim();
					}
					if (
						lower.includes("market") ||
						lower.includes("position") ||
						lower.includes("leader") ||
						lower.includes("share")
					) {
						marketPosition = line.trim();
					}
					if (
						lower.includes("news") ||
						lower.includes("recent") ||
						lower.includes("announced") ||
						lower.includes("launched") ||
						lower.includes("quarter") ||
						lower.includes("earnings")
					) {
						recentNews.push(line.trim());
					}
					if (
						lower.includes("dtc") ||
						lower.includes("direct-to-consumer") ||
						lower.includes("wholesale") ||
						lower.includes("strategy") ||
						lower.includes("growth")
					) {
						businessContext += `${line.trim()} `;
					}
				}

				return {
					companyName,
					summary: result.answer,
					marketPosition: marketPosition || undefined,
					competitors: [...new Set(competitors)],
					recentNews: recentNews.slice(0, 5),
					trafficEstimate: trafficEstimate || undefined,
					businessContext: businessContext.trim() || undefined,
					citations: result.citations,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					companyName,
					summary: "",
					competitors: [],
					recentNews: [],
					citations: [],
					error: msg,
				};
			}
		},
	});
