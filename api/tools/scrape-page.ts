import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { firecrawlScrape } from "../lib/firecrawl.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const scrapePageInputSchema = z.object({
	url: urlInput.describe("The URL to scrape"),
	formats: z
		.array(z.enum(["markdown", "html"]))
		.default(["markdown"])
		.describe("Output formats to request"),
	includeBranding: z
		.boolean()
		.default(false)
		.describe("Extract branding assets (colors, fonts, logos)"),
});

export type ScrapePageInput = z.infer<typeof scrapePageInputSchema>;

export const scrapePageOutputSchema = z.object({
	url: z.string(),
	markdown: z.string().optional(),
	metadata: z
		.object({
			title: z.string().optional(),
			description: z.string().optional(),
			ogImage: z.string().nullable().optional(),
			favicon: z.string().nullable().optional(),
			ogSiteName: z.string().nullable().optional(),
			language: z.string().optional(),
		})
		.optional(),
	branding: z
		.object({
			colors: z.record(z.string(), z.string()).optional(),
			fonts: z.array(z.string()).optional(),
			logo: z.string().nullable().optional(),
		})
		.optional(),
	error: z.string().optional(),
});

export type ScrapePageOutput = z.infer<typeof scrapePageOutputSchema>;

// ── Tool Definition ────────────────────────────────────────

export const scrapePageTool = (_env: Env) =>
	createTool({
		id: "scrape_page",
		description:
			"Deep-scrape a single page using Firecrawl. Returns markdown content, metadata, " +
			"and optionally branding assets (colors, fonts, logos). Use for: analyzing PDP content quality, " +
			"detecting review sections, cross-sell blocks, structured data presence, and brand extraction. " +
			"Slower than fetch_page but returns richer content (rendered markdown).",
		inputSchema: scrapePageInputSchema,
		outputSchema: scrapePageOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, formats, includeBranding } = context;

			try {
				const firecrawlFormats = includeBranding
					? [...formats, "branding" as const]
					: formats;

				const result = await firecrawlScrape(url, {
					formats: firecrawlFormats,
				});

				const branding = result.branding
					? {
							colors: result.branding.colors
								? Object.fromEntries(
										Object.entries(result.branding.colors).filter(
											([, v]) => v != null,
										),
									)
								: undefined,
							fonts:
								result.branding.fonts?.map((f) => f.family) ??
								(result.branding.typography?.fontFamilies
									? Object.values(
											result.branding.typography.fontFamilies,
										).filter((f): f is string => f != null)
									: undefined),
							logo:
								result.branding.images?.logo ?? result.branding.logo ?? null,
						}
					: undefined;

				return {
					url,
					markdown: result.markdown || undefined,
					metadata: {
						title: result.metadata.title || undefined,
						description: result.metadata.description || undefined,
						ogImage: result.metadata.ogImage,
						favicon: result.metadata.favicon,
						ogSiteName: result.metadata.ogSiteName,
						language: result.metadata.language || undefined,
					},
					branding,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return { url, error: msg };
			}
		},
	});
