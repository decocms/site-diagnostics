import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { createBunSqliteAuthDB } from "./db.ts";
import { loadOrgCredentials, resolveOrg } from "./resolve-org.ts";
import { ORG_SCHEMA_SQL } from "./schema.ts";

async function freshDB() {
	const db = createBunSqliteAuthDB(new Database(":memory:"));
	for (const stmt of ORG_SCHEMA_SQL) {
		await db.run(stmt);
	}
	return db;
}

describe("resolveOrg", () => {
	it("returns null for email with no matching mapping", async () => {
		const db = await freshDB();
		expect(await resolveOrg(db, "nobody@example.com")).toBeNull();
	});

	it("matches individual email before domain", async () => {
		const db = await freshDB();
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"org-indiv",
			"{}",
		]);
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"org-domain",
			"{}",
		]);
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
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"org-a",
			"{}",
		]);
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

describe("loadOrgCredentials", () => {
	it("returns empty object when org has no row", async () => {
		const db = await freshDB();
		expect(await loadOrgCredentials(db, "missing")).toEqual({});
	});

	it("parses stored JSON creds", async () => {
		const db = await freshDB();
		const creds = {
			cdn: { endpoint: "https://cdn.example/api", token: "secret" },
			repo: { owner: "acme", repo: "site", token: "ghp_x" },
		};
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"org-a",
			JSON.stringify(creds),
		]);

		expect(await loadOrgCredentials(db, "org-a")).toEqual(creds);
	});

	it("returns empty object on malformed JSON", async () => {
		const db = await freshDB();
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"org-a",
			"{not valid json",
		]);
		expect(await loadOrgCredentials(db, "org-a")).toEqual({});
	});
});
