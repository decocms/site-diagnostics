/**
 * Generates a preview OG card to /tmp/og-preview.png for design iteration.
 *
 * Run: bun --env-file=.dev.vars run scripts/preview-og.ts [token]
 * Defaults to the Centauro share token if no arg is passed.
 */

import { writeFileSync } from "node:fs";
import { generateOgCard } from "../api/lib/og-card.ts";
import { loadDiagnostic, loadPublicShare } from "../api/lib/storage.ts";

const token = process.argv[2] ?? "3XQWZ7Inj5i6KDjffnUOY6_BpJ_TpdX4";

const share = await loadPublicShare(token);
if (!share) {
	console.error(`No share found for token ${token}`);
	process.exit(1);
}

const diagnostic = await loadDiagnostic(share.diagnosticId, share.orgId);
if (!diagnostic) {
	console.error(`No diagnostic for ${share.diagnosticId} / ${share.orgId}`);
	process.exit(1);
}

console.log(
	`Rendering: ${diagnostic.url} | score=${diagnostic.healthScore ?? "N/A"}`,
);

const png = await generateOgCard(diagnostic);
const outPath = "/tmp/og-preview.png";
writeFileSync(outPath, png);
console.log(`Wrote ${png.byteLength} bytes to ${outPath}`);
