/**
 * Per-diagnostic OG card. Runs on both Bun and Cloudflare Workers.
 *
 * Implementation detail: we hand-write the SVG instead of using Satori
 * because Satori bundles yoga-layout (Emscripten WASM) which calls
 * `WebAssembly.instantiate(bytes)` — Cloudflare Workers forbids that
 * ("Wasm code generation disallowed by embedder"). resvg-wasm alone is
 * fine when given a pre-compiled WebAssembly.Module (via wrangler's
 * `[[rules]] CompiledWasm` rule for *.wasm imports), so SVG → PNG works.
 */

import { readFile } from "node:fs/promises";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmAsset from "@resvg/resvg-wasm/index_bg.wasm";
import fontBoldAsset from "../assets/Lato-Bold.ttf";
import fontRegularAsset from "../assets/Lato-Regular.ttf";
import type { Diagnostic } from "../types/diagnostic.ts";

type DataAsset = string | ArrayBuffer | Uint8Array | WebAssembly.Module;

const WIDTH = 1200;
const HEIGHT = 630;

let initPromise: Promise<void> | null = null;
let fontRegular: Uint8Array | null = null;
let fontBold: Uint8Array | null = null;

async function assetToUint8Array(
	asset: DataAsset,
	label: string,
): Promise<Uint8Array> {
	if (asset instanceof Uint8Array) return asset;
	if (asset instanceof ArrayBuffer) return new Uint8Array(asset);
	if (typeof asset === "string") {
		const buf = await readFile(asset);
		return new Uint8Array(buf);
	}
	throw new Error(`[${label}] unsupported asset shape`);
}

function init(): Promise<void> {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		try {
			const [regular, bold] = await Promise.all([
				assetToUint8Array(fontRegularAsset as DataAsset, "font-regular"),
				assetToUint8Array(fontBoldAsset as DataAsset, "font-bold"),
			]);
			const wasmInput =
				resvgWasmAsset instanceof WebAssembly.Module
					? resvgWasmAsset
					: await assetToUint8Array(resvgWasmAsset as DataAsset, "resvg-wasm");
			await initWasm(wasmInput);
			fontRegular = regular;
			fontBold = bold;
		} catch (err) {
			initPromise = null;
			throw err;
		}
	})();
	return initPromise;
}

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function scoreColor(score: number | null): string {
	if (score == null) return "#71717a";
	if (score >= 80) return "#22c55e";
	if (score >= 50) return "#eab308";
	return "#ef4444";
}

function xmlEscape(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function uint8ToBase64(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s);
}

async function fetchFaviconDataUri(domain: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
			{ signal: AbortSignal.timeout(3000) },
		);
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		const ct = res.headers.get("content-type") ?? "image/png";
		return `data:${ct};base64,${uint8ToBase64(new Uint8Array(buf))}`;
	} catch {
		return null;
	}
}

const TITLE_FONT_SIZE = 56;
const TITLE_LINE_HEIGHT = 68;
const TITLE_MAX_CHARS_PER_LINE = 22;
const TITLE_MAX_LINES = 2;

function truncate(text: string, maxLength: number): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

// Greedy word-wrap. Returns up to TITLE_MAX_LINES lines, last one truncated
// with ellipsis if the text exceeds the budget. SVG has no native wrapping —
// we emit each line as its own <tspan>.
function wrapTitle(text: string): string[] {
	const words = text.replace(/\s+/g, " ").trim().split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > TITLE_MAX_CHARS_PER_LINE && current) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);

	if (lines.length > TITLE_MAX_LINES) {
		const out = lines.slice(0, TITLE_MAX_LINES);
		out[TITLE_MAX_LINES - 1] = truncate(
			out[TITLE_MAX_LINES - 1],
			TITLE_MAX_CHARS_PER_LINE,
		);
		return out;
	}
	return lines;
}

// Strip "(domain)" or "(www.domain)" from the title — we show the domain
// separately on the URL line below, so it would otherwise be duplicated.
function cleanTitle(rawTitle: string, domain: string): string {
	const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return rawTitle
		.replace(new RegExp(`\\s*\\((?:www\\.)?${escaped}\\)\\s*`, "gi"), " ")
		.trim();
}

function buildSvg(
	title: string,
	domain: string,
	score: number | null,
	faviconDataUri: string | null,
): string {
	const color = scoreColor(score);
	const scoreDisplay = score != null ? String(score) : "N/A";
	const titleLines = wrapTitle(title);
	const safeDomain = xmlEscape(truncate(domain, 40));
	const favicon = faviconDataUri
		? `<image x="80" y="180" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="${faviconDataUri}"/>`
		: "";

	// Layout: favicon top, title starts 32px below it, URL 40px below
	// the final title line. Title is multi-line via <tspan>.
	const titleFirstBaseline = 360;
	const titleTspans = titleLines
		.map(
			(line, i) =>
				`<tspan x="80" y="${
					titleFirstBaseline + i * TITLE_LINE_HEIGHT
				}">${xmlEscape(line)}</tspan>`,
		)
		.join("");
	const urlY =
		titleFirstBaseline + (titleLines.length - 1) * TITLE_LINE_HEIGHT + 44;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
${favicon}
<text font-family="Lato" font-size="${TITLE_FONT_SIZE}" font-weight="700" fill="#fafafa">${titleTspans}</text>
<text x="80" y="${urlY}" font-family="Lato" font-size="28" font-weight="400" fill="#a1a1aa">${safeDomain}</text>
<text x="1120" y="380" font-family="Lato" font-size="200" font-weight="700" fill="${color}" text-anchor="end">${scoreDisplay}</text>
<text x="1120" y="425" font-family="Lato" font-size="22" font-weight="400" fill="#a1a1aa" letter-spacing="4" text-anchor="end">HEALTH SCORE</text>
</svg>`;
}

export async function generateOgCard(
	diagnostic: Diagnostic,
): Promise<Uint8Array> {
	await init();
	const domain = getDomain(diagnostic.url);
	const title = cleanTitle(diagnostic.title || domain, domain);
	const favicon = await fetchFaviconDataUri(domain);
	const svg = buildSvg(title, domain, diagnostic.healthScore ?? null, favicon);
	const resvg = new Resvg(svg, {
		font: {
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by init()
			fontBuffers: [fontRegular!, fontBold!],
			loadSystemFonts: false,
		},
		fitTo: { mode: "width", value: WIDTH },
		background: "#0a0a0a",
	});
	return resvg.render().asPng();
}
