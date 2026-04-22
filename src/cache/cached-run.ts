import type { KVStore } from "./interface.ts";

export const STEP_TTLS: Record<string, number> = {
	discover: 24 * 60 * 60 * 1000,
	analyzePerf: 24 * 60 * 60 * 1000,
	analyzeSeo: 24 * 60 * 60 * 1000,
	analyzeContent: 24 * 60 * 60 * 1000,
	research: 7 * 24 * 60 * 60 * 1000,
	sourceCdn: 1 * 60 * 60 * 1000,
	sourceBigQuery: 6 * 60 * 60 * 1000,
	sourceRepo: 24 * 60 * 60 * 1000,
};

/**
 * Cache scope. `public` is shared across all callers (steps 1-6, whose results
 * depend only on the public-facing target). `org:${orgId}` isolates proprietary
 * data (steps 7-10) so two orgs diagnosing the same domain never cross paths.
 *
 * Encoded as a required parameter so forgetting it is a type error rather than
 * a silent data leak.
 */
export type CacheScope = "public" | `org:${string}`;

function cacheKey(domain: string, scope: CacheScope, step: string): string {
	return `${domain}:${scope}:${step}`;
}

/**
 * Cache wrapper for pure pipeline step functions. Keys are
 * `{domain}:{scope}:{step}` so a domain prefix purges everything and
 * `{domain}:org:{orgId}:` purges one org. When `cache` is undefined the
 * wrapper degrades to a direct call (no caching).
 */
export async function cachedRun<T>(
	cache: KVStore | undefined,
	step: string,
	scope: CacheScope,
	url: string,
	fn: () => Promise<T>,
): Promise<T> {
	if (!cache) return fn();
	const domain = new URL(url).hostname;
	const key = cacheKey(domain, scope, step);
	const cached = await cache.get<T>(key);
	if (cached !== null) return cached;
	const result = await fn();
	const ttl = STEP_TTLS[step];
	await cache.set(key, result, ttl);
	return result;
}
