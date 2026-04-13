/**
 * Pre-build step for Cloudflare Workers.
 *
 * 1. Builds the web client (vite).
 * 2. Patches dependencies that use Node-only APIs unsupported in Workers:
 *    - @aws-sdk/xml-builder: remove "browser" field so esbuild picks the
 *      Node.js XML parser (fast-xml-parser) instead of DOMParser.
 *    - chrome-har: replace createRequire(import.meta.url) with a hardcoded
 *      version string (import.meta.url is undefined in Workers).
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Step 1 — build web
execSync("bun run build:web", { stdio: "inherit" });

// Step 2 — patch AWS SDK: remove browser field
const awsPkgPath = join(
	"node_modules",
	"@aws-sdk",
	"xml-builder",
	"package.json",
);
const awsPkg = JSON.parse(readFileSync(awsPkgPath, "utf-8"));
if (awsPkg.browser) {
	delete awsPkg.browser;
	writeFileSync(awsPkgPath, JSON.stringify(awsPkg, null, "\t"));
}

// Step 3 — patch chrome-har: replace createRequire(import.meta.url) usage
const chromeHarPath = join("node_modules", "chrome-har", "index.js");
let chromeHarSrc = readFileSync(chromeHarPath, "utf-8");
const chromeHarPkgPath = join("node_modules", "chrome-har", "package.json");
const chromeHarVersion = JSON.parse(
	readFileSync(chromeHarPkgPath, "utf-8"),
).version;

if (chromeHarSrc.includes("createRequire(import.meta.url)")) {
	// Remove the createRequire import and usage, replace with hardcoded version
	chromeHarSrc = chromeHarSrc
		.replace(
			"import { createRequire } from 'node:module';",
			"// patched: createRequire removed for CF Workers",
		)
		.replace(
			"const require = createRequire(import.meta.url);\nconst version = require('./package.json').version;",
			`const version = '${chromeHarVersion}';`,
		);
	writeFileSync(chromeHarPath, chromeHarSrc);
}
