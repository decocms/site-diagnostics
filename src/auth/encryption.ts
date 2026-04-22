/**
 * AES-256-GCM encryption for `org_credentials` rows.
 *
 * Credentials contain GitHub PATs, Google service-account JSON, HyperDx API
 * keys and CDN data-lake tokens. Storing them as plaintext in D1 would turn a
 * single DB breach into a total compromise of every connected org's
 * infrastructure.
 *
 * - Key: `CREDS_ENCRYPTION_KEY`, 32 random bytes, base64-encoded. Held as a
 *   wrangler secret in prod, in `.env` locally. Losing it means all stored
 *   creds are unrecoverable — back it up out-of-band.
 * - IV: 12 random bytes per write, stored alongside the ciphertext. Never
 *   reused within a key version.
 * - Algorithm: AES-GCM via Web Crypto (`crypto.subtle`). Works in Bun and
 *   Cloudflare Workers; no Node polyfills needed.
 * - Rotation: `key_version` on each row lets a background job re-encrypt with
 *   a new key while old rows stay readable under their recorded version.
 */

export const CURRENT_KEY_VERSION = 1;

const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedCreds {
	cipher: Uint8Array;
	iv: Uint8Array;
	keyVersion: number;
}

/**
 * Encrypts a credentials object. Returns ciphertext + fresh IV + key version,
 * all of which must be persisted together — decryption needs all three.
 */
export async function encryptCreds<T>(
	plaintext: T,
	keyB64: string,
): Promise<EncryptedCreds> {
	const key = await importKey(keyB64);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const data = new TextEncoder().encode(JSON.stringify(plaintext));
	const cipher = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: iv as BufferSource },
			key,
			data as BufferSource,
		),
	);
	return { cipher, iv, keyVersion: CURRENT_KEY_VERSION };
}

/**
 * Decrypts the tuple produced by `encryptCreds`. Throws if the ciphertext or
 * IV has been tampered with (AES-GCM is authenticated) or if the wrong key
 * is supplied.
 */
export async function decryptCreds<T>(
	encrypted: EncryptedCreds,
	keyB64: string,
): Promise<T> {
	const key = await importKey(keyB64);
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: encrypted.iv as BufferSource },
		key,
		encrypted.cipher as BufferSource,
	);
	return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/**
 * Generates a fresh base64-encoded key. Useful for dev setup / rotation.
 * Call once, save the result to `CREDS_ENCRYPTION_KEY` in .env or wrangler
 * secrets, and back it up in 1Password. Regenerating orphans existing rows.
 */
export function generateKey(): string {
	const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
	return base64Encode(raw);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
	const raw = base64Decode(keyB64);
	if (raw.length !== KEY_BYTES) {
		throw new Error(
			`CREDS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${raw.length}`,
		);
	}
	return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

function base64Encode(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

function base64Decode(s: string): Uint8Array {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
