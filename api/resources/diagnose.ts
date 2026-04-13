import { createPublicResource } from "@decocms/runtime/tools";
import { DIAGNOSE_RESOURCE_URI } from "../tools/diagnose.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

async function loadHtml(): Promise<string> {
	try {
		// Cloudflare Workers: wrangler bundles this as a text module via [[rules]]
		// biome-ignore lint/suspicious/noExplicitAny: module type varies by runtime
		const mod: any = await import("../../dist/client/index.html");
		return typeof mod === "string" ? mod : mod.default;
	} catch {
		// Local dev (Bun): read from disk
		const { readFile } = await import("node:fs/promises");
		const { dirname, join } = await import("node:path");
		const { fileURLToPath } = await import("node:url");
		const __dirname = dirname(fileURLToPath(import.meta.url));
		return readFile(
			join(__dirname, "..", "..", "dist", "client", "index.html"),
			"utf-8",
		);
	}
}

export const diagnoseAppResource = (_env: Env) =>
	createPublicResource({
		uri: DIAGNOSE_RESOURCE_URI,
		name: "Site Diagnostics UI",
		description:
			"Interactive diagnostics panel for running site audits via MCP Apps",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await loadHtml();
			return {
				uri: DIAGNOSE_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
