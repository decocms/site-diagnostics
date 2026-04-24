import type { KVStore } from "../../src/cache/interface.ts";
import { auditSeoTool } from "./audit-seo.ts";
import { captureHarTool } from "./capture-har.ts";
import { checkUrlsTool } from "./check-urls.ts";
import { collectSiteLinksTool } from "./collect-site-links.ts";
import { crawlSiteTool } from "./crawl-site.ts";
import { deleteDiagnosticTool } from "./delete-diagnostic.ts";
import { diagnoseTool } from "./diagnose.ts";
import { fetchPageTool } from "./fetch-page.ts";
import { lighthouseTool } from "./lighthouse.ts";
import { listDiagnosticsTool } from "./list-diagnostics.ts";
import { loadDiagnosticTool } from "./load-diagnostic.ts";
import { pagespeedInsightsTool } from "./pagespeed-insights.ts";
import { publishDiagnosticTool } from "./publish-diagnostic.ts";
import { renderPageTool } from "./render-page.ts";
import { researchBusinessTool } from "./research-business.ts";
import { researchKeywordsTool } from "./research-keywords.ts";
import { researchSerpTool } from "./research-serp.ts";
import { researchTrafficTool } from "./research-traffic.ts";
import { saveDiagnosticTool } from "./save-diagnostic.ts";
import { scrapePageTool } from "./scrape-page.ts";
import { screenshotTool } from "./screenshot.ts";
import { analyzeContentToolFactory } from "./steps/analyze-content.ts";
import { analyzePerfToolFactory } from "./steps/analyze-perf.ts";
import { analyzeSeoToolFactory } from "./steps/analyze-seo.ts";
import { discoverToolFactory } from "./steps/discover.ts";
import { researchToolFactory } from "./steps/research.ts";
import { unpublishDiagnosticTool } from "./unpublish-diagnostic.ts";

/**
 * Tools that operate on public (blackbox) data only. Available to any
 * client on `/api/mcp`, no auth required.
 */
export const publicTools = [
	diagnoseTool,
	fetchPageTool,
	captureHarTool,
	lighthouseTool,
	pagespeedInsightsTool,
	renderPageTool,
	screenshotTool,
	crawlSiteTool,
	collectSiteLinksTool,
	checkUrlsTool,
	auditSeoTool,
	researchSerpTool,
	researchKeywordsTool,
	researchBusinessTool,
	researchTrafficTool,
	scrapePageTool,
	saveDiagnosticTool,
	listDiagnosticsTool,
	loadDiagnosticTool,
	deleteDiagnosticTool,
	publishDiagnosticTool,
	unpublishDiagnosticTool,
];

/**
 * Tools that query proprietary per-org data (CDN data lake, HyperDX,
 * BigQuery, repo). Only visible to clients that connect with
 * `?proprietary` AND have an authenticated (non-anonymous) session.
 * Populated in a follow-up PR.
 */
export const proprietaryTools: typeof publicTools = [];

/** Back-compat export — equals publicTools since proprietaryTools is empty. */
export const tools = [...publicTools, ...proprietaryTools];

/**
 * Step-level pipeline tools — the high-level orchestration surface.
 * Clients that connect via `/api/mcp?steps` only see these five tools
 * and drive the pipeline themselves. Each tool wraps a pure step
 * function from `src/workflows/diagnose/` with optional per-domain
 * caching (injected via `cache`).
 */
export function createStepTools(cache?: KVStore) {
	return [
		discoverToolFactory(cache),
		analyzePerfToolFactory(cache),
		analyzeSeoToolFactory(cache),
		analyzeContentToolFactory(cache),
		researchToolFactory(cache),
	];
}
