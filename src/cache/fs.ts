import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { KVStore } from "./interface.ts";

interface CacheEntry<T> {
	data: T;
	expiresAt: number | null;
}

/**
 * File-based KV store for local dev. Each key is a JSON file in `dir/`.
 * Survives process restarts. Checks TTL on read.
 */
export class FileKVStore implements KVStore {
	private dir: string;

	constructor(dir: string) {
		this.dir = dir;
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	private path(key: string): string {
		// Encode key to a safe filename
		const safe = encodeURIComponent(key);
		return join(this.dir, `${safe}.json`);
	}

	async get<T>(key: string): Promise<T | null> {
		const filePath = this.path(key);
		const file = Bun.file(filePath);

		if (!(await file.exists())) return null;

		try {
			const entry: CacheEntry<T> = await file.json();

			if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
				await this.delete(key);
				return null;
			}

			return entry.data;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
		const entry: CacheEntry<T> = {
			data: value,
			expiresAt: ttlMs ? Date.now() + ttlMs : null,
		};
		await Bun.write(this.path(key), JSON.stringify(entry));
	}

	async delete(key: string): Promise<void> {
		const filePath = this.path(key);
		try {
			unlinkSync(filePath);
		} catch {
			// File doesn't exist, ignore
		}
	}

	async list(prefix?: string): Promise<string[]> {
		const files = readdirSync(this.dir);
		const keys = files
			.filter((f) => f.endsWith(".json"))
			.map((f) => decodeURIComponent(f.slice(0, -5)));

		if (prefix) {
			return keys.filter((k) => k.startsWith(prefix));
		}
		return keys;
	}
}
