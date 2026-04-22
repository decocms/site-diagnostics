/**
 * Raw DDL for site-diagnostics tables (BetterAuth tables are managed separately
 * via its own migration helpers).
 *
 * Statements are SQLite-compatible so they work on both bun:sqlite (local dev)
 * and Cloudflare D1 (prod).
 *
 * `org_credentials` stores AES-256-GCM ciphertext rather than plaintext JSON.
 * See src/auth/encryption.ts — a single CREDS_ENCRYPTION_KEY secret decrypts
 * all rows; per-row IVs live in `creds_iv`; `key_version` supports rotation.
 */
export const ORG_SCHEMA_SQL: string[] = [
	`CREATE TABLE IF NOT EXISTS org_credentials (
		org_id       TEXT PRIMARY KEY,
		creds_cipher BLOB NOT NULL,
		creds_iv     BLOB NOT NULL,
		key_version  INTEGER NOT NULL DEFAULT 1
	)`,
	`CREATE TABLE IF NOT EXISTS email_domain_mapping (
		domain TEXT PRIMARY KEY,
		org_id TEXT NOT NULL REFERENCES org_credentials(org_id)
	)`,
	`CREATE TABLE IF NOT EXISTS individual_email_mapping (
		email  TEXT PRIMARY KEY,
		org_id TEXT NOT NULL REFERENCES org_credentials(org_id)
	)`,
];
