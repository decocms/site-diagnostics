import type { KVStore } from "../../cache/interface.ts";
import { discover } from "./01-discover.ts";
import { selectSamples } from "./02-select-samples.ts";
import { analyzePerformance } from "./03-analyze-perf.ts";
import { analyzeSeo } from "./04-analyze-seo.ts";
import { analyzeContent } from "./05-analyze-content.ts";
import { research } from "./06-research.ts";
import { sourceCdn } from "./07-source-cdn.ts";
import { sourceHyperDx } from "./08-source-hyperdx.ts";
import { sourceBigQuery } from "./09-source-bigquery.ts";
import { sourceRepo } from "./10-source-repo.ts";
import {
	type DataBundle,
	type DiagnosticReport,
	synthesize,
} from "./11-synthesize.ts";
import { type ActionProposal, proposeActions } from "./12-actions.ts";
import type {
	AnalyticsData,
	CdnData,
	ContentData,
	DiscoveryResult,
	HyperDxData,
	OrgCredentials,
	PerfData,
	RepoData,
	ResearchData,
	SampleSet,
	SeoData,
} from "./types.ts";

// ── Types ─────────────────────────────────────────────────

export interface PipelineConfig {
	url: string;
	orgId?: string;
	sources?: OrgCredentials;
}

export interface PipelineResult {
	discovery: DiscoveryResult;
	samples: SampleSet;
	perf: PerfData;
	seo: SeoData;
	content: ContentData;
	research: ResearchData;
	cdn: CdnData | null;
	hyperdx: HyperDxData | null;
	bigquery: AnalyticsData | null;
	repo: RepoData | null;
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

// ── Cache Helper ──────────────────────────────────────────

const STEP_TTLS: Record<string, number> = {
	discover: 24 * 60 * 60 * 1000,
	analyzePerf: 24 * 60 * 60 * 1000,
	analyzeSeo: 24 * 60 * 60 * 1000,
	analyzeContent: 24 * 60 * 60 * 1000,
	research: 7 * 24 * 60 * 60 * 1000,
	sourceCdn: 60 * 60 * 1000,
	// sourceHyperDx intentionally omitted — must be fresh to catch incidents
	sourceBigQuery: 6 * 60 * 60 * 1000,
	sourceRepo: 24 * 60 * 60 * 1000,
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

/**
 * Runs a proprietary source step if its config is present. Failures never
 * abort the pipeline — they're logged and the slot becomes null so the
 * synthesizer knows to omit that section.
 */
async function optionalSource<C, D>(
	config: C | undefined,
	step: string,
	fn: (c: C) => Promise<D>,
	onProgress?: ProgressCallback,
): Promise<D | null> {
	if (!config) {
		onProgress?.({ step, status: "skipped" });
		return null;
	}
	onProgress?.({ step, status: "running" });
	try {
		const result = await fn(config);
		onProgress?.({ step, status: "done" });
		return result;
	} catch (err) {
		console.warn(`[pipeline] ${step} failed: ${(err as Error).message}`);
		onProgress?.({ step, status: "error", message: (err as Error).message });
		return null;
	}
}

// ── Pipeline Runner ──────────────────────────────────────

/**
 * Runs the public + proprietary diagnostic pipeline (steps 1-10).
 *
 * Public steps (1-6) abort the pipeline on failure. Proprietary sources
 * (7-10) degrade gracefully to null when credentials are absent or the
 * source API is unavailable.
 */
export async function runPublicPipeline(
	config: PipelineConfig,
	cache: KVStore,
	onProgress?: ProgressCallback,
): Promise<PipelineResult> {
	const { url, sources = {} } = config;

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

	// Steps 3-10: Parallel (public steps + optional proprietary sources)
	onProgress?.({ step: "analyzePerf", status: "running" });
	onProgress?.({ step: "analyzeSeo", status: "running" });
	onProgress?.({ step: "analyzeContent", status: "running" });
	onProgress?.({ step: "research", status: "running" });

	const [perf, seo, content, researchData, cdn, hyperdx, bigquery, repo] =
		await Promise.all([
			cachedRun(cache, "analyzePerf", url, () => analyzePerformance(samples)),
			cachedRun(cache, "analyzeSeo", url, () => analyzeSeo(url, samples)),
			cachedRun(cache, "analyzeContent", url, () =>
				analyzeContent(samples, discovery),
			),
			cachedRun(cache, "research", url, () => research(url, discovery)),
			optionalSource(
				sources.cdn,
				"sourceCdn",
				(c) => cachedRun(cache, "sourceCdn", url, () => sourceCdn(c)),
				onProgress,
			),
			optionalSource(
				sources.hyperdx,
				"sourceHyperDx",
				sourceHyperDx,
				onProgress,
			),
			optionalSource(
				sources.bigquery,
				"sourceBigQuery",
				(c) =>
					cachedRun(cache, "sourceBigQuery", url, () => sourceBigQuery(c, url)),
				onProgress,
			),
			optionalSource(
				sources.repo,
				"sourceRepo",
				(c) => cachedRun(cache, "sourceRepo", url, () => sourceRepo(c)),
				onProgress,
			),
		]);

	onProgress?.({ step: "analyzePerf", status: "done" });
	onProgress?.({ step: "analyzeSeo", status: "done" });
	onProgress?.({ step: "analyzeContent", status: "done" });
	onProgress?.({ step: "research", status: "done" });

	return {
		discovery,
		samples,
		perf,
		seo,
		content,
		research: researchData,
		cdn,
		hyperdx,
		bigquery,
		repo,
	};
}

// ── Full Pipeline (includes synthesis) ───────────────────

/**
 * Runs the full diagnostic pipeline: data collection (steps 1-10)
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
		cdn,
		hyperdx,
		bigquery,
		repo,
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
		cdn,
		hyperdx,
		bigquery,
		repo,
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
