import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withRuntime } from "@decocms/runtime";
import { type Auth, createAuth } from "../src/auth/auth.ts";
import type { AuthDB } from "../src/auth/db.ts";
import { loadOrgCredentials, resolveOrg } from "../src/auth/resolve-org.ts";
import { getScreenshot } from "./lib/storage.ts";
import { prompts } from "./prompts/index.ts";
import { createDiagnoseAppResource } from "./resources/diagnose.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

export interface AppConfig {
	/** Static HTML string (used by Workers). Omit for local dev to read from disk on each request. */
	clientHTML?: string;
	/** Auth DB (bun:sqlite local / D1 prod). When present, mounts /api/auth/* and enriches MCP requests with user context. */
	db?: AuthDB;
	/** Override the auth baseURL. Defaults to the request origin when unset. */
	authBaseURL?: string;
	/** Override the auth secret. Falls back to BETTER_AUTH_SECRET env var. */
	authSecret?: string;
}

const colors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	GET: "\x1b[36m",
	POST: "\x1b[33m",
	PUT: "\x1b[35m",
	DELETE: "\x1b[31m",
	ok: "\x1b[32m",
	redirect: "\x1b[36m",
	clientError: "\x1b[33m",
	serverError: "\x1b[31m",
	mcp: "\x1b[35m",
	duration: "\x1b[90m",
	requestId: "\x1b[94m",
};

function getStatusColor(status: number): string {
	if (status >= 500) return colors.serverError;
	if (status >= 400) return colors.clientError;
	if (status >= 300) return colors.redirect;
	return colors.ok;
}

function getMethodColor(method: string): string {
	return colors[method as keyof typeof colors] || colors.reset;
}

export function createApp(config: AppConfig = {}) {
	const { clientHTML, db, authBaseURL, authSecret } = config;

	const getClientHTML = clientHTML
		? () => Promise.resolve(clientHTML)
		: () =>
				readFile(
					join(import.meta.dir, "..", "dist", "client", "index.html"),
					"utf-8",
				);

	const runtime = withRuntime<Env, typeof StateSchema>({
		configuration: {
			state: StateSchema,
		},
		tools,
		prompts,
		resources: [createDiagnoseAppResource(getClientHTML)],
	});

	const auth: Auth | null = db
		? createAuth({
				db,
				baseURL: authBaseURL,
				secret: authSecret ?? process.env.BETTER_AUTH_SECRET,
			})
		: null;

	function withLogging(fetcher: Fetcher): Fetcher {
		return async (req: Request, ...args) => {
			const start = performance.now();
			const method = req.method;
			const path = new URL(req.url).pathname;
			const requestId =
				req.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);

			const methodColor = getMethodColor(method);
			const reqIdStr = `${colors.requestId}${requestId.slice(0, 8)}${colors.reset}`;
			console.log(
				`${colors.dim}<-${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr}`,
			);

			try {
				const response = await fetcher(req, ...args);
				const duration = (performance.now() - start).toFixed(1);
				const statusColor = getStatusColor(response.status);
				console.log(
					`${colors.dim}->${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr} ${statusColor}${response.status}${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
				);
				return response;
			} catch (error) {
				const duration = (performance.now() - start).toFixed(1);
				console.log(
					`${colors.dim}->${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr} ${colors.serverError}ERR${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
				);
				throw error;
			}
		};
	}

	function withAuth(fetcher: Fetcher): Fetcher {
		return async (req: Request, ...args) => {
			if (!auth || !db) return fetcher(req, ...args);

			const url = new URL(req.url);

			// Mount BetterAuth handler at /api/auth/*
			if (url.pathname.startsWith("/api/auth/")) {
				return auth.handler(req);
			}

			// Enrich /api/mcp requests with user context headers. Anonymous
			// access is allowed via ?anon or when no session cookie is present —
			// those requests get x-is-anonymous=true and no org context.
			if (url.pathname.startsWith("/api/mcp")) {
				const session = await auth.api
					.getSession({ headers: req.headers })
					.catch(() => null);
				const user = session?.user as
					| { email?: string; isAnonymous?: boolean }
					| undefined;
				const isAnon =
					url.searchParams.has("anon") ||
					!session ||
					Boolean(user?.isAnonymous);

				let orgId = "";
				if (!isAnon && user?.email) {
					orgId = (await resolveOrg(db, user.email)) ?? "";
					if (orgId) {
						// Warm the creds so downstream tool handlers can pull them
						// without re-hitting the DB. Errors shouldn't block auth.
						await loadOrgCredentials(db, orgId).catch(() => ({}));
					}
				}

				const headers = new Headers(req.headers);
				headers.set("x-user-email", isAnon ? "" : (user?.email ?? ""));
				headers.set("x-org-id", orgId);
				headers.set("x-is-anonymous", String(isAnon));
				const enriched = new Request(req, { headers });
				return fetcher(enriched, ...args);
			}

			return fetcher(req, ...args);
		};
	}

	function withMcpApiRoute(fetcher: Fetcher): Fetcher {
		return async (req: Request, ...args) => {
			const url = new URL(req.url);

			if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
				return new Response("Not Found", { status: 404 });
			}

			// Proxy screenshots from R2
			if (
				url.pathname.startsWith("/api/screenshots/") &&
				req.method === "GET"
			) {
				const filename = url.pathname.slice("/api/screenshots/".length);
				if (!/^[a-zA-Z0-9._-]+\.png$/.test(filename)) {
					return new Response("Not Found", { status: 404 });
				}
				try {
					const stream = await getScreenshot(filename);
					if (!stream) return new Response("Not Found", { status: 404 });
					return new Response(stream, {
						headers: {
							"content-type": "image/png",
							"cache-control": "public, max-age=31536000, immutable",
						},
					});
				} catch {
					return new Response("Not Found", { status: 404 });
				}
			}

			if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
				url.pathname = url.pathname.slice(4);
				const rewrittenReq = new Request(url.toString(), req);
				return fetcher(rewrittenReq, ...args);
			}

			return fetcher(req, ...args);
		};
	}

	return {
		fetch: withLogging(withAuth(withMcpApiRoute(runtime.fetch))),
		auth,
	};
}
