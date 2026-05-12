import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";
import type { Diagnostic } from "../types/diagnostic.ts";

// ── Singletons initialised once per process ──────────────────────────────────
// Fetched from CDN once and held in memory. Works in both Bun (local dev) and
// Cloudflare Workers (production) — no filesystem required.

const RESVG_WASM_URL =
	"https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const INTER_REGULAR_URL =
	"https://github.com/rsms/inter/raw/v4.0/extras/ttf/Inter-Regular.ttf";
const INTER_BOLD_URL =
	"https://github.com/rsms/inter/raw/v4.0/extras/ttf/Inter-Bold.ttf";

let initPromise: Promise<void> | null = null;
let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;

async function fetchBytes(url: string): Promise<ArrayBuffer> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: ${res.status}`);
	}
	return res.arrayBuffer();
}

function init(): Promise<void> {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		const [wasm, reg, bold] = await Promise.all([
			fetchBytes(RESVG_WASM_URL),
			fetchBytes(INTER_REGULAR_URL),
			fetchBytes(INTER_BOLD_URL),
		]);
		await initWasm(wasm);
		fontRegular = reg;
		fontBold = bold;
	})();
	return initPromise;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
	if (score >= 80) return "#22c55e"; // green-500
	if (score >= 50) return "#eab308"; // yellow-500
	return "#ef4444"; // red-500
}

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

async function fetchFaviconDataUrl(domain: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
			{ signal: AbortSignal.timeout(3000) },
		);
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		const b64 = Buffer.from(buf).toString("base64");
		const ct = res.headers.get("content-type") ?? "image/png";
		return `data:${ct};base64,${b64}`;
	} catch {
		return null;
	}
}

// ── Card layout (1200 × 630) ─────────────────────────────────────────────────
// Satori rules: every div needs display:flex; no conditional children (use
// ternary returning a zero-size placeholder instead of && short-circuit).

function OgCard({
	title,
	domain,
	score,
	summary,
	favicon,
}: {
	title: string;
	domain: string;
	score: number | null;
	summary: string | null;
	favicon: string | null;
}) {
	const color = score != null ? scoreColor(score) : "#71717a";
	const label = title || domain;
	const blurb =
		summary && summary.length > 130 ? `${summary.slice(0, 127)}…` : summary;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: 1200,
				height: 630,
				background: "#09090b",
				padding: 60,
				fontFamily: "Inter",
			}}
		>
			{/* ── Main row ── */}
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "center",
					flex: 1,
					gap: 40,
				}}
			>
				{/* Favicon — always render, hide when null */}
				<div
					style={{
						display: "flex",
						width: 80,
						height: 80,
						flexShrink: 0,
						opacity: favicon ? 1 : 0,
					}}
				>
					{favicon ? (
						<img
							src={favicon}
							alt=""
							width={80}
							height={80}
							style={{ borderRadius: 16 }}
						/>
					) : (
						<div style={{ display: "flex", width: 80, height: 80 }} />
					)}
				</div>

				{/* Site name + domain */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						gap: 10,
					}}
				>
					<div
						style={{
							display: "flex",
							fontSize: 48,
							fontWeight: 700,
							color: "#fafafa",
							lineHeight: 1.15,
						}}
					>
						{label}
					</div>
					<div
						style={{
							display: "flex",
							fontSize: 26,
							color: "#71717a",
						}}
					>
						{domain}
					</div>
				</div>

				{/* Score — always render, hide when null */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						flexShrink: 0,
						opacity: score != null ? 1 : 0,
					}}
				>
					<div
						style={{
							display: "flex",
							fontSize: 96,
							fontWeight: 700,
							color,
							lineHeight: 1,
						}}
					>
						{score ?? ""}
					</div>
					<div
						style={{
							display: "flex",
							fontSize: 16,
							color: "#52525b",
							textTransform: "uppercase",
							letterSpacing: "0.1em",
							marginTop: 4,
						}}
					>
						/ 100
					</div>
				</div>
			</div>

			{/* ── Summary (always rendered, empty when null) ── */}
			<div
				style={{
					display: "flex",
					fontSize: 22,
					color: "#a1a1aa",
					lineHeight: 1.6,
					marginTop: 28,
					opacity: blurb ? 1 : 0,
				}}
			>
				{blurb ?? ""}
			</div>

			{/* ── Footer ── */}
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					marginTop: 32,
					paddingTop: 24,
					borderTop: "1px solid #27272a",
				}}
			>
				<div
					style={{
						display: "flex",
						fontSize: 18,
						color: "#52525b",
						fontWeight: 600,
					}}
				>
					Site Diagnostics
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 16,
						color: "#3f3f46",
					}}
				>
					site-diagnostics.decocms.com
				</div>
			</div>
		</div>
	);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateOgImage(
	diagnostic: Diagnostic,
): Promise<Uint8Array> {
	await init();

	const domain = getDomain(diagnostic.url);
	const [favicon] = await Promise.all([fetchFaviconDataUrl(domain)]);

	const svg = await satori(
		<OgCard
			title={diagnostic.title}
			domain={domain}
			score={diagnostic.healthScore ?? null}
			summary={diagnostic.summary ?? null}
			favicon={favicon}
		/>,
		{
			width: 1200,
			height: 630,
			fonts: [
				// biome-ignore lint/style/noNonNullAssertion: guaranteed by init()
				{ name: "Inter", data: fontRegular!, weight: 400, style: "normal" },
				// biome-ignore lint/style/noNonNullAssertion: guaranteed by init()
				{ name: "Inter", data: fontBold!, weight: 700, style: "normal" },
			],
		},
	);

	const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
	const rendered = resvg.render();
	return rendered.asPng();
}
