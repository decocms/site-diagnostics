/**
 * The ONLY module that reads/writes `org_credentials.creds_cipher`.
 *
 * Every other part of the codebase receives a typed `OrgCredentials` object
 * already decrypted in memory — no raw ciphertext flows outside this file.
 * Keeping the blast radius that small means an accidental `console.log(creds)`
 * can at worst leak the current request's creds, never the database.
 */

import type { OrgCredentials } from "../workflows/diagnose/types.ts";
import type { AuthDB } from "./db.ts";
import {
	CURRENT_KEY_VERSION,
	decryptCreds,
	encryptCreds,
} from "./encryption.ts";

interface Row {
	creds_cipher: Uint8Array | ArrayBuffer;
	creds_iv: Uint8Array | ArrayBuffer;
	key_version: number;
}

/**
 * Loads and decrypts the credential bundle for an org. Returns an empty
 * object when no row exists; callers should treat that as "no proprietary
 * sources available". Throws on cipher/IV tampering or key mismatch — that
 * is not a silent failure.
 */
export async function loadOrgCredentials(
	db: AuthDB,
	orgId: string,
	keyB64: string,
): Promise<OrgCredentials> {
	const row = await db.get<Row>(
		"SELECT creds_cipher, creds_iv, key_version FROM org_credentials WHERE org_id = ?",
		[orgId],
	);
	if (!row) return {};

	return decryptCreds<OrgCredentials>(
		{
			cipher: toU8(row.creds_cipher),
			iv: toU8(row.creds_iv),
			keyVersion: row.key_version,
		},
		keyB64,
	);
}

/**
 * Encrypts and upserts a credential bundle for an org. Re-encrypts on every
 * write (fresh IV), so two writes of the same plaintext produce distinct
 * ciphertexts — standard AES-GCM hygiene.
 */
export async function saveOrgCredentials(
	db: AuthDB,
	orgId: string,
	creds: OrgCredentials,
	keyB64: string,
): Promise<void> {
	const { cipher, iv, keyVersion } = await encryptCreds(creds, keyB64);
	await db.run(
		`INSERT INTO org_credentials (org_id, creds_cipher, creds_iv, key_version)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(org_id) DO UPDATE SET
		   creds_cipher = excluded.creds_cipher,
		   creds_iv     = excluded.creds_iv,
		   key_version  = excluded.key_version`,
		[orgId, cipher, iv, keyVersion],
	);
}

export { CURRENT_KEY_VERSION };

function toU8(v: Uint8Array | ArrayBuffer): Uint8Array {
	return v instanceof Uint8Array ? v : new Uint8Array(v);
}
