// ── Link Extraction ────────────────────────────────────────

/**
 * Extract <a href> values, resolve to absolute URLs,
 * filter to same-hostname only, deduplicate.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
	const base = new URL(baseUrl);
	const seen = new Set<string>();
	const links: string[] = [];

	const regex = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

	for (const match of html.matchAll(regex)) {
		const href = match[1].trim();
		if (
			!href ||
			href.startsWith("#") ||
			href.startsWith("javascript:") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:")
		) {
			continue;
		}

		try {
			const resolved = new URL(href, base);
			// Same hostname only
			if (resolved.hostname !== base.hostname) continue;
			// Normalize: remove fragment, ensure trailing consistency
			resolved.hash = "";
			const canonical = resolved.href;
			if (!seen.has(canonical)) {
				seen.add(canonical);
				links.push(canonical);
			}
		} catch {
			// Invalid URL, skip
		}
	}

	return links;
}

// ── Sitemap Extraction ─────────────────────────────────────

/** Extract <loc> tags from sitemap XML */
export function extractSitemapUrls(xml: string): string[] {
	const urls: string[] = [];
	const regex = /<loc>\s*(.*?)\s*<\/loc>/gi;

	for (const match of xml.matchAll(regex)) {
		const url = match[1].trim();
		if (url) urls.push(url);
	}

	return urls;
}

// ── SEO Meta Extraction ────────────────────────────────────

/**
 * Extract SEO-relevant metadata from HTML <head>.
 * Returns flat key-value pairs: title, description, canonical, og:*, etc.
 */
export function extractSeoMeta(html: string): Record<string, string> {
	const meta: Record<string, string> = {};

	// Title
	const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
	if (titleMatch) meta.title = titleMatch[1].trim();

	// Meta name tags
	const metaNameRegex =
		/<meta\s+[^>]*name\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*\/?>/gi;
	for (const match of html.matchAll(metaNameRegex)) {
		meta[match[1].toLowerCase()] = match[2];
	}

	// Also match content before name (attribute order varies)
	const metaNameRegex2 =
		/<meta\s+[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
	for (const match of html.matchAll(metaNameRegex2)) {
		const key = match[2].toLowerCase();
		if (!(key in meta)) meta[key] = match[1];
	}

	// Meta property tags (og:*, twitter:*)
	const metaPropRegex =
		/<meta\s+[^>]*property\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*\/?>/gi;
	for (const match of html.matchAll(metaPropRegex)) {
		meta[match[1].toLowerCase()] = match[2];
	}

	const metaPropRegex2 =
		/<meta\s+[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
	for (const match of html.matchAll(metaPropRegex2)) {
		const key = match[2].toLowerCase();
		if (!(key in meta)) meta[key] = match[1];
	}

	// Canonical
	const canonicalMatch = html.match(
		/<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i,
	);
	if (canonicalMatch) meta.canonical = canonicalMatch[1];

	const canonicalMatch2 = html.match(
		/<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["'][^>]*\/?>/i,
	);
	if (!meta.canonical && canonicalMatch2) meta.canonical = canonicalMatch2[1];

	// JSON-LD types
	const jsonLdRegex =
		/<script\s+[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
	const jsonLdTypes: string[] = [];
	for (const match of html.matchAll(jsonLdRegex)) {
		try {
			const data = JSON.parse(match[1]);
			if (data["@type"]) jsonLdTypes.push(data["@type"]);
			if (Array.isArray(data["@graph"])) {
				for (const item of data["@graph"]) {
					if (item["@type"]) jsonLdTypes.push(item["@type"]);
				}
			}
		} catch {
			// Invalid JSON-LD
		}
	}
	if (jsonLdTypes.length > 0) meta["json-ld:types"] = jsonLdTypes.join(", ");

	// Hreflang
	const hreflangRegex =
		/<link\s+[^>]*rel\s*=\s*["']alternate["'][^>]*hreflang\s*=\s*["']([^"']+)["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
	const hreflangs: string[] = [];
	for (const match of html.matchAll(hreflangRegex)) {
		hreflangs.push(`${match[1]}:${match[2]}`);
	}
	if (hreflangs.length > 0) meta.hreflang = hreflangs.join(" | ");

	return meta;
}

// ── Rich Meta Extraction (for render_page) ─────────────────

export interface ExtractedMeta {
	title: string | null;
	description: string | null;
	canonical: string | null;
	og: Record<string, string>;
	headings: Array<{ level: number; text: string }>;
	jsonLd: unknown[];
}

/**
 * Extract rich metadata from rendered HTML.
 * Superset of extractSeoMeta — also includes headings and full JSON-LD.
 */
export function extractMeta(html: string): ExtractedMeta {
	const seo = extractSeoMeta(html);

	// OG tags
	const og: Record<string, string> = {};
	for (const [key, value] of Object.entries(seo)) {
		if (key.startsWith("og:")) {
			og[key.replace("og:", "")] = value;
		}
	}

	// Headings (h1-h6, up to 30)
	const headings: Array<{ level: number; text: string }> = [];
	const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gis;
	for (const match of html.matchAll(headingRegex)) {
		if (headings.length >= 30) break;
		headings.push({
			level: Number.parseInt(match[1], 10),
			text: stripTags(match[2]).trim(),
		});
	}

	// JSON-LD (full objects)
	const jsonLd: unknown[] = [];
	const jsonLdRegex2 =
		/<script\s+[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
	for (const match of html.matchAll(jsonLdRegex2)) {
		try {
			jsonLd.push(JSON.parse(match[1]));
		} catch {
			// Invalid JSON-LD
		}
	}

	return {
		title: seo.title ?? null,
		description: seo.description ?? null,
		canonical: seo.canonical ?? null,
		og,
		headings,
		jsonLd,
	};
}

// ── Visible Text Extraction ────────────────────────────────

/** Strip HTML tags from a string */
function stripTags(html: string): string {
	return html.replace(/<[^>]+>/g, "");
}

/**
 * Extract visible text from HTML.
 * Removes scripts, styles, noscript, then strips remaining tags.
 */
export function extractVisibleText(html: string): string {
	let text = html;

	// Remove script, style, noscript blocks
	text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
	text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
	text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ");

	// Remove all remaining HTML tags
	text = stripTags(text);

	// Decode common HTML entities
	text = text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");

	// Collapse whitespace
	text = text.replace(/\s+/g, " ").trim();

	return text;
}
