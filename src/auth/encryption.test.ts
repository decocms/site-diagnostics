import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { loadOrgCredentials, saveOrgCredentials } from "./credentials.ts";
import { createBunSqliteAuthDB } from "./db.ts";
import { decryptCreds, encryptCreds, generateKey } from "./encryption.ts";
import { ORG_SCHEMA_SQL } from "./schema.ts";

const SAMPLE_CREDS = {
	cdn: { endpoint: "https://cdn.example/api", token: "cdn-secret" },
	repo: { owner: "acme", repo: "site", token: "ghp_super_secret" },
};

async function freshDB() {
	const db = createBunSqliteAuthDB(new Database(":memory:"));
	for (const stmt of ORG_SCHEMA_SQL) {
		await db.run(stmt);
	}
	return db;
}

describe("encryptCreds / decryptCreds", () => {
	it("roundtrips arbitrary credential shapes", async () => {
		const key = generateKey();
		const encrypted = await encryptCreds(SAMPLE_CREDS, key);

		expect(encrypted.iv).toHaveLength(12);
		expect(encrypted.cipher.length).toBeGreaterThan(0);
		expect(encrypted.keyVersion).toBe(1);

		const plain = await decryptCreds<typeof SAMPLE_CREDS>(encrypted, key);
		expect(plain).toEqual(SAMPLE_CREDS);
	});

	it("produces distinct ciphertexts for identical plaintexts (fresh IV)", async () => {
		const key = generateKey();
		const a = await encryptCreds(SAMPLE_CREDS, key);
		const b = await encryptCreds(SAMPLE_CREDS, key);
		expect(a.cipher).not.toEqual(b.cipher);
		expect(a.iv).not.toEqual(b.iv);
	});

	it("rejects decryption with the wrong key", async () => {
		const k1 = generateKey();
		const k2 = generateKey();
		const encrypted = await encryptCreds(SAMPLE_CREDS, k1);

		await expect(decryptCreds(encrypted, k2)).rejects.toThrow();
	});

	it("rejects tampered ciphertext (authentication failure)", async () => {
		const key = generateKey();
		const encrypted = await encryptCreds(SAMPLE_CREDS, key);
		const tampered = {
			...encrypted,
			cipher: encrypted.cipher.slice(), // copy
		};
		// flip a bit
		tampered.cipher[0] ^= 0x01;

		await expect(decryptCreds(tampered, key)).rejects.toThrow();
	});

	it("rejects tampered IV", async () => {
		const key = generateKey();
		const encrypted = await encryptCreds(SAMPLE_CREDS, key);
		const tampered = { ...encrypted, iv: encrypted.iv.slice() };
		tampered.iv[0] ^= 0x01;

		await expect(decryptCreds(tampered, key)).rejects.toThrow();
	});

	it("rejects a key with the wrong byte length", async () => {
		// 16 bytes instead of 32
		const shortKey = btoa(String.fromCharCode(...new Uint8Array(16).fill(42)));
		await expect(encryptCreds(SAMPLE_CREDS, shortKey)).rejects.toThrow(
			/32 bytes/,
		);
	});
});

describe("loadOrgCredentials / saveOrgCredentials (integration with DB)", () => {
	it("saves encrypted, loads decrypted", async () => {
		const db = await freshDB();
		const key = generateKey();

		await saveOrgCredentials(db, "org-a", SAMPLE_CREDS, key);
		const loaded = await loadOrgCredentials(db, "org-a", key);

		expect(loaded).toEqual(SAMPLE_CREDS);
	});

	it("returns empty object when org has no row", async () => {
		const db = await freshDB();
		const key = generateKey();
		expect(await loadOrgCredentials(db, "missing", key)).toEqual({});
	});

	it("row is actually encrypted at rest (no plaintext token visible)", async () => {
		const db = await freshDB();
		const key = generateKey();
		await saveOrgCredentials(db, "org-a", SAMPLE_CREDS, key);

		const row = await db.get<{ creds_cipher: Uint8Array }>(
			"SELECT creds_cipher FROM org_credentials WHERE org_id = ?",
			["org-a"],
		);
		expect(row).not.toBeNull();
		const asText = new TextDecoder("utf-8", { fatal: false }).decode(
			row!.creds_cipher,
		);
		// None of the secret material should appear in the raw blob.
		expect(asText).not.toContain("ghp_super_secret");
		expect(asText).not.toContain("cdn-secret");
		expect(asText).not.toContain("acme");
	});

	it("upserts on conflict (new writes replace old ciphertext)", async () => {
		const db = await freshDB();
		const key = generateKey();

		await saveOrgCredentials(db, "org-a", SAMPLE_CREDS, key);
		const next = { cdn: { endpoint: "new", token: "new-token" } };
		await saveOrgCredentials(db, "org-a", next, key);

		const loaded = await loadOrgCredentials(db, "org-a", key);
		expect(loaded).toEqual(next);
	});

	it("fails loudly when the key is wrong", async () => {
		const db = await freshDB();
		const k1 = generateKey();
		const k2 = generateKey();

		await saveOrgCredentials(db, "org-a", SAMPLE_CREDS, k1);
		await expect(loadOrgCredentials(db, "org-a", k2)).rejects.toThrow();
	});
});
