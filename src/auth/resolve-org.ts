import type { AuthDB } from "./db.ts";

/**
 * Maps an authenticated email to an org_id.
 *
 * Resolution priority:
 *   1. Exact match in `individual_email_mapping`
 *   2. Domain match in `email_domain_mapping`
 *   3. null — authenticated user with no org, public pipeline only
 *
 * Credential loading lives in `credentials.ts` (the only module that
 * decrypts). Callers that need creds call `loadOrgCredentials(db, orgId,
 * key)` after resolving the org.
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
