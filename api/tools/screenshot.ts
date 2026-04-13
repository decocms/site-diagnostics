import { randomUUID } from "node:crypto";
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveBrowserEndpoint, withBrowserPage } from "../lib/browserless.ts";
import { deviceInput, urlInput } from "../lib/schemas.ts";
import { uploadScreenshot } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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

				const buf = await withBrowserPage(
					endpoint,
					device,
					async (page) => {
						await page.goto(url, { waitUntil, timeout });
						const screenshot = await page.screenshot({
							type: "png",
							fullPage,
						});
						return Buffer.from(screenshot);
					},
					{
						cookies,
						domain: parsedUrl.hostname,
					},
				);

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
