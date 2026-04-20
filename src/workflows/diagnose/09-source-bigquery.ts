import type { AnalyticsData, BigQueryConfig } from "./types.ts";

/**
 * Runs predefined GA4-export queries against BigQuery for bounce rates,
 * conversion funnels, traffic trends, device split, top landing pages,
 * and (when available) Search Console integration.
 *
 * STUB: query templates + service-account auth land once a real GA4
 * export dataset is connected. The runner treats a rejected source as
 * null and the synthesizer omits the analytics section.
 */
export async function sourceBigQuery(
	_config: BigQueryConfig,
	_url: string,
): Promise<AnalyticsData> {
	return {
		bounceByPageType: {},
		conversionFunnel: [],
		trafficTrend: [],
		deviceSplit: { desktop: 0, mobile: 0, tablet: 0 },
		topLandingPages: [],
		searchConsole: [],
	};
}
