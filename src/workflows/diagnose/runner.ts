import type { KVStore } from "../../cache/interface.ts";
import { discover } from "./01-discover.ts";
import { selectSamples } from "./02-select-samples.ts";
import { analyzePerformance } from "./03-analyze-perf.ts";
import { analyzeSeo } from "./04-analyze-seo.ts";
import { analyzeContent } from "./05-analyze-content.ts";
import { research } from "./06-research.ts";
import type {
	ContentData,
	DiscoveryResult,
	PerfData,
	ResearchData,
	SampleSet,
	SeoData,
} from "./types.ts";

// ── Types ─────────────────────────────────────────────────

export interface PipelineConfig {
	url: string;
}

export interface PipelineResult {
	discovery: DiscoveryResult;
	samples: SampleSet;
	perf: PerfData;
	seo: SeoData;
	content: ContentData;
	research: ResearchData;
}

export type ProgressStatus = "running" | "done" | "error" | "skipped";

export type ProgressCallback = (event: {
	step: string;
	status: ProgressStatus;
	message?: string;
}) => void;

// ── Cache Helper ──────────────────────────────────────────

const STEP_TTLS: Record<string, number> = {
	discover: 24 * 60 * 60 * 1000,
	analyzePerf: 24 * 60 * 60 * 1000,
	analyzeSeo: 24 * 60 * 60 * 1000,
	analyzeContent: 24 * 60 * 60 * 1000,
	research: 7 * 24 * 60 * 60 * 1000,
};

function cacheKey(domain: string, step: string): string {
	return `${domain}:${step}`;
}

async function cachedRun<T>(
	cache: KVStore,
	step: string,
	url: string,
	fn: () => Promise<T>,
): Promise<T> {
	const domain = new URL(url).hostname;
	const key = cacheKey(domain, step);
	const cached = await cache.get<T>(key);
	if (cached !== null) return cached;
	const result = await fn();
	const ttl = STEP_TTLS[step];
	await cache.set(key, result, ttl);
	return result;
}

// ── Pipeline Runner ──────────────────────────────────────

/**
 * Runs the public diagnostic pipeline (steps 1-6).
 * All steps are deterministic pure functions. Caching is handled at
 * the orchestration layer, not inside the functions.
 */
export async function runPublicPipeline(
	config: PipelineConfig,
	cache: KVStore,
	onProgress?: ProgressCallback,
): Promise<PipelineResult> {
	const { url } = config;

	// Step 1: Discover
	onProgress?.({ step: "discover", status: "running" });
	const discovery = await cachedRun(cache, "discover", url, () =>
		discover(url),
	);
	onProgress?.({
		step: "discover",
		status: "done",
		message: `${discovery.crawl.totalPages} pages discovered`,
	});

	// Step 2: Select samples (pure, no cache needed)
	const samples = selectSamples(discovery);

	// Steps 3-6: Parallel
	onProgress?.({ step: "analyzePerf", status: "running" });
	onProgress?.({ step: "analyzeSeo", status: "running" });
	onProgress?.({ step: "analyzeContent", status: "running" });
	onProgress?.({ step: "research", status: "running" });

	const [perf, seo, content, researchData] = await Promise.all([
		cachedRun(cache, "analyzePerf", url, () => analyzePerformance(samples)),
		cachedRun(cache, "analyzeSeo", url, () => analyzeSeo(url, samples)),
		cachedRun(cache, "analyzeContent", url, () =>
			analyzeContent(samples, discovery),
		),
		cachedRun(cache, "research", url, () => research(url, discovery)),
	]);

	onProgress?.({ step: "analyzePerf", status: "done" });
	onProgress?.({ step: "analyzeSeo", status: "done" });
	onProgress?.({ step: "analyzeContent", status: "done" });
	onProgress?.({ step: "research", status: "done" });

	return { discovery, samples, perf, seo, content, research: researchData };
}
