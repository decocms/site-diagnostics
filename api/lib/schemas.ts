import { z } from "zod";
import { isPrivateHost } from "../../src/lib/ssrf.ts";

export const urlInput = z
	.string()
	.url()
	.refine((u) => /^https?:\/\//i.test(u), "Only http/https URLs allowed")
	.refine((u) => {
		try {
			return !isPrivateHost(new URL(u).hostname);
		} catch {
			return false;
		}
	}, "URLs targeting private/internal networks are not allowed");

export const deviceInput = z.enum(["desktop", "mobile"]).default("desktop");

export const proxyCountryInput = z
	.string()
	.regex(/^[a-z]{2}$/i, "Must be a 2-letter ISO country code")
	.transform((v) => v.toLowerCase())
	.optional();

/** Headers allowed in fetch_page custom headers */
export const ALLOWED_HEADERS = new Set([
	"accept",
	"accept-language",
	"user-agent",
	"cookie",
	"cache-control",
	"referer",
	"if-none-match",
	"if-modified-since",
]);

/** Filter headers to only allowed ones */
export function sanitizeHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (ALLOWED_HEADERS.has(lower)) {
			// Reject values with CRLF
			if (/[\r\n]/.test(value)) continue;
			result[key] = value;
		}
	}
	return result;
}
