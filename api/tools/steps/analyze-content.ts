import { createTool } from "@decocms/runtime/tools";
import { cachedRun } from "../../../src/cache/cached-run.ts";
import type { KVStore } from "../../../src/cache/interface.ts";
import { KEYS } from "../../../src/cache/keys.ts";
import { analyzeContent } from "../../../src/workflows/diagnose/05-analyze-content.ts";
import type {
	DiscoveryResult,
	SampleSet,
} from "../../../src/workflows/diagnose/types.ts";
import type { Env } from "../../types/env.ts";
import {
	analyzeContentInputSchema,
	analyzeContentOutputSchema,
} from "./schemas.ts";

export const analyzeContentToolFactory = (cache?: KVStore) => (_env: Env) =>
	createTool({
		id: "analyze_content",
		description:
			"Content analysis: Firecrawl-scrape 3-5 PDPs + up to 2 editorial posts, detect reviews, " +
			"cross-sell, JSON-LD types, description length, image counts, image alts. " +
			"Returns ContentData. Cached per-domain for 24h. " +
			"Input: `samples` + `discovery` (both from the `discover` tool).",
		inputSchema: analyzeContentInputSchema,
		outputSchema: analyzeContentOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context, runtimeContext }) => {
			const samples = context.samples as SampleSet;
			const discovery = context.discovery as unknown as DiscoveryResult;
			const origin = runtimeContext?.req
				? new URL(runtimeContext.req.url).origin
				: "";
			const result = await cachedRun({
				cache,
				...KEYS.analyzeContent({ url: samples.homepage }),
				fn: () => analyzeContent(samples, discovery, origin),
			});
			return result as unknown as Record<string, unknown>;
		},
	});
