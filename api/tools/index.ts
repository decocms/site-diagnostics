import { captureHarTool } from "./capture-har.ts";
import { fetchPageTool } from "./fetch-page.ts";
import { helloTool } from "./hello.ts";
import { lighthouseTool } from "./lighthouse.ts";
import { renderPageTool } from "./render-page.ts";
import { screenshotTool } from "./screenshot.ts";

export const tools = [
	helloTool,
	fetchPageTool,
	captureHarTool,
	lighthouseTool,
	renderPageTool,
	screenshotTool,
];
