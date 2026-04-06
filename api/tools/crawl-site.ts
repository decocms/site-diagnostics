import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { firecrawlMap } from "../lib/firecrawl.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── URL Categorization ────────────────────────────────────

const PDP_PATTERNS = [
	/\/p$/, // VTEX (URLs ending in /p)
	/\/p\?/, // VTEX with query params
	/\/product\//, // Generic
	/\/products\/[^/]+$/, // Shopify single product
	/\/dp\//, // Amazon-style
	/\/item\//, // Generic
	/\/produto\//, // PT
	/\/-\/A-/, // Target-style
];

const PLP_PATTERNS = [
	/\/c\//, // VTEX category
	/\/collections\//, // Shopify
	/\/category\//, // Generic
	/\/categoria\//, // PT
	/\/departamento\//, // VTEX
	/\/busca/, // VTEX search
	/\/search/, // Generic search
	/\/s\?/, // Query search
	/\/(masculino|feminino|infantil|unissex)(\/|$)/, // PT gender categories
	/\/(calcados|roupas|acessorios|tenis|chinelo|sandalia)(\/|$)/, // PT product categories
	/\/(shoes|clothing|accessories|footwear)(\/|$)/, // EN product categories
	/\/(sale|outlet|lancamentos|novidades|promocao)(\/|$)/, // Commercial categories
];

const BLOG_PATTERNS = [
	/\/blog/, // Generic
	/\/news/, // News
	/\/artigo/, // PT
	/\/articles?\//, // Generic
	/\/posts?\//, // Generic
	/\/magazine/, // Magazine
	/\/editorial/, // Editorial
	/\/stories/, // Stories
];

const INSTITUTIONAL_PATTERNS = [
	/\/about/, // About
	/\/sobre/, // PT
	/\/contact/, // Contact
	/\/contato/, // PT
	/\/faq/, // FAQ
	/\/help/, // Help
	/\/ajuda/, // PT
	/\/terms/, // Terms
	/\/termos/, // PT
	/\/privacy/, // Privacy
	/\/politica/, // PT
	/\/institucional/, // PT institutional
	/\/stores?$/, // Store locator
	/\/lojas?$/, // PT store locator
	/\/work-with-us/, // Careers
	/\/trabalhe-conosco/, // PT careers
];

interface Categories {
	pdp: string[];
	plp: string[];
	blog: string[];
	institutional: string[];
	other: string[];
}

function categorizeUrls(urls: string[]): Categories {
	const categories: Categories = {
		pdp: [],
		plp: [],
		blog: [],
		institutional: [],
		other: [],
	};

	for (const url of urls) {
		const path = url.toLowerCase();

		// Skip non-page resources
		if (
			/\.(xml|json|css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)(\?|$)/.test(path)
		)
			continue;

		if (PDP_PATTERNS.some((p) => p.test(path))) {
			categories.pdp.push(url);
		} else if (PLP_PATTERNS.some((p) => p.test(path))) {
			categories.plp.push(url);
		} else if (BLOG_PATTERNS.some((p) => p.test(path))) {
			categories.blog.push(url);
		} else if (INSTITUTIONAL_PATTERNS.some((p) => p.test(path))) {
			categories.institutional.push(url);
		} else {
			categories.other.push(url);
		}
	}

	return categories;
}

// ── Schemas ────────────────────────────────────────────────

export const crawlSiteInputSchema = z.object({
	url: urlInput.describe("The site URL to discover pages from"),
	maxPages: z
		.number()
		.max(5000)
		.default(500)
		.describe("Maximum number of URLs to discover"),
});

export type CrawlSiteInput = z.infer<typeof crawlSiteInputSchema>;

export const crawlSiteOutputSchema = z.object({
	url: z.string(),
	totalPages: z.number(),
	pageCounts: z.object({
		pdp: z.number(),
		plp: z.number(),
		blog: z.number(),
		institutional: z.number(),
		other: z.number(),
	}),
	sampleUrls: z.object({
		pdp: z.array(z.string()),
		plp: z.array(z.string()),
		blog: z.array(z.string()),
		institutional: z.array(z.string()),
	}),
	allUrls: z.array(z.string()),
	error: z.string().optional(),
});

export type CrawlSiteOutput = z.infer<typeof crawlSiteOutputSchema>;

// ── Tool Definition ────────────────────────────────────────

const MAX_SAMPLE = 10;

export const crawlSiteTool = (_env: Env) =>
	createTool({
		id: "crawl_site",
		description:
			"Discover ALL pages on a website using Firecrawl's map endpoint (fast, no scraping). " +
			"Returns total page count, pages categorized by type (PDP, PLP, blog, institutional), " +
			"and sample URLs per category. Use for: content engine analysis, understanding site structure, " +
			"identifying content gaps (e.g. no blog pages), and scoping the catalog size.",
		inputSchema: crawlSiteInputSchema,
		outputSchema: crawlSiteOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages } = context;

			try {
				const result = await firecrawlMap(url, { limit: maxPages });
				const categories = categorizeUrls(result.links);

				return {
					url,
					totalPages: result.links.length,
					pageCounts: {
						pdp: categories.pdp.length,
						plp: categories.plp.length,
						blog: categories.blog.length,
						institutional: categories.institutional.length,
						other: categories.other.length,
					},
					sampleUrls: {
						pdp: categories.pdp.slice(0, MAX_SAMPLE),
						plp: categories.plp.slice(0, MAX_SAMPLE),
						blog: categories.blog.slice(0, MAX_SAMPLE),
						institutional: categories.institutional.slice(0, MAX_SAMPLE),
					},
					allUrls: result.links,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					totalPages: 0,
					pageCounts: { pdp: 0, plp: 0, blog: 0, institutional: 0, other: 0 },
					sampleUrls: { pdp: [], plp: [], blog: [], institutional: [] },
					allUrls: [],
					error: msg,
				};
			}
		},
	});
