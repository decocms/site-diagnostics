/**
 * One-shot script — generates the default OG image bundled with the worker.
 *
 * Why pre-generate at build time instead of generating per-diagnostic on the
 * worker? Satori bundles yoga-layout (Emscripten WASM) which calls
 * `WebAssembly.instantiate(bytes)` — Cloudflare Workers forbids runtime WASM
 * compilation from bytes ("Wasm code generation disallowed by embedder"), so
 * Satori cannot run there. Bun has no such restriction, so we render here.
 *
 * Run: bun run scripts/generate-default-og.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateOgImage } from "../api/lib/og-image.tsx";

const png = await generateOgImage({
	id: "default",
	url: "https://site-diagnostics.decocms.com",
	title: "Site Diagnostics",
	summary:
		"Blackbox performance & SEO diagnostics for storefronts and high-traffic websites.",
	report: "",
	status: "complete",
	createdAt: new Date().toISOString(),
});

const outPath = join(import.meta.dir, "..", "api", "assets", "og-default.png");
writeFileSync(outPath, png);
console.log(`Wrote ${png.byteLength} bytes to ${outPath}`);
