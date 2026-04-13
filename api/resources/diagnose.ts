import { createPublicResource } from "@decocms/runtime/tools";
import { DIAGNOSE_RESOURCE_URI } from "../tools/diagnose.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createDiagnoseAppResource =
	(getClientHTML: () => Promise<string>) => (_env: Env) =>
		createPublicResource({
			uri: DIAGNOSE_RESOURCE_URI,
			name: "Site Diagnostics UI",
			description:
				"Interactive diagnostics panel for running site audits via MCP Apps",
			mimeType: RESOURCE_MIME_TYPE,
			read: async () => {
				const html = await getClientHTML();
				return {
					uri: DIAGNOSE_RESOURCE_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: html,
				};
			},
		});
