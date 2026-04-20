import type { BetterAuthOptions } from "better-auth";
import { ORG_SCHEMA_SQL } from "./schema.ts";

/**
 * Minimal async DB interface used by org-resolution queries. Two backing
 * implementations: bun:sqlite for local dev, D1 for Cloudflare Workers.
 *
 * `betterAuthDB` is the value passed to BetterAuth's `database` option —
 * its kysely-adapter auto-detects bun:sqlite `Database` instances and D1
 * bindings via duck-typing, so we can pass the raw driver through.
 */
export interface AuthDB {
	run(sql: string, params?: unknown[]): Promise<void>;
	get<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
	all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
	betterAuthDB: BetterAuthOptions["database"];
}

// ── bun:sqlite adapter (local dev) ───────────────────────────

type BunSqliteDatabase = {
	exec(sql: string): void;
	prepare(sql: string): {
		run(...params: unknown[]): unknown;
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
	};
};

export function createBunSqliteAuthDB(db: BunSqliteDatabase): AuthDB {
	return {
		async run(sql, params = []) {
			db.prepare(sql).run(...params);
		},
		async get<T>(sql: string, params: unknown[] = []) {
			return (db.prepare(sql).get(...params) as T | null) ?? null;
		},
		async all<T>(sql: string, params: unknown[] = []) {
			return db.prepare(sql).all(...params) as T[];
		},
		betterAuthDB: db as BetterAuthOptions["database"],
	};
}

// ── D1 adapter (Cloudflare Workers) ──────────────────────────

interface D1Database {
	prepare(sql: string): D1PreparedStatement;
}
interface D1PreparedStatement {
	bind(...params: unknown[]): D1PreparedStatement;
	first<T = unknown>(): Promise<T | null>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	run(): Promise<unknown>;
}

export function createD1AuthDB(d1: D1Database): AuthDB {
	return {
		async run(sql, params = []) {
			await d1
				.prepare(sql)
				.bind(...params)
				.run();
		},
		async get<T>(sql: string, params: unknown[] = []) {
			return d1
				.prepare(sql)
				.bind(...params)
				.first<T>();
		},
		async all<T>(sql: string, params: unknown[] = []) {
			const { results } = await d1
				.prepare(sql)
				.bind(...params)
				.all<T>();
			return results;
		},
		betterAuthDB: d1 as BetterAuthOptions["database"],
	};
}

// ── Migrations ───────────────────────────────────────────────

/**
 * Applies BetterAuth's own schema (user/session/account/verification) and
 * our app tables (org_credentials + email mappings). Safe to call on every
 * startup — getMigrations only applies pending changes.
 */
export async function migrate(
	db: AuthDB,
	authOptions: BetterAuthOptions,
): Promise<void> {
	const { getMigrations } = await import("better-auth/db/migration");
	const { runMigrations } = await getMigrations(authOptions);
	await runMigrations();

	for (const stmt of ORG_SCHEMA_SQL) {
		await db.run(stmt);
	}
}
