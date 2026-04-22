import { createTool } from "@decocms/runtime/tools";
import { cachedRun } from "../../../src/cache/cached-run.ts";
import type { KVStore } from "../../../src/cache/interface.ts";
import { analyzePerformance } from "../../../src/workflows/diagnose/03-analyze-perf.ts";
import type { SampleSet } from "../../../src/workflows/diagnose/types.ts";
import type { Env } from "../../types/env.ts";
import { analyzePerfInputSchema, analyzePerfOutputSchema } from "./schemas.ts";

export const analyzePerfToolFactory = (cache?: KVStore) => (_env: Env) =>
	createTool({
		id: "analyze_perf",
		description:
			"Performance analysis: HAR capture (cold + warm), Lighthouse audit (mobile), " +
			"and screenshots (desktop) across the sampled pages. Returns PerfData with per-URL " +
			"TTFB, weight, third-party inventory, cache hits, Core Web Vitals, and screenshot URLs. " +
			"Cached per-domain for 24h. Input: the `samples` object from `discover`.",
		inputSchema: analyzePerfInputSchema,
		outputSchema: analyzePerfOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context, runtimeContext }) => {
			const samples = context.samples as SampleSet;
			const origin = runtimeContext?.req
				? new URL(runtimeContext.req.url).origin
				: "";
			const result = await cachedRun(
				cache,
				"analyzePerf",
				"public",
				samples.homepage,
				() => analyzePerformance(samples, origin),
			);
			return result as unknown as Record<string, unknown>;
		},
	});
