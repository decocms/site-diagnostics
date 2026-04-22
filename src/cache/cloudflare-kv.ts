import type { KVStore } from "./interface.ts";

/**
 * Minimal slice of the Cloudflare Workers KV binding surface we use.
 * Declared locally so the module stays runtime-agnostic and doesn't pull
 * in @cloudflare/workers-types.
 */
export interface CloudflareKVNamespace {
	get(key: string, options: { type: "json" }): Promise<unknown>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
	list(options?: { prefix?: string; cursor?: string }): Promise<{
		keys: Array<{ name: string }>;
		list_complete: boolean;
		cursor?: string;
	}>;
}

/**
 * KVStore backed by a Cloudflare Workers KV namespace binding.
 * Values are stored as raw JSON; TTLs map to `expirationTtl` (seconds).
 * KV enforces a 60s minimum TTL — any shorter value is rounded up.
 */
export class CloudflareKVStore implements KVStore {
	constructor(private readonly kv: CloudflareKVNamespace) {}

	async get<T>(key: string): Promise<T | null> {
		const value = await this.kv.get(key, { type: "json" });
		return (value as T | null) ?? null;
	}

	async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
		const options =
			ttlMs !== undefined
				? { expirationTtl: Math.max(60, Math.floor(ttlMs / 1000)) }
				: undefined;
		await this.kv.put(key, JSON.stringify(value), options);
	}

	async delete(key: string): Promise<void> {
		await this.kv.delete(key);
	}

	async list(prefix?: string): Promise<string[]> {
		const names: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await this.kv.list({ prefix, cursor });
			for (const k of page.keys) names.push(k.name);
			cursor = page.list_complete ? undefined : page.cursor;
		} while (cursor);
		return names;
	}
}
