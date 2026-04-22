import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { loadOrgCredentials, saveOrgCredentials } from "./credentials.ts";
import { type AuthDB, createBunSqliteAuthDB, migrate } from "./db.ts";
import { generateKey } from "./encryption.ts";

// Minimal BetterAuthOptions stub — we only exercise the ORG_SCHEMA_SQL /
// legacy-upgrade portion of migrate(), not BetterAuth's own migrations.
// Passing an empty `plugins` list + the bun:sqlite db makes
// better-auth/db/migration runMigrations a no-op against an empty authSchema.
function stubAuthOptions(db: AuthDB) {
	return {
		database: db.betterAuthDB,
		plugins: [],
		appName: "test",
		secret: "test-secret-at-least-32-chars-xxxxxxxx",
	};
}

describe("migrate() — legacy org_credentials upgrade", () => {
	it("drops and recreates when the plaintext shape is present", async () => {
		const sqlite = new Database(":memory:");
		const db = createBunSqliteAuthDB(sqlite);

		// Simulate a dev DB written by an earlier build of the app.
		await db.run(
			`CREATE TABLE org_credentials (
				org_id TEXT PRIMARY KEY,
				creds  TEXT NOT NULL
			)`,
		);
		await db.run("INSERT INTO org_credentials (org_id, creds) VALUES (?, ?)", [
			"legacy-org",
			'{"cdn":{"token":"plaintext"}}',
		]);

		await migrate(db, stubAuthOptions(db));

		// New encrypted shape is in place.
		const key = generateKey();
		await saveOrgCredentials(db, "legacy-org", { cdn: { token: "x" } }, key);
		const loaded = await loadOrgCredentials(db, "legacy-org", key);
		expect(loaded).toEqual({ cdn: { token: "x" } });

		// Column snapshot — no `creds TEXT` left behind.
		const cols = await db.all<{ name: string }>(
			"SELECT name FROM pragma_table_info('org_credentials')",
		);
		const names = cols.map((c) => c.name).sort();
		expect(names).toEqual([
			"creds_cipher",
			"creds_iv",
			"key_version",
			"org_id",
		]);
	});

	it("is a no-op on an already-upgraded DB", async () => {
		const sqlite = new Database(":memory:");
		const db = createBunSqliteAuthDB(sqlite);

		// First run sets up encrypted schema from scratch.
		await migrate(db, stubAuthOptions(db));
		const key = generateKey();
		await saveOrgCredentials(db, "org-a", { cdn: { token: "keep" } }, key);

		// Second run should preserve existing rows.
		await migrate(db, stubAuthOptions(db));
		const loaded = await loadOrgCredentials(db, "org-a", key);
		expect(loaded).toEqual({ cdn: { token: "keep" } });
	});
});
