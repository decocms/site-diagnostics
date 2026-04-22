import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { deletePublicShare, loadPublicShare } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

export const unpublishDiagnosticInputSchema = z.object({
	token: z.string().describe("The public share token to revoke"),
});

export const unpublishDiagnosticOutputSchema = z.object({
	success: z.boolean(),
});

export const unpublishDiagnosticTool = (_env: Env) =>
	createTool({
		id: "unpublish_diagnostic",
		description:
			"Revoke a public share token. After this, the `/d/{token}` URL returns 404.",
		inputSchema: unpublishDiagnosticInputSchema,
		outputSchema: unpublishDiagnosticOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context, runtimeContext }) => {
			const orgId =
				runtimeContext?.env?.MESH_REQUEST_CONTEXT?.organizationId ?? "default";

			// Only let a caller revoke tokens that belong to their org — otherwise
			// anyone with a guessed token could kill someone else's share.
			const share = await loadPublicShare(context.token);
			if (share && share.orgId !== orgId) {
				throw new Error("Not authorized to revoke this share");
			}

			await deletePublicShare(context.token);
			return { success: true };
		},
	});
