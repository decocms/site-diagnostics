// Wrangler rules (wrangler.toml) resolve this import as a Text module.
import CLIENT_HTML from "../dist/client/index.html";
import { createD1AuthDB } from "../src/auth/db.ts";
import { createApp } from "./app.ts";

interface WorkerEnv {
	D1?: unknown;
	BETTER_AUTH_URL?: string;
	BETTER_AUTH_SECRET?: string;
}

type AppFetch = ReturnType<typeof createApp>["fetch"];
let cached: AppFetch | null = null;

function resolveApp(env: WorkerEnv): AppFetch {
	if (cached) return cached;
	const db = env.D1
		? createD1AuthDB(env.D1 as Parameters<typeof createD1AuthDB>[0])
		: undefined;
	const app = createApp({
		clientHTML: CLIENT_HTML as unknown as string,
		db,
		authBaseURL: env.BETTER_AUTH_URL,
		authSecret: env.BETTER_AUTH_SECRET,
	});
	cached = app.fetch;
	return cached;
}

export default {
	fetch(request: Request, env: WorkerEnv) {
		return resolveApp(env)(request);
	},
};
