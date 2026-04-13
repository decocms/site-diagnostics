import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionTransport, Page } from "puppeteer-core";

// ── Constants ──────────────────────────────────────────────

const BROWSERLESS_ENDPOINT =
	process.env.BROWSERLESS_ENDPOINT ?? "wss://production-sfo.browserless.io";

export const MOBILE_VIEWPORT = {
	width: 375,
	height: 812,
	isMobile: true,
} as const;
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
export const MOBILE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export const MAX_TIMEOUT_MS = 60_000;

// ── SSRF Protection ────────────────────────────────────────

export function isPrivateHost(hostname: string): boolean {
	// Normalize: strip brackets from IPv6
	const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();

	// IPv6 checks
	if (h === "::1" || h === "::") return true;
	if (h.startsWith("fc") || h.startsWith("fd")) return true;
	if (h.startsWith("fe80")) return true;

	// IPv4-mapped IPv6: ::ffff:x.x.x.x
	const v4Mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (v4Mapped) {
		return isPrivateIPv4(v4Mapped[1]);
	}

	// IPv4 checks
	if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
		return isPrivateIPv4(h);
	}

	// Hostnames
	if (h === "localhost" || h.endsWith(".localhost")) return true;

	return false;
}

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
	const [a, b, c, d] = parts;

	// 0.0.0.0
	if (a === 0 && b === 0 && c === 0 && d === 0) return true;
	// 10.x.x.x
	if (a === 10) return true;
	// 172.16-31.x.x
	if (a === 172 && b >= 16 && b <= 31) return true;
	// 192.168.x.x
	if (a === 192 && b === 168) return true;
	// 127.x.x.x
	if (a === 127) return true;
	// 169.254.x.x (link-local + cloud metadata)
	if (a === 169 && b === 254) return true;

	return false;
}

// ── Browser Mode Detection ─────────────────────────────────

const PLAYWRIGHT_CACHE_DIRS = [
	join(process.env.HOME || "~", ".cache", "ms-playwright"),
	join(process.env.HOME || "~", "Library", "Caches", "ms-playwright"),
];

export function findLocalChromium(): string | null {
	for (const cacheDir of PLAYWRIGHT_CACHE_DIRS) {
		if (!existsSync(cacheDir)) continue;

		// macOS
		const macPaths = [
			join(
				cacheDir,
				"chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
			),
			join(cacheDir, "chromium_headless_shell-*/chrome-mac/headless_shell"),
		];

		// Linux
		const linuxPaths = [
			join(cacheDir, "chromium-*/chrome-linux/chrome"),
			join(cacheDir, "chromium_headless_shell-*/chrome-linux/headless_shell"),
		];

		for (const pattern of [...macPaths, ...linuxPaths]) {
			// Use glob to find matching paths
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
				// Glob may fail, continue
			}
		}
	}

	// Check common system Chromium locations
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

export function getBrowserMode(): "remote" | "local" | "none" {
	if (process.env.BROWSERLESS_TOKEN) return "remote";
	if (findLocalChromium()) return "local";
	return "none";
}

export function getBrowserlessToken(): string {
	const token = process.env.BROWSERLESS_TOKEN;
	if (!token)
		throw new Error("BROWSERLESS_TOKEN environment variable is required");
	return token;
}

export function getHttpBaseUrl(): string {
	return BROWSERLESS_ENDPOINT.replace(/^wss:/, "https:").replace(
		/^ws:/,
		"http:",
	);
}

export function resolveBrowserEndpoint(proxyCountry?: string): string | null {
	const mode = getBrowserMode();
	if (mode === "none") return null;
	if (mode === "local") return null; // signal to use local chromium

	const token = getBrowserlessToken();
	let url = `${BROWSERLESS_ENDPOINT}?token=${token}`;
	if (proxyCountry) {
		url += `&--proxy-country=${proxyCountry}`;
	}
	return url;
}

function redactToken(msg: string): string {
	return msg.replace(/token=[^&\s]+/gi, "token=<redacted>");
}

/**
 * WebSocket transport using the native WebSocket API.
 * Needed for Cloudflare Workers where the `ws` npm package doesn't work.
 */
export function createNativeWebSocketTransport(
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

/** Returns true when running inside Cloudflare Workers (no fs, no `ws` npm). */
export function isWorkersRuntime(): boolean {
	return typeof globalThis.caches !== "undefined" && typeof Bun === "undefined";
}

// ── Session Lifecycle ──────────────────────────────────────

export async function withBrowserPage<T>(
	endpoint: string | null | undefined,
	device: "desktop" | "mobile",
	fn: (page: Page) => Promise<T>,
	options?: { cookies?: Record<string, string>; domain?: string },
): Promise<T> {
	const mode = getBrowserMode();
	const puppeteer = (await import("puppeteer-core")).default;
	let browser: Awaited<ReturnType<typeof puppeteer.connect>> | undefined;

	try {
		if (mode === "remote" && endpoint) {
			if (isWorkersRuntime()) {
				const transport = await createNativeWebSocketTransport(endpoint);
				browser = await puppeteer.connect({ transport });
			} else {
				browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
			}
		} else if (mode === "local") {
			const executablePath = findLocalChromium();
			if (!executablePath) {
				throw new Error(
					"No local Chromium found. Run: npx playwright install chromium",
				);
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
		} else {
			throw new Error(
				"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
			);
		}

		const page = await browser.newPage();

		// Set viewport
		const viewport = device === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
		await page.setViewport(viewport);

		// Set mobile user agent
		if (device === "mobile") {
			await page.setUserAgent(MOBILE_UA);
		}

		// Set cookies if provided
		if (options?.cookies && options.domain) {
			const cookieEntries = Object.entries(options.cookies).map(
				([name, value]) => ({
					name,
					value,
					domain: options.domain ?? "",
					path: "/",
				}),
			);
			if (cookieEntries.length > 0) {
				await page.setCookie(...cookieEntries);
			}
		}

		return await fn(page);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(redactToken(msg));
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
