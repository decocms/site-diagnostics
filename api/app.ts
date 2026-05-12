import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withRuntime } from "@decocms/runtime";
import { type Auth, createAuth } from "../src/auth/auth.ts";
import { type AuthContext, authContext } from "../src/auth/context.ts";
import { loadOrgCredentials } from "../src/auth/credentials.ts";
import type { AuthDB } from "../src/auth/db.ts";
import { resolveOrg } from "../src/auth/resolve-org.ts";
import type { KVStore } from "../src/cache/interface.ts";
import { renderLoginPage } from "./lib/login-page.ts";
import { generateOgImage } from "./lib/og-image.tsx";
import {
	getScreenshot,
	loadDiagnostic,
	loadOgImage,
	loadPublicShare,
	saveOgImage,
} from "./lib/storage.ts";
import { prompts } from "./prompts/index.ts";
import { createDiagnoseAppResource } from "./resources/diagnose.ts";
import {
	createStepTools,
	proprietaryTools,
	publicTools,
} from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

function escapeAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

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
	/** Delivers OTP codes. Falls back to a console.log stub when omitted. */
	sendOTP?: (data: { email: string; otp: string }) => Promise<void>;
	/** KV store for per-domain step caching. When omitted, step tools skip caching. */
	cache?: KVStore;
	/** Bearer token for the /purge admin endpoint. When omitted, /purge returns 404. */
	adminSecret?: string;
	/**
	 * Base64-encoded 32-byte key used to decrypt org_credentials rows.
	 * Required to serve proprietary tools. When omitted, /api/mcp?proprietary
	 * returns 401 even for authenticated users — the server cannot read creds.
	 */
	credsEncryptionKey?: string;
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
	const {
		clientHTML,
		db,
		authBaseURL,
		authSecret,
		loginPage,
		sendOTP,
		cache,
		adminSecret,
		credsEncryptionKey,
	} = config;

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

	// /api/mcp?steps exposes only the 5 step-level pipeline tools
	// (discover, analyze_perf, analyze_seo, analyze_content, research).
	// Hosts that orchestrate the diagnostic flow themselves use this
	// surface to avoid wading through 17 low-level primitives.
	const stepsRuntime = withRuntime<Env, typeof StateSchema>({
		configuration: { state: StateSchema },
		tools: createStepTools(cache),
		prompts,
		resources: [createDiagnoseAppResource(getClientHTML)],
	});

	const auth: Auth | null = db
		? createAuth({
				db,
				baseURL: authBaseURL,
				secret: authSecret ?? process.env.BETTER_AUTH_SECRET,
				loginPage,
				sendOTP,
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

			// Without the encryption key we literally cannot decrypt creds.
			// Fail closed rather than hand the request an empty bundle and
			// pretend everything is fine.
			if (!credsEncryptionKey) {
				return unauthorizedForProprietary(
					req,
					"proprietary access requires CREDS_ENCRYPTION_KEY to be configured",
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
					? () => loadOrgCredentials(db, orgId, credsEncryptionKey)
					: async () => ({}),
			};
			return authContext.run(ctx, () => fetcher(req, ...args));
		};
	}

	// Only serve the built-in login page when loginPage is a local path —
	// if it's an absolute URL the caller is hosting the page elsewhere.
	const loginPath =
		!loginPage || loginPage.startsWith("/") ? (loginPage ?? "/login") : null;

	function withMcpApiRoute(fetcher: Fetcher): Fetcher {
		return async (req: Request, ...args) => {
			const url = new URL(req.url);

			if (loginPath && url.pathname === loginPath) {
				return new Response(renderLoginPage(), {
					headers: {
						"content-type": "text/html; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
				return new Response("Not Found", { status: 404 });
			}

			// Admin cache purge. Gated by ADMIN_SECRET via Authorization header
			// (not a query param — avoids leaking in logs/referers). Accepts
			// `{ key }` for single-key purge or `{ domain }` to purge all keys
			// prefixed with `domain:` (matches the cachedRun key scheme).
			if (url.pathname === "/purge" && req.method === "POST") {
				if (!adminSecret || !cache) {
					return new Response("Not Found", { status: 404 });
				}
				const token = req.headers
					.get("authorization")
					?.replace(/^Bearer\s+/i, "");
				if (token !== adminSecret) {
					return new Response("Unauthorized", { status: 401 });
				}
				let body: { key?: unknown; domain?: unknown };
				try {
					body = (await req.json()) as typeof body;
				} catch {
					return new Response("Invalid JSON body", { status: 400 });
				}
				if (typeof body.key === "string" && body.key.length > 0) {
					await cache.delete(body.key);
					return Response.json({ purged: [body.key] });
				}
				if (typeof body.domain === "string" && body.domain.length > 0) {
					const keys = await cache.list(`${body.domain}:`);
					await Promise.all(keys.map((k) => cache.delete(k)));
					return Response.json({ purged: keys });
				}
				return new Response("Missing key or domain in body", { status: 400 });
			}

			// Public share page: /d/{token} — renders the diagnostic UI with the
			// report JSON injected into the HTML so the web app can boot in
			// standalone mode (skipping the MCP handshake entirely).
			if (url.pathname.startsWith("/d/") && req.method === "GET") {
				const token = url.pathname.slice("/d/".length);
				if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
					return new Response("Not Found", { status: 404 });
				}
				const share = await loadPublicShare(token).catch(() => null);
				if (!share) {
					return new Response(
						"This diagnostic link has expired or been revoked.",
						{
							status: 404,
							headers: { "content-type": "text/plain; charset=utf-8" },
						},
					);
				}
				const diagnostic = await loadDiagnostic(
					share.diagnosticId,
					share.orgId,
				).catch(() => null);
				if (!diagnostic) {
					return new Response("Diagnostic not found.", {
						status: 404,
						headers: { "content-type": "text/plain; charset=utf-8" },
					});
				}

				const diagDomain = (() => {
					try {
						return new URL(diagnostic.url).hostname.replace(/^www\./, "");
					} catch {
						return diagnostic.url;
					}
				})();
				const pageTitle = escapeAttr(
					`${diagnostic.title || diagDomain} — Site Diagnostics`,
				);
				const pageDesc = diagnostic.summary
					? escapeAttr(diagnostic.summary.slice(0, 155))
					: escapeAttr(
							`Performance & SEO diagnostic for ${diagDomain}. Health score: ${diagnostic.healthScore ?? "N/A"}/100.`,
						);
				const canonicalUrl = `${url.origin}/d/${token}`;

				const ogImageUrl = `${url.origin}/og/${token}.png`;
				const seoTags = [
					`<title>${pageTitle}</title>`,
					`<meta name="description" content="${pageDesc}" />`,
					`<meta property="og:title" content="${pageTitle}" />`,
					`<meta property="og:description" content="${pageDesc}" />`,
					`<meta property="og:url" content="${canonicalUrl}" />`,
					`<meta property="og:type" content="website" />`,
					`<meta property="og:image" content="${ogImageUrl}" />`,
					`<meta property="og:image:width" content="1200" />`,
					`<meta property="og:image:height" content="630" />`,
					`<meta name="twitter:card" content="summary_large_image" />`,
					`<meta name="twitter:title" content="${pageTitle}" />`,
					`<meta name="twitter:description" content="${pageDesc}" />`,
					`<meta name="twitter:image" content="${ogImageUrl}" />`,
					`<link rel="canonical" href="${canonicalUrl}" />`,
					`<link rel="icon" href="https://www.google.com/s2/favicons?domain=${diagDomain}&sz=64" />`,
				].join("\n\t\t");

				const html = await getClientHTML();
				// Escape `<` so `</script>` in report markdown can't break out.
				const payload = JSON.stringify(diagnostic).replace(/</g, "\\u003c");
				const injected = `<script>window.__PUBLIC_DIAGNOSTIC__=${payload};</script>`;
				// Strip the static SEO tags from index.html so crawlers (which
				// pick the first occurrence) don't read the generic defaults
				// instead of our dynamic ones.
				const stripped = html
					.replace(/<title>[^<]*<\/title>\s*/i, "")
					.replace(/<meta\s+name=["']description["'][^>]*\/?>\s*/gi, "")
					.replace(/<meta\s+property=["']og:[^"']+["'][^>]*\/?>\s*/gi, "")
					.replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*\/?>\s*/gi, "");
				const withPayload = stripped.includes("</head>")
					? stripped.replace(
							"</head>",
							`\t\t${seoTags}\n\t\t${injected}\n\t</head>`,
						)
					: `${injected}${stripped}`;
				return new Response(withPayload, {
					headers: {
						"content-type": "text/html; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			// OG image: /og/{token}.png — generated on first request, cached in R2
			if (url.pathname.startsWith("/og/") && req.method === "GET") {
				const ogToken = url.pathname.slice("/og/".length).replace(/\.png$/, "");
				if (!/^[A-Za-z0-9_-]{16,64}$/.test(ogToken)) {
					return new Response("Not Found", { status: 404 });
				}

				// Serve from R2 cache if already generated
				const cached = await loadOgImage(ogToken).catch(() => null);
				if (cached) {
					return new Response(cached, {
						headers: {
							"content-type": "image/png",
							"cache-control": "public, max-age=31536000, immutable",
						},
					});
				}

				// Resolve the share → diagnostic
				const ogShare = await loadPublicShare(ogToken).catch(() => null);
				if (!ogShare) {
					return new Response("Not Found", { status: 404 });
				}
				const ogDiagnostic = await loadDiagnostic(
					ogShare.diagnosticId,
					ogShare.orgId,
				).catch(() => null);
				if (!ogDiagnostic) {
					return new Response("Not Found", { status: 404 });
				}

				let png: Uint8Array;
				try {
					png = await generateOgImage(ogDiagnostic);
				} catch (err) {
					console.error("[og-image] generation failed:", err);
					return new Response("Failed to generate image", { status: 500 });
				}
				// Cache in R2 (fire-and-forget — don't block the response)
				saveOgImage(ogToken, png).catch(() => {});
				return new Response(new Uint8Array(png), {
					headers: {
						"content-type": "image/png",
						"cache-control": "public, max-age=31536000, immutable",
					},
				});
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
					: url.searchParams.has("steps")
						? stepsRuntime.fetch
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
