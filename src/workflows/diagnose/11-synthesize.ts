import { complete, completeJSON } from "../../integrations/anthropic.ts";
import { BUSINESS_ANALYST_SYSTEM } from "../../prompts/business-analyst.ts";
import { CONTENT_ANALYST_SYSTEM } from "../../prompts/content-analyst.ts";
import { PERF_ANALYST_SYSTEM } from "../../prompts/perf-analyst.ts";
import { SEO_ANALYST_SYSTEM } from "../../prompts/seo-analyst.ts";
import { SYNTHESIZER_SYSTEM } from "../../prompts/synthesizer.ts";
import type {
	AnalyticsData,
	CdnData,
	ContentData,
	DiscoveryResult,
	HyperDxData,
	PerfData,
	RepoData,
	ResearchData,
	SampleSet,
	SeoData,
} from "./types.ts";

// ── Types ────────────────────────────────────────────────

export interface Finding {
	id: string;
	title: string;
	severity: "high" | "medium" | "low";
	pagesAffected: number | string;
	evidence: string;
}

export interface SpecialistSection {
	markdown: string;
	scores: Record<string, number>;
	findings: Finding[];
}

export interface ScoreBreakdown {
	structuredData: number;
	contentEngine: number;
	productSeo: number;
	performance: number;
	socialProof: number;
	crossSell: number;
	domainSignals: number;
}

export interface DiagnosticReport {
	url: string;
	healthScore: number;
	scoreBreakdown: ScoreBreakdown;
	findings: Finding[];
	report: string;
	metadata: {
		date: string;
		platform: string | null;
		cdn: string | null;
		language: string;
	};
}

export interface DataBundle {
	discovery: DiscoveryResult;
	samples: SampleSet;
	perf: PerfData;
	seo: SeoData;
	content: ContentData;
	research: ResearchData;
	cdn?: CdnData | null;
	hyperdx?: HyperDxData | null;
	bigquery?: AnalyticsData | null;
	repo?: RepoData | null;
}

// ── Specialist Calls ─────────────────────────────────────

async function runSpecialist(
	system: string,
	data: unknown,
): Promise<SpecialistSection> {
	const prompt = `Analyze the following data and produce your assessment as JSON.\n\n${JSON.stringify(data, null, 2)}`;
	return completeJSON<SpecialistSection>(prompt, { system });
}

async function runPerfAnalyst(
	perf: PerfData,
	cdn: CdnData | null | undefined,
	hyperdx: HyperDxData | null | undefined,
): Promise<SpecialistSection> {
	return runSpecialist(PERF_ANALYST_SYSTEM, { perf, cdn, hyperdx });
}

async function runSeoAnalyst(
	seo: SeoData,
	repo: RepoData | null | undefined,
): Promise<SpecialistSection> {
	return runSpecialist(SEO_ANALYST_SYSTEM, { seo, repo });
}

async function runContentAnalyst(
	content: ContentData,
): Promise<SpecialistSection> {
	return runSpecialist(CONTENT_ANALYST_SYSTEM, content);
}

async function runBusinessAnalyst(
	research: ResearchData,
	bigquery: AnalyticsData | null | undefined,
): Promise<SpecialistSection> {
	const prompt = `Analyze the following data and produce your assessment as JSON.\n\n${JSON.stringify({ research, bigquery }, null, 2)}`;
	// Business analyst returns no scores, just markdown + findings
	const result = await completeJSON<{ markdown: string; findings: Finding[] }>(
		prompt,
		{ system: BUSINESS_ANALYST_SYSTEM },
	);
	return { markdown: result.markdown, scores: {}, findings: result.findings };
}

// ── Report Synthesizer ───────────────────────────────────

async function runSynthesizer(
	sections: {
		perf: SpecialistSection;
		seo: SpecialistSection;
		content: SpecialistSection;
		business: SpecialistSection;
	},
	metadata: {
		url: string;
		date: string;
		platform: string | null;
		language: string;
		traffic: ResearchData["traffic"];
		discovery: DiscoveryResult;
	},
): Promise<string> {
	const prompt = `Compose the final diagnostic report from the specialist analyses below.

## Metadata
${JSON.stringify(metadata, null, 2)}

## Performance Analysis
${JSON.stringify(sections.perf, null, 2)}

## SEO Analysis
${JSON.stringify(sections.seo, null, 2)}

## Content Analysis
${JSON.stringify(sections.content, null, 2)}

## Business Analysis
${JSON.stringify(sections.business, null, 2)}

Produce the full markdown report following your template. Output ONLY the markdown report, no code fences.`;

	return complete(prompt, {
		system: SYNTHESIZER_SYSTEM,
		model: "claude-opus-4-20250514",
		maxTokens: 16384,
	});
}

// ── Main Entry Point ─────────────────────────────────────

/**
 * Multi-agent synthesis: runs 4 specialist agents in parallel,
 * then composes the final report with the synthesizer.
 */
export async function synthesize(
	bundle: DataBundle,
	lang: string,
): Promise<DiagnosticReport> {
	const {
		discovery,
		perf,
		seo,
		content,
		research,
		cdn,
		hyperdx,
		bigquery,
		repo,
	} = bundle;

	// Phase A: Parallel specialist agents
	const [perfSection, seoSection, contentSection, businessSection] =
		await Promise.all([
			runPerfAnalyst(perf, cdn, hyperdx),
			runSeoAnalyst(seo, repo),
			runContentAnalyst(content),
			runBusinessAnalyst(research, bigquery),
		]);

	// Calculate health score from specialist scores
	const scoreBreakdown: ScoreBreakdown = {
		performance: perfSection.scores.performance ?? 0,
		structuredData: seoSection.scores.structuredData ?? 0,
		domainSignals: seoSection.scores.domainSignals ?? 0,
		contentEngine: contentSection.scores.contentEngine ?? 0,
		productSeo: contentSection.scores.productSeo ?? 0,
		socialProof: contentSection.scores.socialProof ?? 0,
		crossSell: contentSection.scores.crossSell ?? 0,
	};
	const healthScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);

	// Collect all findings
	const findings = [
		...perfSection.findings,
		...seoSection.findings,
		...contentSection.findings,
		...businessSection.findings,
	];

	// Phase B: Report synthesizer
	const url = bundle.samples.homepage;
	const metadata = {
		url,
		date: new Date().toISOString().split("T")[0],
		platform: discovery.homepage.platform,
		language: lang,
		traffic: research.traffic,
		discovery,
	};

	const report = await runSynthesizer(
		{
			perf: perfSection,
			seo: seoSection,
			content: contentSection,
			business: businessSection,
		},
		metadata,
	);

	return {
		url,
		healthScore,
		scoreBreakdown,
		findings,
		report,
		metadata: {
			date: metadata.date,
			platform: discovery.homepage.platform,
			cdn: discovery.homepage.cdn,
			language: lang,
		},
	};
}
