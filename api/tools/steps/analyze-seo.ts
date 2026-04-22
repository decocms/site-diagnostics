import { createTool } from "@decocms/runtime/tools";
import { cachedRun } from "../../../src/cache/cached-run.ts";
import type { KVStore } from "../../../src/cache/interface.ts";
import { KEYS } from "../../../src/cache/keys.ts";
import { analyzeSeo } from "../../../src/workflows/diagnose/04-analyze-seo.ts";
import type { SampleSet } from "../../../src/workflows/diagnose/types.ts";
import type { Env } from "../../types/env.ts";
import { analyzeSeoInputSchema, analyzeSeoOutputSchema } from "./schemas.ts";

export const analyzeSeoToolFactory = (cache?: KVStore) => (_env: Env) =>
	createTool({
		id: "analyze_seo",
		description:
			"Deep SEO analysis: DataForSEO on-page crawl (up to 100 pages) + page-level meta " +
			"extraction for the sampled URLs + JSON-LD sampling on 5 PDPs. Returns SeoData with " +
			"audit score, issues, per-page meta, sitemap health, and domain signals (SSL, sitemap, " +
			"robots, HTTP/2). Cached per-domain for 24h. Takes 1-3 minutes. " +
			"Input: `url` + the `samples` object from `discover`.",
		inputSchema: analyzeSeoInputSchema,
		outputSchema: analyzeSeoOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url } = context;
			const samples = context.samples as SampleSet;
			const result = await cachedRun({
				cache,
				...KEYS.analyzeSeo({ url }),
				fn: () => analyzeSeo(url, samples),
			});
			return result as unknown as Record<string, unknown>;
		},
	});
