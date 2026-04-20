import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	extractLinks,
	extractSeoMeta,
	extractSitemapUrls,
} from "../../src/lib/html.ts";
import { isPrivateHost } from "../../src/lib/ssrf.ts";
import { sanitizeHeaders, urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const fetchPageInputSchema = z.object({
	url: urlInput.describe("The URL to fetch"),
	extractLinks: z
		.boolean()
		.default(true)
		.describe("Extract internal links from HTML responses"),
	maxBodyKB: z
		.number()
		.max(2048)
		.default(512)
		.describe("Max response body to return (KB)"),
	headers: z
		.record(z.string(), z.string())
		.optional()
		.describe("Custom request headers (allowlisted only)"),
	cookies: z
		.record(z.string(), z.string())
		.optional()
		.describe("Cookies as key-value pairs"),
});

export type FetchPageInput = z.infer<typeof fetchPageInputSchema>;

export const fetchPageOutputSchema = z.object({
	url: z.string(),
	finalUrl: z.string().optional(),
	status: z.number(),
	headers: z.record(z.string(), z.string()).optional(),
	contentType: z.string().optional(),
	bodyKB: z.number().optional(),
	truncated: z.boolean().optional(),
	body: z.string().optional(),
	links: z.array(z.string()).optional(),
	sitemapUrls: z.array(z.string()).optional(),
	seo: z.record(z.string(), z.string()).optional(),
	error: z.string().optional(),
});

export type FetchPageOutput = z.infer<typeof fetchPageOutputSchema>;

// ── Redirect-safe fetch ────────────────────────────────────

const MAX_REDIRECTS = 5;

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
	let currentUrl = url;

	for (let i = 0; i < MAX_REDIRECTS; i++) {
		const resp = await fetch(currentUrl, { ...init, redirect: "manual" });

		if (resp.status < 300 || resp.status >= 400) {
			return resp;
		}

		const location = resp.headers.get("location");
		if (!location) return resp;

		// Resolve relative redirects
		const resolved = new URL(location, currentUrl).href;

		// Re-validate redirect target against SSRF
		try {
			const target = new URL(resolved);
			if (!/^https?:$/i.test(target.protocol)) {
				throw new Error(`Redirect to non-HTTP protocol: ${target.protocol}`);
			}
			if (isPrivateHost(target.hostname)) {
				throw new Error("Redirect targets a private/internal network");
			}
		} catch (e) {
			if (e instanceof Error && e.message.includes("private")) throw e;
			throw new Error(`Invalid redirect target: ${resolved}`);
		}

		currentUrl = resolved;
	}

	throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

// ── Tool Definition ────────────────────────────────────────

export const fetchPageTool = (_env: Env) =>
	createTool({
		id: "fetch_page",
		description:
			"Fetch a URL via HTTP (no browser needed — fast and free). " +
			"Returns headers, body, internal links, and SEO meta tags. " +
			"Use for: sitemap.xml, robots.txt, HTML page SEO audit, link discovery. " +
			"Much faster than capture_har — use this for discovery and SEO checks.",
		inputSchema: fetchPageInputSchema,
		outputSchema: fetchPageOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const {
				url,
				extractLinks: doExtractLinks,
				maxBodyKB,
				headers: customHeaders,
				cookies,
			} = context;

			try {
				// Build headers
				const headers: Record<string, string> = {
					"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
					accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				};

				// Apply sanitized custom headers
				if (customHeaders) {
					Object.assign(headers, sanitizeHeaders(customHeaders));
				}

				// Build cookie header
				if (cookies) {
					const cookieStr = Object.entries(cookies)
						.map(([k, v]) => `${k}=${v}`)
						.join("; ");
					if (cookieStr) headers.cookie = cookieStr;
				}

				const resp = await safeFetch(url, {
					headers,
					signal: AbortSignal.timeout(15_000),
				});

				const status = resp.status;
				const contentType = resp.headers.get("content-type") ?? undefined;

				// Collect response headers
				const respHeaders: Record<string, string> = {};
				resp.headers.forEach((value, key) => {
					respHeaders[key] = value;
				});

				// Read body with size limit (streaming)
				const maxBytes = maxBodyKB * 1024;
				let body = "";
				let truncated = false;
				let totalBytes = 0;

				if (resp.body) {
					const reader = resp.body.getReader();
					const decoder = new TextDecoder();
					const chunks: string[] = [];

					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						totalBytes += value.byteLength;
						if (totalBytes <= maxBytes) {
							chunks.push(decoder.decode(value, { stream: true }));
						} else {
							// Add partial chunk up to limit
							const overshoot = totalBytes - maxBytes;
							const usable = value.byteLength - overshoot;
							if (usable > 0) {
								chunks.push(
									decoder.decode(value.slice(0, usable), { stream: true }),
								);
							}
							truncated = true;
							reader.cancel();
							break;
						}
					}

					body = chunks.join("");
				}

				const bodyKB = Math.round(totalBytes / 1024);

				// Extract data based on content type
				const isHtml =
					contentType?.includes("html") ||
					body.trimStart().startsWith("<!") ||
					body.trimStart().startsWith("<html");
				const isXml =
					contentType?.includes("xml") || body.trimStart().startsWith("<?xml");

				let links: string[] | undefined;
				let sitemapUrls: string[] | undefined;
				let seo: Record<string, string> | undefined;

				if (isXml && body.includes("<loc>")) {
					sitemapUrls = extractSitemapUrls(body);
				}

				if (isHtml) {
					if (doExtractLinks) {
						links = extractLinks(body, url);
					}
					seo = extractSeoMeta(body);
				}

				return {
					url,
					finalUrl: resp.url !== url ? resp.url : undefined,
					status,
					headers: respHeaders,
					contentType,
					bodyKB,
					truncated: truncated || undefined,
					body,
					links,
					sitemapUrls,
					seo,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					status: 0,
					error: msg,
				};
			}
		},
	});
