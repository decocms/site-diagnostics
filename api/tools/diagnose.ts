import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const DIAGNOSE_RESOURCE_URI = "ui://site-diagnostics/diagnose";

const diagnoseInputSchema = z.object({});

const diagnoseOutputSchema = z.object({
	message: z.string(),
});

export const diagnoseTool = (_env: Env) =>
	createTool({
		id: "diagnose",
		description:
			"Launch the site diagnostics UI. " +
			"Opens an interactive panel where users can enter a URL to run a full diagnostic suite " +
			"(fetch, HAR capture, Lighthouse audit, render, and screenshot).",
		inputSchema: diagnoseInputSchema,
		outputSchema: diagnoseOutputSchema,
		_meta: {
			ui: { resourceUri: DIAGNOSE_RESOURCE_URI },
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async () => {
			return {
				message: "Diagnostics UI ready. Enter a URL to begin.",
			};
		},
	});
