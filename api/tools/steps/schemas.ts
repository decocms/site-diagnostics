import { z } from "zod";
import { urlInput } from "../../lib/schemas.ts";

/**
 * Schemas for the step-level pipeline tools. The nested pipeline types
 * (DiscoveryResult, SampleSet, etc.) are complex and are meant to flow
 * opaquely between tools — the model receives an object from `discover`
 * and passes it to `analyze_*`. We validate shape at the TS layer inside
 * each step function; the MCP schemas describe intent and shape at the
 * top level only.
 */

export const sampleSetSchema = z
	.object({
		homepage: z.string(),
		pdps: z.array(z.string()),
		plps: z.array(z.string()),
		editorial: z.array(z.string()),
	})
	.describe("Sample URLs picked by `discover`. Pass through as returned.");

export const discoveryResultSchema = z
	.looseObject({})
	.describe(
		"The full DiscoveryResult object returned by `discover`. Pass through as returned — do not reshape.",
	);

export { urlInput };

// ── Input schemas ────────────────────────────────────────

export const discoverInputSchema = z.object({
	url: urlInput.describe("The site URL to diagnose (e.g. https://example.com)"),
});

export const analyzePerfInputSchema = z.object({
	samples: sampleSetSchema,
});

export const analyzeSeoInputSchema = z.object({
	url: urlInput,
	samples: sampleSetSchema,
});

export const analyzeContentInputSchema = z.object({
	samples: sampleSetSchema,
	discovery: discoveryResultSchema,
});

export const researchInputSchema = z.object({
	url: urlInput,
	discovery: discoveryResultSchema,
});

// ── Output schemas ───────────────────────────────────────
// Loose — the step functions return typed objects at the TS layer;
// MCP output is documented in each tool's description.

const passthrough = () => z.looseObject({});

export const discoverOutputSchema = passthrough().describe(
	"DiscoveryResult + selected samples. Keys: crawl, sitemap, robots, homepage, editorial, samples.",
);

export const analyzePerfOutputSchema = passthrough().describe(
	"PerfData. Keys: hars, lighthouses, screenshots.",
);

export const analyzeSeoOutputSchema = passthrough().describe(
	"SeoData. Keys: audit, pageMeta, sitemapHealth, domainSignals.",
);

export const analyzeContentOutputSchema = passthrough().describe(
	"ContentData. Keys: pdpScrapes, editorialScrapes, screenshots.",
);

export const researchOutputSchema = passthrough().describe(
	"ResearchData. Keys: traffic, business, serp, keywords.",
);
