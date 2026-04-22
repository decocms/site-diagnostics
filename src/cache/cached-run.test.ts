import { describe, expect, it } from "bun:test";
import { cachedRun } from "./cached-run.ts";
import type { KVStore } from "./interface.ts";

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

describe("cachedRun scoping", () => {
	it("public scope is shared across callers for the same domain", async () => {
		const cache = new MemKV();
		let calls = 0;
		const fn = async () => {
			calls++;
			return "result";
		};

		await cachedRun(cache, "discover", "public", URL_A, fn);
		await cachedRun(cache, "discover", "public", URL_A, fn);

		expect(calls).toBe(1);
		expect(cache.store.has("www.example.com:public:discover")).toBe(true);
	});

	it("org scope isolates entries per org", async () => {
		const cache = new MemKV();
		let calls = 0;

		const resultFor = (org: string) =>
			cachedRun(cache, "sourceCdn", `org:${org}`, URL_A, async () => {
				calls++;
				return org === "alpha" ? "alpha-data" : "beta-data";
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

	it("public and org scopes for the same step do not collide", async () => {
		const cache = new MemKV();

		await cachedRun(cache, "fake", "public", URL_A, async () => "public-val");
		await cachedRun(cache, "fake", "org:alpha", URL_A, async () => "org-val");

		expect(cache.store.size).toBe(2);
	});

	it("domain prefix scan finds all entries for a domain (both scopes)", async () => {
		const cache = new MemKV();
		await cachedRun(cache, "discover", "public", URL_A, async () => 1);
		await cachedRun(cache, "sourceCdn", "org:alpha", URL_A, async () => 2);
		await cachedRun(
			cache,
			"discover",
			"public",
			"https://other.test/x",
			async () => 3,
		);

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
		await cachedRun(undefined, "discover", "public", URL_A, fn);
		await cachedRun(undefined, "discover", "public", URL_A, fn);
		expect(calls).toBe(2);
	});
});
