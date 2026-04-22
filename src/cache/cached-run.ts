import type { KVStore } from "./interface.ts";

export const STEP_TTLS: Record<string, number> = {
	discover: 24 * 60 * 60 * 1000,
	analyzePerf: 24 * 60 * 60 * 1000,
	analyzeSeo: 24 * 60 * 60 * 1000,
	analyzeContent: 24 * 60 * 60 * 1000,
	research: 7 * 24 * 60 * 60 * 1000,
};

function cacheKey(domain: string, step: string): string {
	return `${domain}:${step}`;
}

/**
 * Cache wrapper for pure pipeline step functions. Keys are scoped per
 * domain+step so a repeat call on the same domain is free. When `cache`
 * is undefined the wrapper degrades to a direct call (no caching).
 */
export async function cachedRun<T>(
	cache: KVStore | undefined,
	step: string,
	url: string,
	fn: () => Promise<T>,
): Promise<T> {
	if (!cache) return fn();
	const domain = new URL(url).hostname;
	const key = cacheKey(domain, step);
	const cached = await cache.get<T>(key);
	if (cached !== null) return cached;
	const result = await fn();
	const ttl = STEP_TTLS[step];
	await cache.set(key, result, ttl);
	return result;
}
