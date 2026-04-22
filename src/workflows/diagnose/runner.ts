import { cachedRun } from "../../cache/cached-run.ts";
import type { KVStore } from "../../cache/interface.ts";
import { discover } from "./01-discover.ts";
import { selectSamples } from "./02-select-samples.ts";
import { analyzePerformance } from "./03-analyze-perf.ts";
import { analyzeSeo } from "./04-analyze-seo.ts";
import { analyzeContent } from "./05-analyze-content.ts";
import { research } from "./06-research.ts";
import {
	type DataBundle,
	type DiagnosticReport,
	synthesize,
} from "./11-synthesize.ts";
import { type ActionProposal, proposeActions } from "./12-actions.ts";
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

export interface FullPipelineResult extends PipelineResult {
	report: DiagnosticReport;
	actions: ActionProposal[];
}

export type ProgressStatus = "running" | "done" | "error" | "skipped";

export type ProgressCallback = (event: {
	step: string;
	status: ProgressStatus;
	message?: string;
}) => void;

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

// ── Full Pipeline (includes synthesis) ───────────────────

/**
 * Runs the full diagnostic pipeline: data collection (steps 1-6)
 * + multi-agent synthesis (step 11) + action proposals (step 12).
 * Requires ANTHROPIC_API_KEY for the synthesis step.
 */
export async function runFullPipeline(
	config: PipelineConfig,
	cache: KVStore,
	onProgress?: ProgressCallback,
): Promise<FullPipelineResult> {
	const publicResult = await runPublicPipeline(config, cache, onProgress);
	const {
		discovery,
		samples,
		perf,
		seo,
		content,
		research: researchData,
	} = publicResult;

	const url = config.url;
	const lang = new URL(url).hostname.endsWith(".br") ? "pt-BR" : "en";

	// Step 11: Synthesize (multi-agent, never cached)
	onProgress?.({ step: "synthesize", status: "running" });
	const bundle: DataBundle = {
		discovery,
		samples,
		perf,
		seo,
		content,
		research: researchData,
	};
	const report = await synthesize(bundle, lang);
	onProgress?.({
		step: "synthesize",
		status: "done",
		message: `Health score: ${report.healthScore}/100`,
	});

	// Step 12: Actions (never cached)
	onProgress?.({ step: "actions", status: "running" });
	const actions = proposeActions(report.findings);
	onProgress?.({
		step: "actions",
		status: "done",
		message: `${actions.length} actions proposed`,
	});

	return { ...publicResult, report, actions };
}
