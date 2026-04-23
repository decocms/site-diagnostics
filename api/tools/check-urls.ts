import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { isPrivateHost } from "../../src/lib/ssrf.ts";
import type { Env } from "../types/env.ts";

// ── Constants ──────────────────────────────────────────────

const MAX_URLS_PER_CALL = 100;
const MAX_REDIRECTS = 5;
const LINK_CHECK_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; SiteDiagnosticsBot/1.0)";

// ── Schemas ────────────────────────────────────────────────

export const checkUrlsInputSchema = z.object({
	urls: z
		.array(z.string())
		.min(1)
		.max(MAX_URLS_PER_CALL)
		.describe(
			`Batch of URLs to check. Max ${MAX_URLS_PER_CALL} per call — chunk larger sets and call repeatedly.`,
		),
	concurrency: z
		.number()
		.min(1)
		.max(20)
		.default(10)
		.describe("Parallel HTTP requests when checking URLs"),
});

export type CheckUrlsInput = z.infer<typeof checkUrlsInputSchema>;

const errorKindSchema = z.enum([
	"http",
	"timeout",
	"dns",
	"connection",
	"redirect-loop",
]);

export const checkUrlsOutputSchema = z.object({
	results: z.array(
		z.object({
			targetUrl: z.string(),
			status: z
				.number()
				.describe(
					"Final HTTP status. 0 means a transport error before any response (timeout, DNS, connection, redirect-loop).",
				),
			errorKind: errorKindSchema
				.optional()
				.describe(
					"Absent when status is 2xx/3xx. Present with 'http' for 4xx/5xx, or the specific transport-error kind when status is 0.",
				),
			chain: z
				.array(z.string())
				.describe("Full redirect chain from the input URL to the final URL"),
			hops: z.number().describe("chain.length - 1"),
		}),
	),
});

export type CheckUrlsOutput = z.infer<typeof checkUrlsOutputSchema>;

// ── Helpers ────────────────────────────────────────────────

/** Classify a thrown fetch error into an errorKind. */
function classifyFetchError(err: unknown): "timeout" | "dns" | "connection" {
	const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
	if (/timeout|AbortError|timed out/i.test(msg)) return "timeout";
	if (/ENOTFOUND|DNS|getaddrinfo/i.test(msg)) return "dns";
	return "connection";
}

interface LinkCheckResult {
	status: number;
	chain: string[];
	errorKind?: "timeout" | "dns" | "connection" | "redirect-loop";
}

/** Check a URL by HEAD (fallback GET). Track redirect chain manually. */
async function checkLink(url: string): Promise<LinkCheckResult> {
	const chain: string[] = [url];
	const visited = new Set<string>([url]);
	let current = url;

	for (let i = 0; i <= MAX_REDIRECTS; i++) {
		let target: URL;
		try {
			target = new URL(current);
		} catch {
			return { status: 0, chain, errorKind: "connection" };
		}
		if (!/^https?:$/.test(target.protocol)) {
			return { status: 0, chain, errorKind: "connection" };
		}
		if (isPrivateHost(target.hostname)) {
			return { status: 0, chain, errorKind: "connection" };
		}

		let resp: Response;
		try {
			resp = await fetch(current, {
				method: "HEAD",
				redirect: "manual",
				headers: { "user-agent": USER_AGENT },
				signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
			});
			// Some servers reject HEAD — fall back to GET
			if (resp.status === 405 || resp.status === 403 || resp.status === 501) {
				resp = await fetch(current, {
					method: "GET",
					redirect: "manual",
					headers: { "user-agent": USER_AGENT },
					signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
				});
			}
		} catch (err) {
			return { status: 0, chain, errorKind: classifyFetchError(err) };
		}

		// Non-redirect response: we're done
		if (resp.status < 300 || resp.status >= 400) {
			return { status: resp.status, chain };
		}

		const location = resp.headers.get("location");
		if (!location) return { status: resp.status, chain };

		let next: string;
		try {
			next = new URL(location, current).href;
		} catch {
			return { status: resp.status, chain, errorKind: "connection" };
		}

		if (visited.has(next)) {
			chain.push(next);
			return { status: 0, chain, errorKind: "redirect-loop" };
		}
		visited.add(next);
		chain.push(next);
		current = next;
	}

	// Exceeded MAX_REDIRECTS without a terminal response
	return { status: 0, chain, errorKind: "redirect-loop" };
}

/** Run an async mapper over items with a concurrency cap. */
async function mapConcurrent<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (true) {
			const i = cursor++;
			if (i >= items.length) return;
			out[i] = await fn(items[i]);
		}
	}

	const n = Math.min(limit, Math.max(items.length, 1));
	await Promise.all(Array.from({ length: n }, worker));
	return out;
}

// ── Tool Definition ────────────────────────────────────────

export const checkUrlsTool = (_env: Env) =>
	createTool({
		id: "check_urls",
		description: `Check the HTTP status of a batch of URLs. Each URL is HEAD-tested (falls back to GET on 403/405/501), with redirects tracked manually so the full chain is reported. Pair with collect_site_links: collect the unique targets once, then chunk them into batches of ≤${MAX_URLS_PER_CALL} and call this tool per batch. Results include status, error kind (for non-2xx), redirect chain, and hop count.`,
		inputSchema: checkUrlsInputSchema,
		outputSchema: checkUrlsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { urls, concurrency } = context;
			const linkResults = await mapConcurrent(urls, concurrency, checkLink);

			const results = urls.map((targetUrl, i) => {
				const r = linkResults[i];
				const isSuccess = r.status >= 200 && r.status < 400;
				const errorKind = isSuccess
					? undefined
					: (r.errorKind ?? ("http" as const));
				return {
					targetUrl,
					status: r.status,
					errorKind,
					chain: r.chain,
					hops: r.chain.length - 1,
				};
			});

			return { results };
		},
	});
