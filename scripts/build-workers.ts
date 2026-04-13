/**
 * Pre-build step for Cloudflare Workers.
 *
 * 1. Builds the web client (vite).
 * 2. Patches @aws-sdk/xml-builder to remove its "browser" field so that
 *    wrangler's esbuild uses the Node.js XML parser (fast-xml-parser)
 *    instead of the browser variant that relies on DOMParser.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Step 1 — build web
execSync("bun run build:web", { stdio: "inherit" });

// Step 2 — patch AWS SDK browser field
const pkgPath = join("node_modules", "@aws-sdk", "xml-builder", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
if (pkg.browser) {
	delete pkg.browser;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t"));
}
