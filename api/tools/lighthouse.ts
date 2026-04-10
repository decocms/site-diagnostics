import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	findLocalChromium,
	getBrowserlessToken,
	getBrowserMode,
	getHttpBaseUrl,
} from "../lib/browserless.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

const auditResultSchema = z.object({
	id: z.string(),
	title: z.string(),
	score: z.number().nullable(),
	displayValue: z.string().nullable(),
	numericValue: z.number().nullable(),
});

export const lighthouseInputSchema = z.object({
	url: urlInput.describe("The URL to audit"),
	categories: z
		.array(
			z.enum(["performance", "accessibility", "seo", "best-practices", "pwa"]),
		)
		.default(["performance", "accessibility", "seo", "best-practices"]),
	device: z.enum(["desktop", "mobile"]).default("mobile"),
});

export type LighthouseInput = z.infer<typeof lighthouseInputSchema>;

export const lighthouseOutputSchema = z.object({
	url: z.string(),
	device: z.enum(["desktop", "mobile"]),
	scores: z.record(z.string(), z.number().nullable()),
	coreWebVitals: z.object({
		lcp: auditResultSchema.nullable(),
		cls: auditResultSchema.nullable(),
		tbt: auditResultSchema.nullable(),
		fcp: auditResultSchema.nullable(),
		si: auditResultSchema.nullable(),
		tti: auditResultSchema.nullable(),
	}),
	diagnostics: z.array(auditResultSchema),
	lighthouseVersion: z.string().nullable(),
	mode: z.enum(["browserless", "local"]),
	error: z.string().optional(),
});

export type LighthouseOutput = z.infer<typeof lighthouseOutputSchema>;

// ── Constants ──────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────

function extractAudit(
	// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
	audits: Record<string, any>,
	id: string,
): z.infer<typeof auditResultSchema> | null {
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

function processLighthouseResult(
	// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
	result: Record<string, any>,
	device: "desktop" | "mobile",
	mode: "browserless" | "local",
): LighthouseOutput {
	const categories = result.categories ?? {};
	const audits = result.audits ?? {};

	// Category scores
	const scores: Record<string, number | null> = {};
	for (const [key, cat] of Object.entries(categories)) {
		// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
		scores[key] = (cat as any).score ?? null;
	}

	// Core Web Vitals
	const coreWebVitals = {
		lcp: extractAudit(audits, CORE_WEB_VITAL_IDS.lcp),
		cls: extractAudit(audits, CORE_WEB_VITAL_IDS.cls),
		tbt: extractAudit(audits, CORE_WEB_VITAL_IDS.tbt),
		fcp: extractAudit(audits, CORE_WEB_VITAL_IDS.fcp),
		si: extractAudit(audits, CORE_WEB_VITAL_IDS.si),
		tti: extractAudit(audits, CORE_WEB_VITAL_IDS.tti),
	};

	// Diagnostics
	const diagnostics: z.infer<typeof auditResultSchema>[] = [];
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
		lighthouseVersion: result.lighthouseVersion ?? null,
		mode,
	};
}

function errorResult(
	url: string,
	device: "desktop" | "mobile",
	mode: "browserless" | "local",
	error: string,
): LighthouseOutput {
	return {
		url,
		device,
		scores: {} as Record<string, number | null>,
		coreWebVitals: {
			lcp: null,
			cls: null,
			tbt: null,
			fcp: null,
			si: null,
			tti: null,
		},
		diagnostics: [],
		lighthouseVersion: null,
		mode,
		error,
	};
}

// ── Remote Mode (Browserless) ──────────────────────────────

async function runRemoteLighthouse(
	url: string,
	categories: string[],
	device: "desktop" | "mobile",
	// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
): Promise<Record<string, any>> {
	const token = getBrowserlessToken();
	const baseUrl = getHttpBaseUrl();

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
			config: {
				extends: "lighthouse:default",
				settings,
			},
		}),
		signal: AbortSignal.timeout(120_000),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Browserless Lighthouse failed (${response.status}): ${body.slice(0, 500)}`,
		);
	}

	return response.json();
}

// ── Local Mode (CLI) ───────────────────────────────────────

async function runLocalLighthouse(
	url: string,
	categories: string[],
	device: "desktop" | "mobile",
	// biome-ignore lint/suspicious/noExplicitAny: Lighthouse JSON is untyped
): Promise<Record<string, any>> {
	if (typeof Bun === "undefined") {
		throw new Error("Local Lighthouse requires Bun runtime");
	}

	// Find lighthouse binary
	const proc = Bun.spawn(["which", "lighthouse"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const lighthouseBin = (await new Response(proc.stdout).text()).trim();
	await proc.exited;

	if (!lighthouseBin) {
		throw new Error(
			"Lighthouse CLI not found. Install with: npm install -g lighthouse",
		);
	}

	// Find local Chromium
	const chromePath = findLocalChromium();
	if (!chromePath) {
		throw new Error(
			"No local Chromium found. Run: npx playwright install chromium",
		);
	}

	const categoryFlags = categories.map((c) => `--only-categories=${c}`);
	const isDesktop = device === "desktop";

	const args = [
		lighthouseBin,
		"--",
		url,
		"--output=json",
		"--quiet",
		`--chrome-flags=--headless --no-sandbox --disable-gpu`,
		`--chrome-path=${chromePath}`,
		...categoryFlags,
		...(isDesktop ? ["--preset=desktop", "--screenEmulation.disabled"] : []),
	];

	const lhProc = Bun.spawn(args, {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CHROME_PATH: chromePath },
	});

	const timeout = setTimeout(() => {
		lhProc.kill();
	}, 120_000);

	const output = await new Response(lhProc.stdout).text();
	const exitCode = await lhProc.exited;
	clearTimeout(timeout);

	if (exitCode !== 0) {
		const stderr = await new Response(lhProc.stderr).text();
		throw new Error(
			`Lighthouse exited with code ${exitCode}: ${stderr.slice(0, 500)}`,
		);
	}

	return JSON.parse(output);
}

// ── Tool Definition ────────────────────────────────────────

export const lighthouseTool = (_env: Env) =>
	createTool({
		id: "lighthouse_audit",
		description:
			"Run a Lighthouse audit on a URL. Returns Core Web Vitals, " +
			"performance/accessibility/SEO scores, and diagnostic audits. " +
			"Use for performance analysis and identifying optimization opportunities.",
		inputSchema: lighthouseInputSchema,
		outputSchema: lighthouseOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, categories, device } = context;

			try {
				const mode = getBrowserMode();

				if (mode === "none") {
					return errorResult(
						url,
						device,
						"local",
						"No browser available. Set BROWSERLESS_TOKEN or run: npx playwright install chromium",
					);
				}

				let result: Record<string, unknown>;
				let usedMode: "browserless" | "local";

				if (mode === "remote") {
					result = await runRemoteLighthouse(url, categories, device);
					usedMode = "browserless";
				} else {
					result = await runLocalLighthouse(url, categories, device);
					usedMode = "local";
				}

				return processLighthouseResult(result, device, usedMode);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				const usedMode: "browserless" | "local" =
					getBrowserMode() === "remote" ? "browserless" : "local";
				return errorResult(
					url,
					device,
					usedMode,
					msg.replace(/token=[^&\s]+/gi, "token=<redacted>"),
				);
			}
		},
	});
