import { captureHarTool } from "./capture-har.ts";
import { diagnoseTool } from "./diagnose.ts";
import { fetchPageTool } from "./fetch-page.ts";
import { lighthouseTool } from "./lighthouse.ts";
import { renderPageTool } from "./render-page.ts";
import { screenshotTool } from "./screenshot.ts";

export const tools = [
	diagnoseTool,
	fetchPageTool,
	captureHarTool,
	lighthouseTool,
	renderPageTool,
	screenshotTool,
];
