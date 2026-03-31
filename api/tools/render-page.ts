import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	getBrowserlessToken,
	getBrowserMode,
	getHttpBaseUrl,
	resolveBrowserEndpoint,
	withBrowserPage,
} from "../lib/browserless.ts";
import { extractMeta, extractVisibleText } from "../lib/html.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const renderPageInputSchema = z.object({
	url: urlInput.describe("The URL to render"),
	waitForSelector: z
		.string()
		.optional()
		.describe("CSS selector to wait for before capturing"),
	waitForTimeout: z
		.number()
		.max(30000)
		.optional()
		.describe("Extra ms to wait after page load"),
	rejectResourceTypes: z
		.array(z.enum(["image", "font", "media", "stylesheet"]))
		.default(["image", "font", "media"])
		.describe("Resource types to block for faster rendering"),
	extractText: z
		.boolean()
		.default(true)
		.describe("Extract visible text content"),
	extractMeta: z
		.boolean()
		.default(true)
		.describe("Extract meta tags, title, headings, structured data"),
	maxContentKB: z.number().default(100).describe("Max HTML content size in KB"),
});

export type RenderPageInput = z.infer<typeof renderPageInputSchema>;

export const renderPageOutputSchema = z.object({
	url: z.string(),
	contentLength: z.number(),
	truncated: z.boolean(),
	meta: z
		.object({
			title: z.string().nullable().optional(),
			description: z.string().nullable().optional(),
			canonical: z.string().nullable().optional(),
			og: z.record(z.string(), z.string()).optional(),
			headings: z
				.array(z.object({ level: z.number(), text: z.string() }))
				.optional(),
			jsonLd: z.array(z.unknown()).optional(),
		})
		.optional(),
	text: z.string().optional(),
	html: z.string().optional(),
	error: z.string().optional(),
});

export type RenderPageOutput = z.infer<typeof renderPageOutputSchema>;

// ── Remote Mode (Browserless /content API) ─────────────────

async function fetchRenderedContent(
	url: string,
	rejectResourceTypes: string[],
	waitForSelector?: string,
	waitForTimeout?: number,
): Promise<string> {
	const token = getBrowserlessToken();
	const baseUrl = getHttpBaseUrl();

	const body: Record<string, unknown> = {
		url,
		rejectResourceTypes,
		bestAttempt: true,
		gotoOptions: {
			waitUntil: "networkidle2",
			timeout: 30000,
		},
	};

	if (waitForSelector) body.waitForSelector = { selector: waitForSelector };
	if (waitForTimeout) body.waitForTimeout = waitForTimeout;

	const response = await fetch(`${baseUrl}/content?token=${token}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60_000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Browserless /content failed (${response.status}): ${text.slice(0, 500)}`,
		);
	}

	return response.text();
}

// ── Local Mode (Puppeteer) ─────────────────────────────────

async function localRenderContent(
	url: string,
	rejectResourceTypes: string[],
	waitForSelector?: string,
	waitForTimeout?: number,
): Promise<string> {
	const endpoint = resolveBrowserEndpoint();

	return withBrowserPage(endpoint, "desktop", async (page) => {
		// Set up request interception to block resource types
		if (rejectResourceTypes.length > 0) {
			await page.setRequestInterception(true);
			page.on("request", (req) => {
				const resourceType = req.resourceType();
				if (rejectResourceTypes.includes(resourceType)) {
					req.abort();
				} else {
					req.continue();
				}
			});
		}

		await page.goto(url, {
			waitUntil: "networkidle2",
			timeout: 30000,
		});

		if (waitForSelector) {
			await page.waitForSelector(waitForSelector, { timeout: 10000 });
		}

		if (waitForTimeout) {
			await new Promise((resolve) => setTimeout(resolve, waitForTimeout));
		}

		return page.content();
	});
}

// ── Tool Definition ────────────────────────────────────────

export const renderPageTool = (_env: Env) =>
	createTool({
		id: "render_page",
		description:
			"Render a URL with a real browser (JS execution). " +
			"Returns the fully rendered DOM HTML, visible text, and meta tags. " +
			"Use when fetch_page returns empty/skeleton HTML (SPAs, client-rendered sites). " +
			"Slower than fetch_page — prefer fetch_page when SSR HTML is sufficient.",
		inputSchema: renderPageInputSchema,
		outputSchema: renderPageOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const {
				url,
				waitForSelector,
				waitForTimeout,
				rejectResourceTypes,
				extractText: doExtractText,
				extractMeta: doExtractMeta,
				maxContentKB,
			} = context;

			try {
				const mode = getBrowserMode();

				if (mode === "none") {
					return {
						url,
						contentLength: 0,
						truncated: false,
						error:
							"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
					};
				}

				let html: string;

				if (mode === "remote") {
					html = await fetchRenderedContent(
						url,
						rejectResourceTypes,
						waitForSelector,
						waitForTimeout,
					);
				} else {
					html = await localRenderContent(
						url,
						rejectResourceTypes,
						waitForSelector,
						waitForTimeout,
					);
				}

				const contentLength = html.length;
				const maxBytes = maxContentKB * 1024;
				let truncated = false;

				if (html.length > maxBytes) {
					html = html.slice(0, maxBytes);
					truncated = true;
				}

				const result: RenderPageOutput = {
					url,
					contentLength,
					truncated,
				};

				if (doExtractMeta) {
					result.meta = extractMeta(html);
				}

				if (doExtractText) {
					result.text = extractVisibleText(html);
				}

				result.html = html;

				return result;
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					contentLength: 0,
					truncated: false,
					error: msg.replace(/token=[^&\s]+/gi, "token=<redacted>"),
				};
			}
		},
	});
