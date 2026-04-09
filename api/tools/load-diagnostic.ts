import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadDiagnostic } from "../lib/storage.ts";
import { DiagnosticSchema } from "../types/diagnostic.ts";
import type { Env } from "../types/env.ts";

export const loadDiagnosticInputSchema = z.object({
	id: z.string().describe("The diagnostic report ID to load"),
});

export const loadDiagnosticOutputSchema = DiagnosticSchema;

export const loadDiagnosticTool = (_env: Env) =>
	createTool({
		id: "load_diagnostic",
		description: "Load a saved diagnostic report by ID.",
		inputSchema: loadDiagnosticInputSchema,
		outputSchema: loadDiagnosticOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context }) => {
			const diagnostic = loadDiagnostic(context.id);
			if (!diagnostic) {
				throw new Error(`Diagnostic not found: ${context.id}`);
			}
			return diagnostic;
		},
	});
