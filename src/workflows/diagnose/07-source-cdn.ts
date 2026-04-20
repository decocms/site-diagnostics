import type { CdnConfig, CdnData } from "./types.ts";

/**
 * Queries a CDN data lake API for edge-level traffic, cache, and error
 * metrics. This is first-party server-side data — more reliable than
 * panel estimates, so the synthesizer should prefer these numbers when
 * both are available.
 *
 * STUB: the real CDN data lake API spec isn't wired yet. Contract stays
 * stable (CdnConfig in → CdnData out) so the runner + synthesizer can
 * integrate now; the HTTP call will land once the endpoint is defined.
 */
export async function sourceCdn(_config: CdnConfig): Promise<CdnData> {
	return {
		requestsPerSecond: [],
		topPages: [],
		geoDistribution: [],
		cacheHitRate: 0,
		cacheHitByPath: [],
		edgeVsOriginRatio: 0,
		ttfbP50: 0,
		ttfbP95: 0,
		ttfbP99: 0,
		errorRate: 0,
		errorsByStatus: [],
		error5xxTrend: [],
		totalBandwidthGB: 0,
		avgResponseSizeKB: 0,
	};
}
