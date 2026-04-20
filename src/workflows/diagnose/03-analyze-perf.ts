import { uploadScreenshot } from "../../../api/lib/storage.ts";
import {
	captureHar,
	lighthouseAudit,
	screenshot,
} from "../../integrations/browserless.ts";
import type {
	HarData,
	LighthouseData,
	PerfData,
	SampleSet,
	ScreenshotData,
} from "./types.ts";

// ── Helpers ──────────────────────────────────────────────

function toHarData(result: Awaited<ReturnType<typeof captureHar>>): HarData {
	const coldDesktop = result.passes?.find((p) => p.label === "desktop-cold");
	return {
		url: result.url,
		ttfbMs: coldDesktop?.ttfbMs ?? null,
		totalRequests: coldDesktop?.totalRequests ?? 0,
		totalKB: coldDesktop?.totalKB ?? 0,
		resourceBreakdown: result.byType,
		failedRequests: result.failed,
		thirdPartyInventory: result.topThirdParty,
		cacheHits: coldDesktop?.cache.hits ?? 0,
		cacheMisses: coldDesktop?.cache.misses ?? 0,
	};
}

function toLighthouseData(
	result: Awaited<ReturnType<typeof lighthouseAudit>>,
): LighthouseData {
	const wv = result.coreWebVitals;
	return {
		url: result.url,
		scores: result.scores,
		webVitals: {
			lcp: wv.lcp
				? {
						score: wv.lcp.score,
						value: wv.lcp.numericValue,
						display: wv.lcp.displayValue,
					}
				: null,
			cls: wv.cls
				? {
						score: wv.cls.score,
						value: wv.cls.numericValue,
						display: wv.cls.displayValue,
					}
				: null,
			tbt: wv.tbt
				? {
						score: wv.tbt.score,
						value: wv.tbt.numericValue,
						display: wv.tbt.displayValue,
					}
				: null,
			fcp: wv.fcp
				? {
						score: wv.fcp.score,
						value: wv.fcp.numericValue,
						display: wv.fcp.displayValue,
					}
				: null,
			si: wv.si
				? {
						score: wv.si.score,
						value: wv.si.numericValue,
						display: wv.si.displayValue,
					}
				: null,
			tti: wv.tti
				? {
						score: wv.tti.score,
						value: wv.tti.numericValue,
						display: wv.tti.displayValue,
					}
				: null,
		},
		diagnostics: result.diagnostics,
	};
}

function toScreenshotData(
	result: Awaited<ReturnType<typeof screenshot>>,
): ScreenshotData {
	return {
		url: result.url,
		imageUrl: result.imageUrl,
		device: result.device,
		blocked: result.blocked,
	};
}

async function uploadFn(buf: Buffer, filename: string): Promise<string> {
	await uploadScreenshot(buf, filename);
	return `/api/screenshots/${filename}`;
}

// ── Main Step ────────────────────────────────────────────

/**
 * Performance analysis: HAR capture + Lighthouse + screenshots on sample pages.
 * Runs HAR on homepage + 1 PLP + 1 PDP, Lighthouse on homepage + 1 PDP,
 * screenshots on homepage + 1 PLP + 1 PDP.
 */
export async function analyzePerformance(
	samples: SampleSet,
): Promise<PerfData> {
	const harUrls = [samples.homepage, samples.plps[0], samples.pdps[0]].filter(
		Boolean,
	);
	const lighthouseUrls = [samples.homepage, samples.pdps[0]].filter(Boolean);
	const screenshotUrls = [
		samples.homepage,
		samples.plps[0],
		samples.pdps[0],
	].filter(Boolean);

	// Run all in parallel
	const [harResults, lighthouseResults, screenshotResults] = await Promise.all([
		Promise.all(
			harUrls.map((u) => captureHar(u, { passes: 2, timeout: 30_000 })),
		),
		Promise.all(
			lighthouseUrls.map((u) => lighthouseAudit(u, { device: "mobile" })),
		),
		Promise.all(
			screenshotUrls.map((u) => screenshot(u, uploadFn, { device: "desktop" })),
		),
	]);

	return {
		hars: harResults.filter((h) => !h.error).map(toHarData),
		lighthouses: lighthouseResults
			.filter((l) => !l.error)
			.map(toLighthouseData),
		screenshots: screenshotResults.map(toScreenshotData),
	};
}
