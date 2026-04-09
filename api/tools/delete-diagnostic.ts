import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { deleteDiagnostic } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

export const deleteDiagnosticInputSchema = z.object({
	id: z.string().describe("The diagnostic report ID to delete"),
});

export const deleteDiagnosticOutputSchema = z.object({
	success: z.boolean(),
});

export const deleteDiagnosticTool = (_env: Env) =>
	createTool({
		id: "delete_diagnostic",
		description: "Delete a saved diagnostic report.",
		inputSchema: deleteDiagnosticInputSchema,
		outputSchema: deleteDiagnosticOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context }) => {
			deleteDiagnostic(context.id);
			return { success: true };
		},
	});
