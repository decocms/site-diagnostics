// ─────────────────────────────────────────────────────────────────────────────
// BUILD-TIME ONLY. Do NOT import this from the worker. Satori bundles
// yoga-layout (Emscripten WASM) which calls `WebAssembly.instantiate(bytes)`,
// and Cloudflare Workers forbids runtime WASM compilation ("Wasm code
// generation disallowed by embedder"). Use Bun to render the default card
// once via scripts/generate-default-og.ts; the worker serves the resulting
// PNG as a bundled static asset (api/assets/og-default.png).
// ─────────────────────────────────────────────────────────────────────────────

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmAsset from "@resvg/resvg-wasm/index_bg.wasm";
import satori from "satori";
import fontBoldAsset from "../assets/Lato-Bold.ttf";
import fontRegularAsset from "../assets/Lato-Regular.ttf";
import type { Diagnostic } from "../types/diagnostic.ts";

type DataAsset = string | ArrayBuffer | Uint8Array;

const WIDTH = 1200;
const HEIGHT = 630;

let initPromise: Promise<void> | null = null;
let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;

async function readLocalAsset(path: string): Promise<ArrayBuffer> {
	const { readFile } = await import("node:fs/promises");
	const bytes = await readFile(path);
	return new Uint8Array(bytes).buffer;
}

async function assetToArrayBuffer(
	asset: DataAsset,
	label: string,
): Promise<ArrayBuffer> {
	if (asset instanceof ArrayBuffer) return asset;
	if (asset instanceof Uint8Array) {
		return new Uint8Array(asset).buffer;
	}

	if (
		asset.startsWith("/") ||
		asset.startsWith("./") ||
		asset.startsWith("../")
	) {
		return readLocalAsset(asset);
	}

	const response = await fetch(asset);
	if (!response.ok) {
		throw new Error(`[${label}] HTTP ${response.status} from ${asset}`);
	}
	return response.arrayBuffer();
}

function init(): Promise<void> {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		try {
			const [regular, bold] = await Promise.all([
				assetToArrayBuffer(fontRegularAsset, "font-regular"),
				assetToArrayBuffer(fontBoldAsset, "font-bold"),
			]);

			await initWasm(
				resvgWasmAsset instanceof WebAssembly.Module
					? resvgWasmAsset
					: await assetToArrayBuffer(resvgWasmAsset as DataAsset, "resvg-wasm"),
			);

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
	if (score == null) return "#06b6d4";
	if (score >= 80) return "#22c55e";
	if (score >= 50) return "#eab308";
	return "#ef4444";
}

function scoreLabel(score: number | null): string {
	if (score == null) return "N/A";
	if (score >= 80) return "Strong";
	if (score >= 50) return "Needs work";
	return "Critical";
}

function truncate(text: string, maxLength: number): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function displayTitle(diagnostic: Diagnostic, domain: string): string {
	return truncate(diagnostic.title || domain, 58);
}

function displaySummary(diagnostic: Diagnostic, domain: string): string {
	const fallback = `Performance and SEO diagnostic for ${domain}.`;
	return truncate(diagnostic.summary || fallback, 132);
}

function OgCard({ diagnostic }: { diagnostic: Diagnostic }) {
	const domain = getDomain(diagnostic.url);
	const score = diagnostic.healthScore ?? null;
	const accent = scoreColor(score);
	const status = scoreLabel(score);
	const title = displayTitle(diagnostic, domain);
	const summary = displaySummary(diagnostic, domain);

	return (
		<div
			style={{
				display: "flex",
				width: WIDTH,
				height: HEIGHT,
				padding: 52,
				background: "#08080a",
				color: "#fafafa",
				fontFamily: "Lato",
				position: "relative",
			}}
		>
			<div
				style={{
					display: "flex",
					position: "absolute",
					inset: 0,
					background:
						"linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(250, 250, 250, 0) 35%, rgba(39, 39, 42, 0.32))",
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: 52,
					top: 52,
					width: 1096,
					height: 526,
					borderRadius: 30,
					background: "#18181b",
					border: "1px solid #2f2f34",
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: 53,
					top: 53,
					width: 1094,
					height: 132,
					borderRadius: "29px 29px 0 0",
					background:
						"linear-gradient(180deg, rgba(39, 39, 42, 0.88), rgba(24, 24, 27, 0))",
				}}
			/>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					position: "relative",
					padding: "42px 46px",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
						width: "100%",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							alignItems: "center",
							gap: 14,
						}}
					>
						<div
							style={{
								display: "flex",
								width: 34,
								height: 34,
								borderRadius: 10,
								background: accent,
								boxShadow: `0 0 36px ${accent}66`,
							}}
						/>
						<div
							style={{
								display: "flex",
								fontSize: 22,
								fontWeight: 700,
								width: 230,
							}}
						>
							Site Diagnostics
						</div>
					</div>
					<div
						style={{
							display: "flex",
							padding: "9px 14px",
							borderRadius: 999,
							background: "#09090b",
							border: "1px solid #303036",
							color: "#a1a1aa",
							fontSize: 16,
							fontWeight: 700,
							width: 136,
							justifyContent: "center",
						}}
					>
						Public report
					</div>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "row",
						gap: 42,
						flex: 1,
						alignItems: "center",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							width: 650,
						}}
					>
						<div
							style={{
								display: "flex",
								color: "#06b6d4",
								fontSize: 28,
								fontWeight: 700,
								marginBottom: 20,
							}}
						>
							{domain}
						</div>
						<div
							style={{
								display: "flex",
								fontSize: 68,
								fontWeight: 700,
								lineHeight: 1.02,
								width: 650,
							}}
						>
							{title}
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 28,
								color: "#a1a1aa",
								fontSize: 24,
								lineHeight: 1.45,
								width: 650,
							}}
						>
							{summary}
						</div>
					</div>

					<div
						style={{
							display: "flex",
							flexDirection: "column",
							width: 300,
							height: 300,
							borderRadius: 28,
							background: "#09090b",
							border: "1px solid #303036",
							alignItems: "center",
							justifyContent: "center",
							boxShadow: `0 22px 70px ${accent}22`,
						}}
					>
						<div
							style={{
								display: "flex",
								fontSize: score == null ? 74 : 110,
								fontWeight: 700,
								color: accent,
								lineHeight: 0.9,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{score ?? "N/A"}
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 18,
								fontSize: 20,
								fontWeight: 700,
								color: "#fafafa",
							}}
						>
							{status}
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 8,
								fontSize: 15,
								color: "#71717a",
								textTransform: "uppercase",
								width: 160,
								justifyContent: "center",
							}}
						>
							health score
						</div>
					</div>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
						paddingTop: 28,
						borderTop: "1px solid #303036",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 12,
						}}
					>
						{["Performance", "SEO", "Content"].map((label) => (
							<div
								key={label}
								style={{
									display: "flex",
									padding: "9px 13px",
									borderRadius: 999,
									background: "#27272a",
									color: "#d4d4d8",
									fontSize: 16,
									fontWeight: 700,
									width: label === "Performance" ? 118 : 80,
									justifyContent: "center",
								}}
							>
								{label}
							</div>
						))}
					</div>
					<div
						style={{
							display: "flex",
							color: "#71717a",
							fontSize: 17,
							fontWeight: 700,
							width: 270,
							justifyContent: "flex-end",
						}}
					>
						site-diagnostics.decocms.com
					</div>
				</div>
			</div>
		</div>
	);
}

export async function generateOgImage(
	diagnostic: Diagnostic,
): Promise<Uint8Array> {
	await init();

	const svg = await satori(<OgCard diagnostic={diagnostic} />, {
		width: WIDTH,
		height: HEIGHT,
		fonts: [
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by init()
			{ name: "Lato", data: fontRegular!, weight: 400, style: "normal" },
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by init()
			{ name: "Lato", data: fontBold!, weight: 700, style: "normal" },
		],
	});

	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: WIDTH },
		background: "#08080a",
	});
	const rendered = resvg.render();
	return rendered.asPng();
}
