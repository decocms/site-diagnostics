/**
 * Cache key + TTL descriptors for every cached pipeline step.
 *
 * One factory per step. Public steps accept `{ url }`, proprietary steps
 * accept `{ url, orgId }` — type-enforcing the "public data is shared, org
 * data is isolated" invariant at the call site rather than through a scope
 * string the caller could get wrong.
 *
 * The returned `{ key, ttlMs }` is spread straight into `cachedRun`. If the
 * shape of a key ever needs to change (extra segments, different hashing,
 * etc.) the edit lands in one place.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export interface CacheKeyDescriptor {
	/** Colon-joined by cachedRun. Order matters — domain first so prefix purges work. */
	key: string[];
	ttlMs: number;
}

function hostname(url: string): string {
	return new URL(url).hostname;
}

interface PublicArgs {
	url: string;
}

interface OrgArgs {
	url: string;
	orgId: string;
}

export const KEYS = {
	discover: ({ url }: PublicArgs): CacheKeyDescriptor => ({
		key: [hostname(url), "public", "discover"],
		ttlMs: DAY,
	}),
	analyzePerf: ({ url }: PublicArgs): CacheKeyDescriptor => ({
		key: [hostname(url), "public", "analyzePerf"],
		ttlMs: DAY,
	}),
	analyzeSeo: ({ url }: PublicArgs): CacheKeyDescriptor => ({
		key: [hostname(url), "public", "analyzeSeo"],
		ttlMs: DAY,
	}),
	analyzeContent: ({ url }: PublicArgs): CacheKeyDescriptor => ({
		key: [hostname(url), "public", "analyzeContent"],
		ttlMs: DAY,
	}),
	research: ({ url }: PublicArgs): CacheKeyDescriptor => ({
		key: [hostname(url), "public", "research"],
		ttlMs: WEEK,
	}),
	sourceCdn: ({ url, orgId }: OrgArgs): CacheKeyDescriptor => ({
		key: [hostname(url), `org:${orgId}`, "sourceCdn"],
		ttlMs: HOUR,
	}),
	sourceBigQuery: ({ url, orgId }: OrgArgs): CacheKeyDescriptor => ({
		key: [hostname(url), `org:${orgId}`, "sourceBigQuery"],
		ttlMs: 6 * HOUR,
	}),
	sourceRepo: ({ url, orgId }: OrgArgs): CacheKeyDescriptor => ({
		key: [hostname(url), `org:${orgId}`, "sourceRepo"],
		ttlMs: DAY,
	}),
} as const;
