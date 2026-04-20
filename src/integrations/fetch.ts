import {
	extractLinks,
	extractSeoMeta,
	extractSitemapUrls,
} from "../lib/html.ts";
import { isPrivateHost } from "../lib/ssrf.ts";

// ── Types ─────────────────────────────────────────────────

export interface FetchPageOptions {
	extractLinks?: boolean;
	maxBodyKB?: number;
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
	timeoutMs?: number;
}

export interface FetchPageResult {
	url: string;
	finalUrl?: string;
	status: number;
	headers?: Record<string, string>;
	contentType?: string;
	bodyKB?: number;
	truncated?: boolean;
	body?: string;
	links?: string[];
	sitemapUrls?: string[];
	seo?: Record<string, string>;
	error?: string;
}

// ── SSRF-safe redirect-following fetch ────────────────────

const MAX_REDIRECTS = 5;

const ALLOWED_HEADERS = new Set([
	"accept",
	"accept-language",
	"user-agent",
	"cookie",
	"cache-control",
	"referer",
	"if-none-match",
	"if-modified-since",
]);

function sanitizeHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (ALLOWED_HEADERS.has(lower)) {
			if (/[\r\n]/.test(value)) continue;
			result[key] = value;
		}
	}
	return result;
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
	let currentUrl = url;

	for (let i = 0; i < MAX_REDIRECTS; i++) {
		const resp = await fetch(currentUrl, { ...init, redirect: "manual" });

		if (resp.status < 300 || resp.status >= 400) {
			return resp;
		}

		const location = resp.headers.get("location");
		if (!location) return resp;

		const resolved = new URL(location, currentUrl).href;

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

// ── Core fetch function ───────────────────────────────────

export async function fetchPage(
	url: string,
	options: FetchPageOptions = {},
): Promise<FetchPageResult> {
	const {
		extractLinks: doExtractLinks = true,
		maxBodyKB = 512,
		headers: customHeaders,
		cookies,
		timeoutMs = 15_000,
	} = options;

	try {
		const headers: Record<string, string> = {
			"user-agent": "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)",
			accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		};

		if (customHeaders) {
			Object.assign(headers, sanitizeHeaders(customHeaders));
		}

		if (cookies) {
			const cookieStr = Object.entries(cookies)
				.map(([k, v]) => `${k}=${v}`)
				.join("; ");
			if (cookieStr) headers.cookie = cookieStr;
		}

		const resp = await safeFetch(url, {
			headers,
			signal: AbortSignal.timeout(timeoutMs),
		});

		const status = resp.status;
		const contentType = resp.headers.get("content-type") ?? undefined;

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
}
