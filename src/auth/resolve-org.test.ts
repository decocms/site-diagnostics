import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { createBunSqliteAuthDB } from "./db.ts";
import { resolveOrg } from "./resolve-org.ts";
import { ORG_SCHEMA_SQL } from "./schema.ts";

async function freshDB() {
	const db = createBunSqliteAuthDB(new Database(":memory:"));
	for (const stmt of ORG_SCHEMA_SQL) {
		await db.run(stmt);
	}
	return db;
}

// Mapping tables reference org_credentials(org_id). Inserting cipher+iv stubs
// since the encrypted schema requires NOT NULL BLOBs.
async function seedOrg(db: Awaited<ReturnType<typeof freshDB>>, orgId: string) {
	await db.run(
		`INSERT INTO org_credentials (org_id, creds_cipher, creds_iv, key_version)
		 VALUES (?, ?, ?, ?)`,
		[orgId, new Uint8Array([0]), new Uint8Array([0]), 1],
	);
}

describe("resolveOrg", () => {
	it("returns null for email with no matching mapping", async () => {
		const db = await freshDB();
		expect(await resolveOrg(db, "nobody@example.com")).toBeNull();
	});

	it("matches individual email before domain", async () => {
		const db = await freshDB();
		await seedOrg(db, "org-indiv");
		await seedOrg(db, "org-domain");
		await db.run(
			"INSERT INTO email_domain_mapping (domain, org_id) VALUES (?, ?)",
			["example.com", "org-domain"],
		);
		await db.run(
			"INSERT INTO individual_email_mapping (email, org_id) VALUES (?, ?)",
			["special@example.com", "org-indiv"],
		);

		expect(await resolveOrg(db, "special@example.com")).toBe("org-indiv");
		expect(await resolveOrg(db, "other@example.com")).toBe("org-domain");
	});

	it("normalizes email casing and whitespace", async () => {
		const db = await freshDB();
		await seedOrg(db, "org-a");
		await db.run(
			"INSERT INTO email_domain_mapping (domain, org_id) VALUES (?, ?)",
			["acme.com", "org-a"],
		);

		expect(await resolveOrg(db, "  User@ACME.com ")).toBe("org-a");
	});

	it("returns null for malformed email input", async () => {
		const db = await freshDB();
		expect(await resolveOrg(db, "not-an-email")).toBeNull();
		expect(await resolveOrg(db, "")).toBeNull();
	});
});
