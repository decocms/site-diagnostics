import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withRuntime } from "@decocms/runtime";
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
	const { clientHTML } = config;

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
						"access-control-allow-origin": "*",
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
		fetch: withLogging(withMcpApiRoute(runtime.fetch)),
	};
}
