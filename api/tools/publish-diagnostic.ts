import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadDiagnostic, savePublicShare } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

export const publishDiagnosticInputSchema = z.object({
	id: z.string().describe("The diagnostic report ID to publish"),
	ttlDays: z
		.number()
		.int()
		.positive()
		.max(365)
		.nullable()
		.optional()
		.describe(
			"Days until the public link expires. Pass null for no expiry. Defaults to 30.",
		),
});

export const publishDiagnosticOutputSchema = z.object({
	token: z.string(),
	expiresAt: z.string().nullable(),
	createdAt: z.string(),
});

function generateToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export const publishDiagnosticTool = (_env: Env) =>
	createTool({
		id: "publish_diagnostic",
		description:
			"Create a public share link for a saved diagnostic. Returns an opaque token; " +
			"the link URL is `{origin}/d/{token}`. Anyone with the link can view the report " +
			"until it expires or is revoked with `unpublish_diagnostic`.",
		inputSchema: publishDiagnosticInputSchema,
		outputSchema: publishDiagnosticOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		execute: async ({ context, runtimeContext }) => {
			const orgId =
				runtimeContext?.env?.MESH_REQUEST_CONTEXT?.organizationId ?? "default";

			// Make sure the diagnostic exists in the caller's org before minting
			// a token — otherwise we'd leak the ability to publish arbitrary IDs.
			const diagnostic = await loadDiagnostic(context.id, orgId);
			if (!diagnostic) {
				throw new Error(`Diagnostic not found: ${context.id}`);
			}

			const ttlDays = context.ttlDays === undefined ? 30 : context.ttlDays;
			const createdAt = new Date().toISOString();
			const expiresAt =
				ttlDays == null
					? null
					: new Date(Date.now() + ttlDays * 86_400_000).toISOString();

			const token = generateToken();
			await savePublicShare({
				token,
				orgId,
				diagnosticId: context.id,
				createdAt,
				expiresAt: expiresAt ?? undefined,
			});

			return { token, expiresAt, createdAt };
		},
	});
