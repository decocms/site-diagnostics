import { createTool } from "@decocms/runtime/tools";
import { harFromMessages } from "chrome-har";
import puppeteer from "puppeteer-core";
import { z } from "zod";
import {
	DESKTOP_VIEWPORT,
	findLocalChromium,
	getBrowserMode,
	MOBILE_UA,
	MOBILE_VIEWPORT,
	resolveBrowserEndpoint,
} from "../lib/browserless.ts";
import { proxyCountryInput, urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const captureHarInputSchema = z.object({
	url: urlInput.describe("The URL to diagnose"),
	waitUntil: z
		.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
		.default("networkidle2"),
	timeout: z
		.number()
		.max(60_000)
		.default(30000)
		.describe("Navigation timeout in ms"),
	passes: z
		.number()
		.min(1)
		.max(5)
		.default(2)
		.describe("Loads per device (1=cold only, 2=cold+1 warm)"),
	proxyCountry: proxyCountryInput,
	cookies: z.record(z.string(), z.string()).optional(),
});

export type CaptureHarInput = z.infer<typeof captureHarInputSchema>;

export const captureHarOutputSchema = z.object({
	url: z.string(),
	passes: z
		.array(
			z.object({
				device: z.enum(["desktop", "mobile"]),
				pass: z.number(),
				label: z.string(),
				ttfbMs: z.number().nullable(),
				totalRequests: z.number(),
				totalKB: z.number(),
				cache: z.object({ hits: z.number(), misses: z.number() }),
				failedCount: z.number(),
			}),
		)
		.optional(),
	byType: z
		.record(z.string(), z.object({ count: z.number(), bytes: z.number() }))
		.optional(),
	failed: z
		.array(z.object({ path: z.string(), status: z.number() }))
		.optional(),
	top10Slowest: z
		.array(
			z.object({
				path: z.string(),
				ms: z.number(),
				status: z.number(),
				kb: z.number(),
			}),
		)
		.optional(),
	topThirdParty: z
		.array(
			z.object({
				domain: z.string(),
				requests: z.number(),
				kb: z.number(),
			}),
		)
		.optional(),
	cacheDetails: z
		.array(
			z.object({
				path: z.string(),
				cacheControl: z.string(),
				xCache: z.string(),
				age: z.string(),
			}),
		)
		.optional(),
	error: z.string().optional(),
});

export type CaptureHarOutput = z.infer<typeof captureHarOutputSchema>;

// ── Concurrency Limiter ────────────────────────────────────

const MAX_CONCURRENT = 2;
const QUEUE_TIMEOUT_MS = 90_000;
let activeSessions = 0;
const waitQueue: Array<{
	resolve: () => void;
	reject: (err: Error) => void;
}> = [];

async function acquireSession(): Promise<void> {
	if (activeSessions < MAX_CONCURRENT) {
		activeSessions++;
		return;
	}

	return new Promise<void>((resolve, reject) => {
		const entry = { resolve, reject };
		waitQueue.push(entry);

		const timer = setTimeout(() => {
			const idx = waitQueue.indexOf(entry);
			if (idx >= 0) waitQueue.splice(idx, 1);
			reject(
				new Error(
					`Browser session queue timeout after ${QUEUE_TIMEOUT_MS / 1000}s`,
				),
			);
		}, QUEUE_TIMEOUT_MS);

		// Wrap resolve to clear timer
		const origResolve = entry.resolve;
		entry.resolve = () => {
			clearTimeout(timer);
			origResolve();
		};
	});
}

function releaseSession(): void {
	if (waitQueue.length > 0) {
		const next = waitQueue.shift();
		next?.resolve();
	} else {
		activeSessions = Math.max(0, activeSessions - 1);
	}
}

// ── CDP Event Capture ──────────────────────────────────────

const CDP_OBSERVE = [
	"Page.loadEventFired",
	"Page.domContentEventFired",
	"Page.frameStartedLoading",
	"Page.frameAttached",
	"Network.requestWillBeSent",
	"Network.requestServedFromCache",
	"Network.dataReceived",
	"Network.responseReceived",
	"Network.resourceChangedPriority",
	"Network.loadingFinished",
	"Network.loadingFailed",
] as const;

const MAX_ENTRIES_PER_PASS = 500;

interface CdpMessage {
	method: string;
	params: unknown;
}

// ── HAR Analysis ───────────────────────────────────────────

interface PassResult {
	device: "desktop" | "mobile";
	pass: number;
	label: string;
	ttfbMs: number | null;
	totalRequests: number;
	totalKB: number;
	cache: { hits: number; misses: number };
	failedCount: number;
}

interface FullAnalysis {
	byType: Record<string, { count: number; bytes: number }>;
	failed: Array<{ path: string; status: number }>;
	top10Slowest: Array<{
		path: string;
		ms: number;
		status: number;
		kb: number;
	}>;
	topThirdParty: Array<{ domain: string; requests: number; kb: number }>;
	cacheDetails: Array<{
		path: string;
		cacheControl: string;
		xCache: string;
		age: string;
	}>;
}

function getHeaderValue(
	headers: Array<{ name: string; value: string }>,
	name: string,
): string {
	const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
	return h?.value ?? "";
}

function isCacheHit(headers: Array<{ name: string; value: string }>): boolean {
	const xCache = getHeaderValue(headers, "x-cache").toLowerCase();
	const cfCache = getHeaderValue(headers, "cf-cache-status").toLowerCase();
	const cacheControl = getHeaderValue(headers, "cache-control").toLowerCase();

	if (xCache.includes("hit") || cfCache === "hit" || cfCache === "dynamic")
		return true;
	if (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))
		return false;
	if (xCache.includes("miss") || cfCache === "miss") return false;

	return false;
}

function analyzeHarEntries(
	entries: Array<{
		startedDateTime: string;
		time: number;
		request: {
			method: string;
			url: string;
			headers: Array<{ name: string; value: string }>;
		};
		response: {
			status: number;
			headers: Array<{ name: string; value: string }>;
			content: { size: number; mimeType: string };
		};
		timings: {
			blocked: number;
			dns: number;
			connect: number;
			ssl: number;
			send: number;
			wait: number;
			receive: number;
		};
	}>,
	baseUrl: string,
	device: "desktop" | "mobile",
	passNum: number,
	includeFullAnalysis: boolean,
): { passResult: PassResult; fullAnalysis?: FullAnalysis } {
	const label = passNum === 0 ? `${device}-cold` : `${device}-warm-${passNum}`;

	if (entries.length === 0) {
		return {
			passResult: {
				device,
				pass: passNum,
				label,
				ttfbMs: null,
				totalRequests: 0,
				totalKB: 0,
				cache: { hits: 0, misses: 0 },
				failedCount: 0,
			},
		};
	}

	// TTFB: wait time of the first document request
	const baseHost = new URL(baseUrl).hostname;
	const docEntry = entries.find((e) => {
		try {
			return new URL(e.request.url).hostname === baseHost;
		} catch {
			return false;
		}
	});
	const ttfbMs = docEntry
		? Math.round(
				(docEntry.timings.dns > 0 ? docEntry.timings.dns : 0) +
					(docEntry.timings.connect > 0 ? docEntry.timings.connect : 0) +
					(docEntry.timings.ssl > 0 ? docEntry.timings.ssl : 0) +
					(docEntry.timings.send > 0 ? docEntry.timings.send : 0) +
					(docEntry.timings.wait > 0 ? docEntry.timings.wait : 0),
			)
		: null;

	let totalBytes = 0;
	let cacheHits = 0;
	let cacheMisses = 0;
	let failedCount = 0;

	for (const entry of entries) {
		totalBytes += entry.response.content.size || 0;
		if (entry.response.status >= 400 || entry.response.status === 0) {
			failedCount++;
		}
		if (isCacheHit(entry.response.headers)) {
			cacheHits++;
		} else {
			cacheMisses++;
		}
	}

	const passResult: PassResult = {
		device,
		pass: passNum,
		label,
		ttfbMs,
		totalRequests: entries.length,
		totalKB: Math.round(totalBytes / 1024),
		cache: { hits: cacheHits, misses: cacheMisses },
		failedCount,
	};

	if (!includeFullAnalysis) return { passResult };

	// Full analysis (cold desktop pass only)
	const byType: Record<string, { count: number; bytes: number }> = {};
	const failed: Array<{ path: string; status: number }> = [];
	const thirdPartyMap = new Map<string, { requests: number; bytes: number }>();
	const cacheDetails: Array<{
		path: string;
		cacheControl: string;
		xCache: string;
		age: string;
	}> = [];

	for (const entry of entries) {
		const mime = entry.response.content.mimeType?.split(";")[0] || "other";
		const type = categorizeType(mime);
		if (!byType[type]) byType[type] = { count: 0, bytes: 0 };
		byType[type].count++;
		byType[type].bytes += entry.response.content.size || 0;

		if (entry.response.status >= 400 || entry.response.status === 0) {
			try {
				failed.push({
					path: new URL(entry.request.url).pathname,
					status: entry.response.status,
				});
			} catch {
				failed.push({ path: entry.request.url, status: entry.response.status });
			}
		}

		// Third party
		try {
			const entryHost = new URL(entry.request.url).hostname;
			if (entryHost !== baseHost) {
				const existing = thirdPartyMap.get(entryHost) ?? {
					requests: 0,
					bytes: 0,
				};
				existing.requests++;
				existing.bytes += entry.response.content.size || 0;
				thirdPartyMap.set(entryHost, existing);
			}
		} catch {
			// Invalid URL
		}

		// Cache details (sample first 20)
		if (cacheDetails.length < 20) {
			const cc = getHeaderValue(entry.response.headers, "cache-control");
			const xc = getHeaderValue(entry.response.headers, "x-cache");
			const age = getHeaderValue(entry.response.headers, "age");
			if (cc || xc) {
				try {
					cacheDetails.push({
						path: new URL(entry.request.url).pathname,
						cacheControl: cc,
						xCache: xc,
						age,
					});
				} catch {
					// skip
				}
			}
		}
	}

	// Top 10 slowest
	const top10Slowest = entries
		.filter((e) => e.time > 0)
		.sort((a, b) => b.time - a.time)
		.slice(0, 10)
		.map((e) => {
			let path: string;
			try {
				path = new URL(e.request.url).pathname;
			} catch {
				path = e.request.url;
			}
			return {
				path,
				ms: Math.round(e.time),
				status: e.response.status,
				kb: Math.round((e.response.content.size || 0) / 1024),
			};
		});

	// Top third-party domains
	const topThirdParty = Array.from(thirdPartyMap.entries())
		.map(([domain, data]) => ({
			domain,
			requests: data.requests,
			kb: Math.round(data.bytes / 1024),
		}))
		.sort((a, b) => b.kb - a.kb)
		.slice(0, 10);

	return {
		passResult,
		fullAnalysis: {
			byType,
			failed,
			top10Slowest,
			topThirdParty,
			cacheDetails,
		},
	};
}

function categorizeType(mime: string): string {
	if (mime.includes("javascript") || mime.includes("ecmascript")) return "js";
	if (mime.includes("css")) return "css";
	if (mime.includes("image")) return "image";
	if (mime.includes("font") || mime.includes("woff")) return "font";
	if (mime.includes("html")) return "html";
	if (mime.includes("json")) return "json";
	if (mime.includes("xml")) return "xml";
	if (
		mime.includes("video") ||
		mime.includes("audio") ||
		mime.includes("media")
	)
		return "media";
	return "other";
}

// ── Single-pass Capture ────────────────────────────────────

async function capturePass(
	page: Awaited<
		ReturnType<Awaited<ReturnType<typeof puppeteer.connect>>["newPage"]>
	>,
	url: string,
	waitUntil: "load" | "domcontentloaded" | "networkidle0" | "networkidle2",
	timeout: number,
): Promise<CdpMessage[]> {
	const client = await page.createCDPSession();
	const messages: CdpMessage[] = [];

	try {
		await client.send("Page.enable");
		await client.send("Network.enable");

		for (const event of CDP_OBSERVE) {
			client.on(event, (params: unknown) => {
				if (messages.length < MAX_ENTRIES_PER_PASS) {
					messages.push({ method: event, params });
				}
			});
		}

		await page.goto(url, { waitUntil, timeout });
	} finally {
		try {
			await client.detach();
		} catch {
			// Ignore detach errors
		}
	}

	return messages;
}

// ── Execute Capture ────────────────────────────────────────

async function executeCapture(
	input: CaptureHarInput,
): Promise<CaptureHarOutput> {
	const { url, waitUntil, timeout, passes, proxyCountry, cookies } = input;
	const mode = getBrowserMode();

	if (mode === "none") {
		return {
			url,
			error:
				"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
		};
	}

	const endpoint = resolveBrowserEndpoint(proxyCountry);
	let browser: Awaited<ReturnType<typeof puppeteer.connect>> | undefined;

	try {
		// Connect or launch browser
		if (mode === "remote" && endpoint) {
			browser = await puppeteer.connect({
				browserWSEndpoint: endpoint,
			});
		} else {
			const executablePath = findLocalChromium();
			if (!executablePath) {
				return {
					url,
					error:
						"No local Chromium found. Run: npx playwright install chromium",
				};
			}
			browser = await puppeteer.launch({
				executablePath,
				headless: true,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-gpu",
					"--disable-dev-shm-usage",
				],
			});
		}

		const page = await browser.newPage();
		const baseHost = new URL(url).hostname;

		// Set cookies
		if (cookies) {
			const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
				name,
				value,
				domain: baseHost,
				path: "/",
			}));
			if (cookieEntries.length > 0) {
				await page.setCookie(...cookieEntries);
			}
		}

		const allPassResults: PassResult[] = [];
		let fullAnalysis: FullAnalysis | undefined;

		// Desktop passes
		await page.setViewport(DESKTOP_VIEWPORT);
		for (let i = 0; i < passes; i++) {
			const messages = await capturePass(page, url, waitUntil, timeout);
			const har = harFromMessages(messages, {
				includeResourcesFromDiskCache: true,
			});

			const isFirstPass = i === 0;
			const { passResult, fullAnalysis: analysis } = analyzeHarEntries(
				har.log.entries,
				url,
				"desktop",
				i,
				isFirstPass, // Full analysis on cold desktop pass
			);

			allPassResults.push(passResult);
			if (analysis) fullAnalysis = analysis;
		}

		// Mobile passes — clear cache, set mobile viewport + UA
		await page.setViewport(MOBILE_VIEWPORT);
		await page.setUserAgent(MOBILE_UA);

		// Clear cache for cold mobile pass
		const client = await page.createCDPSession();
		try {
			await client.send("Network.clearBrowserCache");
		} finally {
			try {
				await client.detach();
			} catch {
				// Ignore
			}
		}

		for (let i = 0; i < passes; i++) {
			const messages = await capturePass(page, url, waitUntil, timeout);
			const har = harFromMessages(messages, {
				includeResourcesFromDiskCache: true,
			});

			const { passResult } = analyzeHarEntries(
				har.log.entries,
				url,
				"mobile",
				i,
				false,
			);

			allPassResults.push(passResult);
		}

		await page.close();

		return {
			url,
			passes: allPassResults,
			...fullAnalysis,
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			url,
			error: msg.replace(/token=[^&\s]+/gi, "token=<redacted>"),
		};
	} finally {
		try {
			if (browser) {
				if (mode === "remote") {
					browser.disconnect();
				} else {
					await browser.close();
				}
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}

// ── Tool Definition ────────────────────────────────────────

export const captureHarTool = (_env: Env) =>
	createTool({
		id: "capture_har",
		description:
			"Diagnose a URL with multiple passes in a single browser session. " +
			"Loads the page multiple times (cold + warm cache) on both desktop and mobile. " +
			"Returns per-pass TTFB, request counts, cache analysis, third-party inventory, " +
			"failed requests, and slowest resources. ONE call per URL.",
		inputSchema: captureHarInputSchema,
		outputSchema: captureHarOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			await acquireSession();
			try {
				return await executeCapture(context);
			} finally {
				releaseSession();
			}
		},
	});
