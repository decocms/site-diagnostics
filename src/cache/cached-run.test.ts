import { describe, expect, it } from "bun:test";
import { cachedRun } from "./cached-run.ts";
import type { KVStore } from "./interface.ts";
import { KEYS } from "./keys.ts";

class MemKV implements KVStore {
	store = new Map<string, unknown>();
	async get<T>(key: string): Promise<T | null> {
		return (this.store.get(key) as T) ?? null;
	}
	async set<T>(key: string, value: T): Promise<void> {
		this.store.set(key, value);
	}
	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
	async list(prefix?: string): Promise<string[]> {
		const keys = Array.from(this.store.keys());
		return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
	}
}

const URL_A = "https://www.example.com/anything";

describe("cachedRun + KEYS", () => {
	it("public step reuses the same entry across callers for the same domain", async () => {
		const cache = new MemKV();
		let calls = 0;
		const fn = async () => {
			calls++;
			return "result";
		};

		await cachedRun({ cache, ...KEYS.discover({ url: URL_A }), fn });
		await cachedRun({ cache, ...KEYS.discover({ url: URL_A }), fn });

		expect(calls).toBe(1);
		expect(cache.store.has("www.example.com:public:discover")).toBe(true);
	});

	it("proprietary step isolates entries per org", async () => {
		const cache = new MemKV();
		let calls = 0;

		const resultFor = (orgId: string) =>
			cachedRun({
				cache,
				...KEYS.sourceCdn({ url: URL_A, orgId }),
				fn: async () => {
					calls++;
					return orgId === "alpha" ? "alpha-data" : "beta-data";
				},
			});

		const a1 = await resultFor("alpha");
		const b1 = await resultFor("beta");
		const a2 = await resultFor("alpha"); // cached
		const b2 = await resultFor("beta"); // cached

		expect(a1).toBe("alpha-data");
		expect(b1).toBe("beta-data");
		expect(a2).toBe("alpha-data");
		expect(b2).toBe("beta-data");
		expect(calls).toBe(2); // one per distinct org

		expect(cache.store.has("www.example.com:org:alpha:sourceCdn")).toBe(true);
		expect(cache.store.has("www.example.com:org:beta:sourceCdn")).toBe(true);
	});

	it("public and proprietary steps for the same domain do not collide", async () => {
		const cache = new MemKV();
		await cachedRun({
			cache,
			...KEYS.discover({ url: URL_A }),
			fn: async () => "public-val",
		});
		await cachedRun({
			cache,
			...KEYS.sourceCdn({ url: URL_A, orgId: "alpha" }),
			fn: async () => "org-val",
		});
		expect(cache.store.size).toBe(2);
	});

	it("domain prefix scan finds all entries for a domain (both scopes)", async () => {
		const cache = new MemKV();
		await cachedRun({
			cache,
			...KEYS.discover({ url: URL_A }),
			fn: async () => 1,
		});
		await cachedRun({
			cache,
			...KEYS.sourceCdn({ url: URL_A, orgId: "alpha" }),
			fn: async () => 2,
		});
		await cachedRun({
			cache,
			...KEYS.discover({ url: "https://other.test/x" }),
			fn: async () => 3,
		});

		const forExample = await cache.list("www.example.com:");
		expect(forExample.sort()).toEqual(
			[
				"www.example.com:org:alpha:sourceCdn",
				"www.example.com:public:discover",
			].sort(),
		);
	});

	it("without a cache, always calls the underlying function", async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			return "x";
		};
		await cachedRun({
			cache: undefined,
			...KEYS.discover({ url: URL_A }),
			fn,
		});
		await cachedRun({
			cache: undefined,
			...KEYS.discover({ url: URL_A }),
			fn,
		});
		expect(calls).toBe(2);
	});
});

describe("KEYS factories", () => {
	it("public factories produce [domain, 'public', step]", () => {
		expect(KEYS.discover({ url: URL_A }).key).toEqual([
			"www.example.com",
			"public",
			"discover",
		]);
		expect(KEYS.research({ url: URL_A }).key).toEqual([
			"www.example.com",
			"public",
			"research",
		]);
	});

	it("org factories embed the org id", () => {
		expect(KEYS.sourceCdn({ url: URL_A, orgId: "abc" }).key).toEqual([
			"www.example.com",
			"org:abc",
			"sourceCdn",
		]);
	});

	it("each step carries its own TTL", () => {
		expect(KEYS.discover({ url: URL_A }).ttlMs).toBe(24 * 60 * 60 * 1000);
		expect(KEYS.research({ url: URL_A }).ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
		expect(KEYS.sourceCdn({ url: URL_A, orgId: "x" }).ttlMs).toBe(
			60 * 60 * 1000,
		);
	});
});
