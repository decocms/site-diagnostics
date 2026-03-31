import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { DIAGNOSE_RESOURCE_URI } from "../tools/diagnose.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const diagnoseAppResource = (_env: Env) =>
	createPublicResource({
		uri: DIAGNOSE_RESOURCE_URI,
		name: "Site Diagnostics UI",
		description:
			"Interactive diagnostics panel for running site audits via MCP Apps",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: DIAGNOSE_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
