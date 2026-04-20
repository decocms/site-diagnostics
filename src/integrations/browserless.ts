import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Browser, ConnectionTransport, Page } from "puppeteer-core";

// ── Constants ──────────────────────────────────────────────

const BROWSERLESS_ENDPOINT =
	process.env.BROWSERLESS_ENDPOINT ?? "wss://production-sfo.browserless.io";

const MOBILE_VIEWPORT = { width: 375, height: 812, isMobile: true } as const;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const MOBILE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const MAX_CONCURRENT = 2;
const QUEUE_TIMEOUT_MS = 90_000;

// ── Concurrency Limiter ────────────────────────────────────

let activeSessions = 0;
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> =
	[];

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

// ── Browser Mode Detection ─────────────────────────────────

const PLAYWRIGHT_CACHE_DIRS = [
	join(process.env.HOME || "~", ".cache", "ms-playwright"),
	join(process.env.HOME || "~", "Library", "Caches", "ms-playwright"),
];

function findLocalChromium(): string | null {
	for (const cacheDir of PLAYWRIGHT_CACHE_DIRS) {
		if (!existsSync(cacheDir)) continue;
		const macPaths = [
			join(
				cacheDir,
				"chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
			),
			join(cacheDir, "chromium_headless_shell-*/chrome-mac/headless_shell"),
		];
		const linuxPaths = [
			join(cacheDir, "chromium-*/chrome-linux/chrome"),
			join(cacheDir, "chromium_headless_shell-*/chrome-linux/headless_shell"),
		];
		for (const pattern of [...macPaths, ...linuxPaths]) {
			const base = pattern.split("*")[0];
			if (
				!existsSync(base.replace(/\/$/, "").split("/").slice(0, -1).join("/"))
			)
				continue;
			try {
				if (typeof Bun !== "undefined") {
					const glob = new Bun.Glob(pattern);
					for (const match of glob.scanSync({ absolute: true })) {
						if (existsSync(match)) return match;
					}
				}
			} catch {
				// Glob may fail
			}
		}
	}
	const systemPaths = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
	];
	for (const p of systemPaths) {
		if (existsSync(p)) return p;
	}
	return null;
}

function getBrowserMode(): "remote" | "local" | "none" {
	if (process.env.BROWSERLESS_TOKEN) return "remote";
	if (findLocalChromium()) return "local";
	return "none";
}

function getBrowserlessToken(): string {
	const token = process.env.BROWSERLESS_TOKEN;
	if (!token)
		throw new Error("BROWSERLESS_TOKEN environment variable is required");
	return token;
}

function resolveBrowserEndpoint(proxyCountry?: string): string | null {
	const mode = getBrowserMode();
	if (mode !== "remote") return null;
	const token = getBrowserlessToken();
	let url = `${BROWSERLESS_ENDPOINT}?token=${token}`;
	if (proxyCountry) url += `&--proxy-country=${proxyCountry}`;
	return url;
}

function createNativeWebSocketTransport(
	url: string,
): Promise<ConnectionTransport> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		ws.addEventListener("open", () => {
			const transport: ConnectionTransport = {
				send: (message: string) => ws.send(message),
				close: () => ws.close(),
			};
			ws.addEventListener("message", (event) => {
				const data =
					typeof event.data === "string" ? event.data : String(event.data);
				transport.onmessage?.(data);
			});
			ws.addEventListener("close", () => transport.onclose?.());
			ws.addEventListener("error", () => transport.onclose?.());
			resolve(transport);
		});
		ws.addEventListener("error", (e) =>
			reject(new Error(`WebSocket connection failed: ${e}`)),
		);
	});
}

function isWorkersRuntime(): boolean {
	return typeof globalThis.caches !== "undefined" && typeof Bun === "undefined";
}

function redactToken(msg: string): string {
	return msg.replace(/token=[^&\s]+/gi, "token=<redacted>");
}

// ── Browser Connection ─────────────────────────────────────

async function connectBrowser(endpoint: string | null): Promise<{
	browser: Browser;
	mode: "remote" | "local";
}> {
	const puppeteer = (await import("puppeteer-core")).default;
	const mode = getBrowserMode();

	if (mode === "remote" && endpoint) {
		let browser: Browser;
		if (isWorkersRuntime()) {
			const transport = await createNativeWebSocketTransport(endpoint);
			browser = await puppeteer.connect({ transport });
		} else {
			browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
		}
		return { browser, mode: "remote" };
	}

	if (mode === "local") {
		const executablePath = findLocalChromium();
		if (!executablePath) {
			throw new Error(
				"No local Chromium found. Run: npx playwright install chromium",
			);
		}
		const browser = await puppeteer.launch({
			executablePath,
			headless: true,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-gpu",
				"--disable-dev-shm-usage",
			],
		});
		return { browser, mode: "local" };
	}

	throw new Error(
		"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
	);
}

async function disconnectBrowser(
	browser: Browser,
	mode: "remote" | "local",
): Promise<void> {
	try {
		if (mode === "remote") browser.disconnect();
		else await browser.close();
	} catch {
		// Ignore cleanup errors
	}
}

// ── HAR Capture ────────────────────────────────────────────

export interface CaptureHarOptions {
	waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
	timeout?: number;
	passes?: number;
	proxyCountry?: string;
	cookies?: Record<string, string>;
}

export interface HarPassResult {
	device: "desktop" | "mobile";
	pass: number;
	label: string;
	ttfbMs: number | null;
	totalRequests: number;
	totalKB: number;
	cache: { hits: number; misses: number };
	failedCount: number;
}

export interface HarFullAnalysis {
	byType: Record<string, { count: number; bytes: number }>;
	failed: Array<{ path: string; status: number }>;
	top10Slowest: Array<{ path: string; ms: number; status: number; kb: number }>;
	topThirdParty: Array<{ domain: string; requests: number; kb: number }>;
	cacheDetails: Array<{
		path: string;
		cacheControl: string;
		xCache: string;
		age: string;
	}>;
}

export interface CaptureHarResult {
	url: string;
	passes?: HarPassResult[];
	byType?: Record<string, { count: number; bytes: number }>;
	failed?: Array<{ path: string; status: number }>;
	top10Slowest?: Array<{
		path: string;
		ms: number;
		status: number;
		kb: number;
	}>;
	topThirdParty?: Array<{ domain: string; requests: number; kb: number }>;
	cacheDetails?: Array<{
		path: string;
		cacheControl: string;
		xCache: string;
		age: string;
	}>;
	error?: string;
}

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

// biome-ignore lint/suspicious/noExplicitAny: HAR entry shape from chrome-har
function analyzeHarEntries(
	entries: any[],
	baseUrl: string,
	device: "desktop" | "mobile",
	passNum: number,
	includeFullAnalysis: boolean,
): { passResult: HarPassResult; fullAnalysis?: HarFullAnalysis } {
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

	const baseHost = new URL(baseUrl).hostname;
	const docEntry = entries.find((e: { request: { url: string } }) => {
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
		if (entry.response.status >= 400 || entry.response.status === 0)
			failedCount++;
		if (isCacheHit(entry.response.headers)) cacheHits++;
		else cacheMisses++;
	}

	const passResult: HarPassResult = {
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
			/* Invalid URL */
		}

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
					/* skip */
				}
			}
		}
	}

	const top10Slowest = entries
		.filter((e: { time: number }) => e.time > 0)
		.sort((a: { time: number }, b: { time: number }) => b.time - a.time)
		.slice(0, 10)
		.map(
			(e: {
				request: { url: string };
				time: number;
				response: { status: number; content: { size: number } };
			}) => {
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
			},
		);

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
		fullAnalysis: { byType, failed, top10Slowest, topThirdParty, cacheDetails },
	};
}

async function capturePass(
	page: Page,
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
				if (messages.length < MAX_ENTRIES_PER_PASS)
					messages.push({ method: event, params });
			});
		}
		await page.goto(url, { waitUntil, timeout });
	} finally {
		try {
			await client.detach();
		} catch {
			/* Ignore */
		}
	}
	return messages;
}

export async function captureHar(
	url: string,
	options: CaptureHarOptions = {},
): Promise<CaptureHarResult> {
	const {
		waitUntil = "networkidle2",
		timeout = 30_000,
		passes = 2,
		proxyCountry,
		cookies,
	} = options;
	const mode = getBrowserMode();

	if (mode === "none") {
		return {
			url,
			error:
				"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
		};
	}

	await acquireSession();
	try {
		const endpoint = resolveBrowserEndpoint(proxyCountry);
		const { harFromMessages } = await import("chrome-har");
		const { browser, mode: browserMode } = await connectBrowser(endpoint);

		try {
			const page = await browser.newPage();
			const baseHost = new URL(url).hostname;

			if (cookies) {
				const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
					name,
					value,
					domain: baseHost,
					path: "/",
				}));
				if (cookieEntries.length > 0) await page.setCookie(...cookieEntries);
			}

			const allPassResults: HarPassResult[] = [];
			let fullAnalysis: HarFullAnalysis | undefined;

			// Desktop passes
			await page.setViewport(DESKTOP_VIEWPORT);
			for (let i = 0; i < passes; i++) {
				const messages = await capturePass(page, url, waitUntil, timeout);
				const har = harFromMessages(messages, {
					includeResourcesFromDiskCache: true,
				});
				const { passResult, fullAnalysis: analysis } = analyzeHarEntries(
					har.log.entries,
					url,
					"desktop",
					i,
					i === 0,
				);
				allPassResults.push(passResult);
				if (analysis) fullAnalysis = analysis;
			}

			// Mobile passes
			await page.setViewport(MOBILE_VIEWPORT);
			await page.setUserAgent(MOBILE_UA);
			const client = await page.createCDPSession();
			try {
				await client.send("Network.clearBrowserCache");
			} finally {
				try {
					await client.detach();
				} catch {
					/* Ignore */
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
			return { url, passes: allPassResults, ...fullAnalysis };
		} finally {
			await disconnectBrowser(browser, browserMode);
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { url, error: redactToken(msg) };
	} finally {
		releaseSession();
	}
}

// ── Lighthouse Audit ───────────────────────────────────────

export interface LighthouseOptions {
	categories?: string[];
	device?: "desktop" | "mobile";
}

export interface AuditResult {
	id: string;
	title: string;
	score: number | null;
	displayValue: string | null;
	numericValue: number | null;
}

export interface LighthouseResult {
	url: string;
	device: "desktop" | "mobile";
	scores: Record<string, number | null>;
	coreWebVitals: {
		lcp: AuditResult | null;
		cls: AuditResult | null;
		tbt: AuditResult | null;
		fcp: AuditResult | null;
		si: AuditResult | null;
		tti: AuditResult | null;
	};
	diagnostics: AuditResult[];
	mode: "browserless" | "local";
	error?: string;
}

const CORE_WEB_VITAL_IDS = {
	lcp: "largest-contentful-paint",
	cls: "cumulative-layout-shift",
	tbt: "total-blocking-time",
	fcp: "first-contentful-paint",
	si: "speed-index",
	tti: "interactive",
} as const;

const DIAGNOSTIC_AUDIT_IDS = [
	"render-blocking-resources",
	"unused-javascript",
	"unused-css-rules",
	"modern-image-formats",
	"uses-optimized-images",
	"uses-text-compression",
	"uses-responsive-images",
	"efficient-animated-content",
	"dom-size",
	"critical-request-chains",
	"redirects",
	"uses-long-cache-ttl",
	"total-byte-weight",
	"mainthread-work-breakdown",
	"bootup-time",
	"font-display",
	"third-party-summary",
] as const;

// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
function extractAudit(
	audits: Record<string, any>,
	id: string,
): AuditResult | null {
	const audit = audits[id];
	if (!audit) return null;
	return {
		id,
		title: audit.title ?? id,
		score: audit.score ?? null,
		displayValue: audit.displayValue ?? null,
		numericValue: audit.numericValue ?? null,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
function processLighthouseResult(
	result: Record<string, any>,
	device: "desktop" | "mobile",
	mode: "browserless" | "local",
): LighthouseResult {
	const categories = result.categories ?? {};
	const audits = result.audits ?? {};

	const scores: Record<string, number | null> = {};
	for (const [key, cat] of Object.entries(categories)) {
		// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
		scores[key] = (cat as any).score ?? null;
	}

	const coreWebVitals = {
		lcp: extractAudit(audits, CORE_WEB_VITAL_IDS.lcp),
		cls: extractAudit(audits, CORE_WEB_VITAL_IDS.cls),
		tbt: extractAudit(audits, CORE_WEB_VITAL_IDS.tbt),
		fcp: extractAudit(audits, CORE_WEB_VITAL_IDS.fcp),
		si: extractAudit(audits, CORE_WEB_VITAL_IDS.si),
		tti: extractAudit(audits, CORE_WEB_VITAL_IDS.tti),
	};

	const diagnostics: AuditResult[] = [];
	for (const id of DIAGNOSTIC_AUDIT_IDS) {
		const audit = extractAudit(audits, id);
		if (audit) diagnostics.push(audit);
	}

	return {
		url: result.requestedUrl ?? result.finalUrl ?? "",
		device,
		scores,
		coreWebVitals,
		diagnostics,
		mode,
	};
}

function getLighthouseEndpoint(): string {
	return (process.env.LIGHTHOUSE_BROWSERLESS_ENDPOINT ?? BROWSERLESS_ENDPOINT)
		.replace(/^wss:/, "https:")
		.replace(/^ws:/, "http:");
}

function getLighthouseToken(): string {
	const token =
		process.env.LIGHTHOUSE_BROWSERLESS_TOKEN ?? process.env.BROWSERLESS_TOKEN;
	if (!token)
		throw new Error(
			"BROWSERLESS_TOKEN or LIGHTHOUSE_BROWSERLESS_TOKEN is required",
		);
	return token;
}

function getLighthouseMode(): "browserless" | "local" | "none" {
	const override = process.env.LIGHTHOUSE_BROWSER_MODE;
	if (override === "remote" || override === "browserless") return "browserless";
	if (override === "local") return findLocalChromium() ? "local" : "none";
	const mode = getBrowserMode();
	if (mode === "remote") return "browserless";
	if (mode === "local") return "local";
	return "none";
}

async function runRemoteLighthouse(
	url: string,
	categories: string[],
	device: "desktop" | "mobile",
): Promise<Record<string, unknown>> {
	const token = getLighthouseToken();
	const baseUrl = getLighthouseEndpoint();
	const isDesktop = device === "desktop";

	const settings: Record<string, unknown> = {
		onlyCategories: categories,
		formFactor: device,
		...(isDesktop
			? {
					screenEmulation: {
						mobile: false,
						width: 1350,
						height: 940,
						deviceScaleFactor: 1,
					},
					throttling: {
						rttMs: 40,
						throughputKbps: 10240,
						cpuSlowdownMultiplier: 1,
					},
				}
			: {
					screenEmulation: {
						mobile: true,
						width: 412,
						height: 823,
						deviceScaleFactor: 1.75,
					},
				}),
	};

	const response = await fetch(`${baseUrl}/performance?token=${token}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url,
			config: { extends: "lighthouse:default", settings },
		}),
		signal: AbortSignal.timeout(120_000),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Browserless Lighthouse failed (${response.status}): ${body.slice(0, 500)}`,
		);
	}

	const json = await response.json();
	return json.data ?? json;
}

async function runLocalLighthouse(
	url: string,
	categories: string[],
	device: "desktop" | "mobile",
): Promise<Record<string, unknown>> {
	if (typeof Bun === "undefined")
		throw new Error("Local Lighthouse requires Bun runtime");

	const proc = Bun.spawn(["which", "lighthouse"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const lighthouseBin = (await new Response(proc.stdout).text()).trim();
	await proc.exited;
	if (!lighthouseBin)
		throw new Error(
			"Lighthouse CLI not found. Install with: npm install -g lighthouse",
		);

	const chromePath = findLocalChromium();
	if (!chromePath)
		throw new Error(
			"No local Chromium found. Run: npx playwright install chromium",
		);

	const categoryFlags = categories.map((c) => `--only-categories=${c}`);
	const isDesktop = device === "desktop";
	const args = [
		lighthouseBin,
		url,
		"--output=json",
		"--output-path=stdout",
		"--quiet",
		"--chrome-flags=--headless --no-sandbox --disable-gpu",
		`--chrome-path=${chromePath}`,
		...categoryFlags,
		...(isDesktop ? ["--preset=desktop", "--screenEmulation.disabled"] : []),
	];

	const lhProc = Bun.spawn(args, {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CHROME_PATH: chromePath },
	});
	const killTimer = setTimeout(() => lhProc.kill(), 120_000);
	const output = await new Response(lhProc.stdout).text();
	const exitCode = await lhProc.exited;
	clearTimeout(killTimer);

	if (exitCode !== 0) {
		const stderr = await new Response(lhProc.stderr).text();
		throw new Error(
			`Lighthouse exited with code ${exitCode}: ${stderr.slice(0, 500)}`,
		);
	}

	return JSON.parse(output);
}

export async function lighthouseAudit(
	url: string,
	options: LighthouseOptions = {},
): Promise<LighthouseResult> {
	const {
		categories = ["performance", "accessibility", "seo", "best-practices"],
		device = "mobile",
	} = options;
	const mode = getLighthouseMode();

	if (mode === "none") {
		return {
			url,
			device,
			scores: {},
			coreWebVitals: {
				lcp: null,
				cls: null,
				tbt: null,
				fcp: null,
				si: null,
				tti: null,
			},
			diagnostics: [],
			mode: "local",
			error: "No browser available for Lighthouse",
		};
	}

	try {
		const result =
			mode === "browserless"
				? await runRemoteLighthouse(url, categories, device)
				: await runLocalLighthouse(url, categories, device);
		return processLighthouseResult(result, device, mode);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			url,
			device,
			scores: {},
			coreWebVitals: {
				lcp: null,
				cls: null,
				tbt: null,
				fcp: null,
				si: null,
				tti: null,
			},
			diagnostics: [],
			mode,
			error: redactToken(msg),
		};
	}
}

// ── Screenshot ─────────────────────────────────────────────

export interface ScreenshotOptions {
	fullPage?: boolean;
	device?: "desktop" | "mobile";
	waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
	timeout?: number;
	cookies?: Record<string, string>;
}

export interface ScreenshotResult {
	url: string;
	device: "desktop" | "mobile";
	sizeKB?: number;
	imageUrl?: string;
	blocked?: boolean;
	blockedBy?: string;
	error?: string;
}

const WAF_PATTERNS: [RegExp, string][] = [
	[/access denied/i, "Akamai"],
	[/attention required.*cloudflare/i, "Cloudflare"],
	[/checking your browser/i, "Cloudflare"],
	[/just a moment\.\.\./i, "Cloudflare"],
	[/403 forbidden/i, "WAF"],
	[/you have been blocked/i, "WAF"],
	[/blocked.*web application firewall/i, "WAF"],
	[/pardon our interruption/i, "Incapsula"],
	[/please verify you are a human/i, "Bot Protection"],
	[/security check/i, "Bot Protection"],
];

/**
 * Capture a screenshot. Requires an `uploadFn` to persist the PNG buffer.
 * Returns the public URL from the upload function.
 */
export async function screenshot(
	url: string,
	uploadFn: (buf: Buffer, filename: string) => Promise<string>,
	options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
	const {
		fullPage = false,
		device = "desktop",
		waitUntil = "networkidle2",
		timeout = 30_000,
		cookies,
	} = options;

	try {
		const endpoint = resolveBrowserEndpoint();
		const { browser, mode: browserMode } = await connectBrowser(endpoint);

		try {
			const page = await browser.newPage();
			const viewport = device === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
			await page.setViewport(viewport);
			if (device === "mobile") await page.setUserAgent(MOBILE_UA);

			const parsedUrl = new URL(url);
			if (cookies) {
				const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
					name,
					value,
					domain: parsedUrl.hostname,
					path: "/",
				}));
				if (cookieEntries.length > 0) await page.setCookie(...cookieEntries);
			}

			await page.goto(url, { waitUntil, timeout });

			// WAF detection
			const wafProvider: string | null = await page.evaluate(
				(...patterns: string[][]) => {
					const title = document.title.toLowerCase();
					const body =
						document.body?.innerText?.slice(0, 2000).toLowerCase() ?? "";
					const text = `${title} ${body}`;
					for (const [reStr, provider] of patterns) {
						if (new RegExp(reStr, "i").test(text)) return provider;
					}
					return null;
				},
				...WAF_PATTERNS.map(([re, label]) => [re.source, label]),
			);

			if (wafProvider) {
				await page.close();
				return {
					url,
					device,
					blocked: true,
					blockedBy: wafProvider,
					error: `Page blocked by ${wafProvider}`,
				};
			}

			const buf = Buffer.from(await page.screenshot({ type: "png", fullPage }));
			await page.close();

			if (buf.length > 5 * 1024 * 1024) {
				return {
					url,
					device,
					error: `Screenshot too large: ${Math.round(buf.length / 1024)}KB`,
				};
			}

			const slug = parsedUrl.hostname.replace(/[^a-zA-Z0-9._-]/g, "-");
			const filename = `${slug}-${device}-${randomUUID().slice(0, 8)}.png`;
			const imageUrl = await uploadFn(buf, filename);

			return { url, device, sizeKB: Math.round(buf.length / 1024), imageUrl };
		} finally {
			await disconnectBrowser(browser, browserMode);
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { url, device, error: redactToken(msg) };
	}
}
