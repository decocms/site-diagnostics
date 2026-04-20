import type { DiscoveryResult, SampleSet } from "./types.ts";

/**
 * Deterministic sample selection from discovery results.
 * Pure function, no I/O.
 *
 * Rules:
 * - PDPs: up to 3, prefer shorter URLs (less likely to be variants), spread across categories
 * - PLPs: up to 2, top-level collection/category pages
 * - Editorial: 0-1, first link from the first editorial path that was found
 */
export function selectSamples(discovery: DiscoveryResult): SampleSet {
	const { crawl, editorial } = discovery;
	const homepage = new URL(
		crawl.allUrls.find((u) => {
			try {
				const parsed = new URL(u);
				return parsed.pathname === "/" || parsed.pathname === "";
			} catch {
				return false;
			}
		}) ??
			crawl.allUrls[0] ??
			"",
	).origin;

	return {
		homepage,
		pdps: selectPdps(crawl.sampleUrls.pdp),
		plps: selectPlps(crawl.sampleUrls.plp),
		editorial: selectEditorial(editorial.paths, crawl.sampleUrls.blog),
	};
}

/**
 * Pick up to 3 PDPs, preferring shorter URLs (less likely to be variant pages).
 * Spread across different path prefixes for category diversity.
 */
function selectPdps(pdpUrls: string[]): string[] {
	if (pdpUrls.length === 0) return [];

	// Sort by URL length (shorter = more likely a canonical product page)
	const sorted = [...pdpUrls].sort((a, b) => a.length - b.length);

	// Pick up to 3, trying to get different path prefixes (different categories)
	const selected: string[] = [];
	const seenPrefixes = new Set<string>();

	for (const url of sorted) {
		if (selected.length >= 3) break;

		const prefix = getPathPrefix(url);
		if (!seenPrefixes.has(prefix) || selected.length < 2) {
			selected.push(url);
			seenPrefixes.add(prefix);
		}
	}

	// If we didn't get 3 from diverse prefixes, fill from remaining
	if (selected.length < 3) {
		for (const url of sorted) {
			if (selected.length >= 3) break;
			if (!selected.includes(url)) {
				selected.push(url);
			}
		}
	}

	return selected;
}

/**
 * Pick up to 2 PLPs, preferring top-level pages (fewer path segments).
 */
function selectPlps(plpUrls: string[]): string[] {
	if (plpUrls.length === 0) return [];

	const sorted = [...plpUrls].sort((a, b) => {
		const segA = new URL(a).pathname.split("/").filter(Boolean).length;
		const segB = new URL(b).pathname.split("/").filter(Boolean).length;
		return segA - segB;
	});

	return sorted.slice(0, 2);
}

/**
 * Pick 0-1 editorial URLs. Prefer from the first editorial path that exists,
 * falling back to blog URLs from crawl results.
 */
function selectEditorial(
	editorialPaths: { path: string; exists: boolean; linkCount: number }[],
	blogUrls: string[],
): string[] {
	// First: look for an editorial path that exists and has links
	const found = editorialPaths.find((p) => p.exists && p.linkCount > 0);
	if (found && blogUrls.length > 0) {
		// Find a blog URL that matches this editorial path
		const matching = blogUrls.find((u) => u.toLowerCase().includes(found.path));
		if (matching) return [matching];
	}

	// Fallback: first blog URL from crawl
	if (blogUrls.length > 0) return [blogUrls[0]];

	return [];
}

/**
 * Extract path prefix for category diversity.
 * e.g. "/shoes/nike-air-max/p" → "/shoes"
 */
function getPathPrefix(url: string): string {
	try {
		const segments = new URL(url).pathname.split("/").filter(Boolean);
		return segments.length > 0 ? `/${segments[0]}` : "/";
	} catch {
		return "/";
	}
}
