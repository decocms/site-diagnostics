import { auditSeoTool } from "./audit-seo.ts";
import { captureHarTool } from "./capture-har.ts";
import { crawlSiteTool } from "./crawl-site.ts";
import { deleteDiagnosticTool } from "./delete-diagnostic.ts";
import { diagnoseTool } from "./diagnose.ts";
import { fetchPageTool } from "./fetch-page.ts";
import { lighthouseTool } from "./lighthouse.ts";
import { listDiagnosticsTool } from "./list-diagnostics.ts";
import { loadDiagnosticTool } from "./load-diagnostic.ts";
import { renderPageTool } from "./render-page.ts";
import { researchBusinessTool } from "./research-business.ts";
import { researchKeywordsTool } from "./research-keywords.ts";
import { researchSerpTool } from "./research-serp.ts";
import { researchTrafficTool } from "./research-traffic.ts";
import { saveDiagnosticTool } from "./save-diagnostic.ts";
import { scrapePageTool } from "./scrape-page.ts";
import { screenshotTool } from "./screenshot.ts";

export const tools = [
	diagnoseTool,
	fetchPageTool,
	captureHarTool,
	lighthouseTool,
	renderPageTool,
	screenshotTool,
	crawlSiteTool,
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
];
