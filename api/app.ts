import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withRuntime } from "@decocms/runtime";
import { type Auth, createAuth } from "../src/auth/auth.ts";
import { type AuthContext, authContext } from "../src/auth/context.ts";
import type { AuthDB } from "../src/auth/db.ts";
import { loadOrgCredentials, resolveOrg } from "../src/auth/resolve-org.ts";
import { getScreenshot } from "./lib/storage.ts";
import { prompts } from "./prompts/index.ts";
import { createDiagnoseAppResource } from "./resources/diagnose.ts";
import { proprietaryTools, publicTools } from "./tools/index.ts";
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
	/** MCP OAuth login page URL. Defaults to /login. */
	loginPage?: string;
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
	const { clientHTML, db, authBaseURL, authSecret, loginPage } = config;

	const getClientHTML = clientHTML
		? () => Promise.resolve(clientHTML)
		: () =>
				readFile(
					join(import.meta.dir, "..", "dist", "client", "index.html"),
					"utf-8",
				);

	// Two runtimes with different tool surfaces. The default /api/mcp
	// endpoint routes to `publicRuntime` (anyone can use it, no auth).
	// /api/mcp?proprietary routes to `fullRuntime` (requires auth) so
	// proprietary tools are invisible to unauthenticated MCP clients —
	// the model never sees a tool it can't call.
	const publicRuntime = withRuntime<Env, typeof StateSchema>({
		configuration: { state: StateSchema },
		tools: publicTools,
		prompts,
		resources: [createDiagnoseAppResource(getClientHTML)],
	});

	const fullRuntime =
		proprietaryTools.length > 0
			? withRuntime<Env, typeof StateSchema>({
					configuration: { state: StateSchema },
					tools: [...publicTools, ...proprietaryTools],
					prompts,
					resources: [createDiagnoseAppResource(getClientHTML)],
				})
			: publicRuntime;

	const auth: Auth | null = db
		? createAuth({
				db,
				baseURL: authBaseURL,
				secret: authSecret ?? process.env.BETTER_AUTH_SECRET,
				loginPage,
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

	const ANON_CONTEXT: AuthContext = {
		email: "",
		orgId: "",
		isAnonymous: true,
		loadCredentials: async () => ({}),
	};

	function unauthorizedForProprietary(req: Request, message: string): Response {
		const origin = new URL(req.url).origin;
		return new Response(message, {
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer resource_metadata="${origin}/api/auth/.well-known/oauth-protected-resource"`,
				"content-type": "text/plain; charset=utf-8",
			},
		});
	}

	function withAuth(fetcher: Fetcher): Fetcher {
		return async (req: Request, ...args) => {
			const url = new URL(req.url);

			// Mount BetterAuth handler at /api/auth/*
			if (auth && url.pathname.startsWith("/api/auth/")) {
				return auth.handler(req);
			}

			if (!url.pathname.startsWith("/api/mcp")) {
				return fetcher(req, ...args);
			}

			// Default /api/mcp path: fully anonymous, no session lookup, no DB
			// touch. Keeps zero-friction public access for anyone hitting the
			// bare URL (matches pre-auth behavior).
			const wantsProprietary = url.searchParams.has("proprietary");
			if (!wantsProprietary) {
				return authContext.run(ANON_CONTEXT, () => fetcher(req, ...args));
			}

			// /api/mcp?proprietary: explicit opt-in for proprietary tools.
			// Requires an authenticated (non-anonymous) session — otherwise
			// return 401 with WWW-Authenticate so the MCP client discovers
			// our OAuth server metadata and runs the PKCE flow.
			if (!auth || !db) {
				return unauthorizedForProprietary(
					req,
					"proprietary access requires auth to be configured",
				);
			}

			const session = await auth.api
				.getSession({ headers: req.headers })
				.catch(() => null);
			const user = session?.user as
				| { email?: string; isAnonymous?: boolean }
				| undefined;
			const isAuthed = Boolean(session && user && !user.isAnonymous);

			if (!isAuthed || !user?.email) {
				return unauthorizedForProprietary(
					req,
					"sign in to access proprietary data sources",
				);
			}

			const orgId = (await resolveOrg(db, user.email)) ?? "";
			const ctx: AuthContext = {
				email: user.email,
				orgId,
				isAnonymous: false,
				loadCredentials: orgId
					? () => loadOrgCredentials(db, orgId)
					: async () => ({}),
			};
			return authContext.run(ctx, () => fetcher(req, ...args));
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
				// Route to the runtime whose tools/list matches what this
				// client asked for. withAuth has already gated access, so by
				// the time we get here any ?proprietary request is authed.
				const chosen: Fetcher = url.searchParams.has("proprietary")
					? fullRuntime.fetch
					: fetcher;
				return chosen(rewrittenReq, ...args);
			}

			return fetcher(req, ...args);
		};
	}

	return {
		fetch: withLogging(withAuth(withMcpApiRoute(publicRuntime.fetch))),
		auth,
	};
}
