import { createTool } from "@decocms/runtime/tools";
import { cachedRun } from "../../../src/cache/cached-run.ts";
import type { KVStore } from "../../../src/cache/interface.ts";
import { KEYS } from "../../../src/cache/keys.ts";
import { research } from "../../../src/workflows/diagnose/06-research.ts";
import type { DiscoveryResult } from "../../../src/workflows/diagnose/types.ts";
import type { Env } from "../../types/env.ts";
import { researchInputSchema, researchOutputSchema } from "./schemas.ts";

export const researchToolFactory = (cache?: KVStore) => (_env: Env) =>
	createTool({
		id: "research",
		description:
			"External research: Similarweb traffic (via Apify), Perplexity business context + " +
			"competitors + news, DataForSEO SERP results for brand + brand+category, and " +
			"keyword metrics for 3-5 seeds derived from the discovery. Returns ResearchData. " +
			"Cached per-domain for 7 days. " +
			"Input: `url` + `discovery` from the `discover` tool.",
		inputSchema: researchInputSchema,
		outputSchema: researchOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url } = context;
			const discovery = context.discovery as unknown as DiscoveryResult;
			const result = await cachedRun({
				cache,
				...KEYS.research({ url }),
				fn: () => research(url, discovery),
			});
			return result as unknown as Record<string, unknown>;
		},
	});
