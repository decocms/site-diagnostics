import { createTool } from "@decocms/runtime/tools";
import { cachedRun } from "../../../src/cache/cached-run.ts";
import type { KVStore } from "../../../src/cache/interface.ts";
import { discover } from "../../../src/workflows/diagnose/01-discover.ts";
import { selectSamples } from "../../../src/workflows/diagnose/02-select-samples.ts";
import type { Env } from "../../types/env.ts";
import { discoverInputSchema, discoverOutputSchema } from "./schemas.ts";

export const discoverToolFactory = (cache?: KVStore) => (_env: Env) =>
	createTool({
		id: "discover",
		description:
			"Site discovery: crawl + sitemap + robots + homepage meta + editorial probes. " +
			"Returns a DiscoveryResult plus a SampleSet of URLs (homepage, 3 PDPs, 2 PLPs, 0-1 editorial) " +
			"suitable for the analyze_* tools. Cached per-domain for 24h. " +
			"Call this first — all other step tools depend on its output.",
		inputSchema: discoverInputSchema,
		outputSchema: discoverOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url } = context;
			const discovery = await cachedRun(cache, "discover", "public", url, () =>
				discover(url),
			);
			const samples = selectSamples(discovery);
			return { ...discovery, samples } as unknown as Record<string, unknown>;
		},
	});
