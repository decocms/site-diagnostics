import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { saveDiagnostic } from "../lib/storage.ts";
import { DiagnosticSchema } from "../types/diagnostic.ts";
import type { Env } from "../types/env.ts";

export const saveDiagnosticInputSchema = DiagnosticSchema;

export const saveDiagnosticOutputSchema = z.object({
	success: z.boolean(),
	id: z.string(),
});

export const saveDiagnosticTool = (_env: Env) =>
	createTool({
		id: "save_diagnostic",
		description:
			"Save a completed site diagnostic report to persistent storage. " +
			"Call this after generating the full diagnostic report to persist it for later viewing.",
		inputSchema: saveDiagnosticInputSchema,
		outputSchema: saveDiagnosticOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context, runtimeContext }) => {
			const orgId =
				runtimeContext.env.MESH_REQUEST_CONTEXT.organizationId ?? "default";
			const id = await saveDiagnostic(context, orgId);
			return { success: true, id };
		},
	});
