import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildAuthOptions } from "../src/auth/auth.ts";
import { createBunSqliteAuthDB, migrate } from "../src/auth/db.ts";
import { resolveSendOTPFromEnv } from "../src/auth/send-otp.ts";
import { FileKVStore } from "../src/cache/fs.ts";
import { createApp } from "./app.ts";

const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? "data/auth.sqlite";
await mkdir(dirname(AUTH_DB_PATH), { recursive: true });

const sqlite = new Database(AUTH_DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;");
const authDb = createBunSqliteAuthDB(sqlite);

const baseURL = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;
await migrate(authDb, buildAuthOptions({ db: authDb, baseURL, secret }));

const app = createApp({
	db: authDb,
	authBaseURL: baseURL,
	authSecret: secret,
	sendOTP: resolveSendOTPFromEnv({
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
	}),
	cache: new FileKVStore(process.env.KV_DIR ?? ".kv"),
	adminSecret: process.env.ADMIN_SECRET,
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

Bun.serve({
	idleTimeout: 0,
	hostname: "0.0.0.0",
	port: PORT,
	fetch: app.fetch,
});

const slug = process.env.WORKTREE_SLUG;
const baseUrl = slug ? `http://${slug}.localhost` : `http://localhost:${PORT}`;

console.log("");
console.log(`\x1b[35mMCP App\x1b[0m: ${baseUrl}/api/mcp`);
console.log(
	`\x1b[36mAuth\x1b[0m:    ${baseUrl}/api/auth (sqlite: ${AUTH_DB_PATH})`,
);
console.log("");
