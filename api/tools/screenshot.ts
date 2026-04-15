import { randomUUID } from "node:crypto";
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveBrowserEndpoint, withBrowserPage } from "../lib/browserless.ts";
import { deviceInput, urlInput } from "../lib/schemas.ts";
import { uploadScreenshot } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** WAF / bot-protection patterns: [regex, provider label] */
const WAF_PATTERNS: [RegExp, string][] = [
	[/access denied/i, "Akamai"],
	[/attention required.*cloudflare/i, "Cloudflare"],
	[/checking your browser/i, "Cloudflare"],
	[/just a moment\.\.\./i, "Cloudflare"],
	[/403 forbidden/i, "WAF"],
	[/you have been blocked/i, "WAF"],
	[/blocked.*web application firewall/i, "WAF"],
	[/pardon our interruption/i, "Incapsula"],
	[/please verify you are a human/i, "Bot Protection"],
	[/security check/i, "Bot Protection"],
];

// ── Schemas ────────────────────────────────────────────────

export const screenshotInputSchema = z.object({
	url: urlInput.describe("The URL to screenshot"),
	fullPage: z
		.boolean()
		.default(false)
		.describe("Capture the full scrollable page"),
	device: deviceInput,
	waitUntil: z
		.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
		.default("networkidle2"),
	timeout: z
		.number()
		.max(60_000)
		.default(30000)
		.describe("Navigation timeout in ms"),
	cookies: z.record(z.string(), z.string()).optional(),
});

export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

export const screenshotOutputSchema = z.object({
	url: z.string(),
	device: z.enum(["desktop", "mobile"]),
	sizeKB: z.number().optional(),
	imageUrl: z.string().optional(),
	blocked: z.boolean().optional(),
	blockedBy: z.string().optional(),
	error: z.string().optional(),
});

export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;

// ── Tool ───────────────────────────────────────────────────

export const screenshotTool = (_env: Env) =>
	createTool({
		id: "screenshot",
		description:
			"Take a screenshot of a URL. Saves the image to R2 and returns a public URL. Use to verify page layout and visual issues.",
		inputSchema: screenshotInputSchema,
		outputSchema: screenshotOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context, runtimeContext }) => {
			const { url, fullPage, device, waitUntil, timeout, cookies } = context;

			try {
				const endpoint = resolveBrowserEndpoint();
				const parsedUrl = new URL(url);

				const result = await withBrowserPage(
					endpoint,
					device,
					async (page) => {
						await page.goto(url, { waitUntil, timeout });

						// Detect WAF / bot-protection pages before screenshotting
						const wafProvider: string | null = await page.evaluate(
							(...patterns: string[][]) => {
								const title = document.title.toLowerCase();
								const body =
									document.body?.innerText?.slice(0, 2000).toLowerCase() ?? "";
								const text = `${title} ${body}`;
								for (const [reStr, provider] of patterns) {
									if (new RegExp(reStr, "i").test(text)) return provider;
								}
								return null;
							},
							...WAF_PATTERNS.map(([re, label]) => [re.source, label]),
						);

						if (wafProvider) {
							return { kind: "blocked" as const, blockedBy: wafProvider };
						}

						const screenshot = await page.screenshot({
							type: "png",
							fullPage,
						});
						return {
							kind: "screenshot" as const,
							buffer: Buffer.from(screenshot),
						};
					},
					{
						cookies,
						domain: parsedUrl.hostname,
					},
				);

				if (result.kind === "blocked") {
					return {
						url,
						device,
						blocked: true,
						blockedBy: result.blockedBy,
						error: `Page blocked by ${result.blockedBy} — screenshot shows a WAF page, not actual content`,
					};
				}

				const buf = result.buffer;
				if (buf.length > MAX_SIZE_BYTES) {
					return {
						url,
						device,
						error: `Screenshot too large: ${Math.round(buf.length / 1024)}KB exceeds 5MB limit`,
					};
				}

				const slug = parsedUrl.hostname.replace(/[^a-zA-Z0-9._-]/g, "-");
				const filename = `${slug}-${device}-${randomUUID().slice(0, 8)}.png`;
				await uploadScreenshot(buf, filename);

				const origin = runtimeContext?.req
					? new URL(runtimeContext.req.url).origin
					: "";
				return {
					url,
					device,
					sizeKB: Math.round(buf.length / 1024),
					imageUrl: `${origin}/api/screenshots/${filename}`,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					device,
					error: msg,
				};
			}
		},
	});
