import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { listDiagnostics } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

export const listDiagnosticsInputSchema = z.object({});

export const listDiagnosticsOutputSchema = z.object({
	diagnostics: z.array(
		z.object({
			id: z.string(),
			url: z.string(),
			title: z.string(),
			createdAt: z.string(),
			healthScore: z.number().optional(),
			summary: z.string().optional(),
			reportPreview: z.string().optional(),
			status: z.string(),
		}),
	),
});

export const listDiagnosticsTool = (_env: Env) =>
	createTool({
		id: "list_diagnostics",
		description: "List all saved diagnostic reports.",
		inputSchema: listDiagnosticsInputSchema,
		outputSchema: listDiagnosticsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async () => {
			const diagnostics = listDiagnostics();
			return { diagnostics };
		},
	});
