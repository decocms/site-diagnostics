import type { KVStore } from "./interface.ts";

export interface CachedRunArgs<T> {
	/** Optional KV store. When undefined, degrades to a direct call. */
	cache: KVStore | undefined;
	/**
	 * Cache key segments. Built via a `KEYS.xxx()` factory from
	 * `src/cache/keys.ts` — do not hand-build at call sites.
	 * Joined with `:` to produce the final key.
	 */
	key: string[];
	/** Optional TTL in ms. When undefined, entry never expires. */
	ttlMs?: number;
	/** The pure step function to run on cache miss. */
	fn: () => Promise<T>;
}

/**
 * Cache wrapper for pure pipeline step functions. The `key` array is spread
 * from `KEYS.xxx({ url [, orgId] })` — see `src/cache/keys.ts` for the
 * registered steps. Centralizing key construction there prevents typo'd
 * keys and keeps the format change-blast-radius to one file.
 */
export async function cachedRun<T>({
	cache,
	key,
	ttlMs,
	fn,
}: CachedRunArgs<T>): Promise<T> {
	if (!cache) return fn();
	const joined = key.join(":");
	const cached = await cache.get<T>(joined);
	if (cached !== null) return cached;
	const result = await fn();
	await cache.set(joined, result, ttlMs);
	return result;
}
