import type { OrgCredentials } from "../workflows/diagnose/types.ts";
import type { AuthDB } from "./db.ts";

/**
 * Maps an authenticated email to an org_id.
 *
 * Resolution priority:
 *   1. Exact match in `individual_email_mapping`
 *   2. Domain match in `email_domain_mapping`
 *   3. null — authenticated user with no org, public pipeline only
 */
export async function resolveOrg(
	db: AuthDB,
	email: string,
): Promise<string | null> {
	const normalized = email.trim().toLowerCase();
	if (!normalized.includes("@")) return null;

	const individual = await db.get<{ org_id: string }>(
		"SELECT org_id FROM individual_email_mapping WHERE email = ?",
		[normalized],
	);
	if (individual) return individual.org_id;

	const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
	if (!domain) return null;

	const byDomain = await db.get<{ org_id: string }>(
		"SELECT org_id FROM email_domain_mapping WHERE domain = ?",
		[domain],
	);
	return byDomain?.org_id ?? null;
}

/**
 * Loads the credential bundle for an org. Returns an empty object if no row
 * exists — callers should treat that as "no proprietary sources available".
 */
export async function loadOrgCredentials(
	db: AuthDB,
	orgId: string,
): Promise<OrgCredentials> {
	const row = await db.get<{ creds: string }>(
		"SELECT creds FROM org_credentials WHERE org_id = ?",
		[orgId],
	);
	if (!row) return {};

	try {
		return JSON.parse(row.creds) as OrgCredentials;
	} catch {
		console.warn(`[auth] malformed creds JSON for org_id=${orgId}`);
		return {};
	}
}
