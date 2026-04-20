import type { HyperDxConfig, HyperDxData } from "./types.ts";

/**
 * Queries HyperDX for recent error rate, top errors, latency percentiles,
 * and spike detection. Never cached — the whole point is catching fresh
 * production incidents.
 *
 * STUB: contract only. Real HyperDX query wiring (requires knowing the
 * org's service names + token scopes) lands once credentials are configured
 * for a real tenant.
 */
export async function sourceHyperDx(
	_config: HyperDxConfig,
): Promise<HyperDxData> {
	return {
		errorRate: 0,
		topErrors: [],
		latency: { p50: 0, p95: 0, p99: 0 },
		errorPaths: [],
		recentSpikes: [],
	};
}
