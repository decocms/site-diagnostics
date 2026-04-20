/**
 * Smoke test: farmrio.com.br
 * Usage: bun run --env-file=.env src/workflows/diagnose/_smoke-farmrio.ts
 */

import { serpLive, keywordsForKeywords } from "../../integrations/dataforseo.ts";
import { lighthouseAudit } from "../../integrations/browserless.ts";
import { researchBusiness } from "../../integrations/perplexity.ts";
import { researchTraffic } from "../../integrations/similarweb.ts";
import { discover } from "./01-discover.ts";
import { selectSamples } from "./02-select-samples.ts";

const TEST_URL = "https://www.farmrio.com.br";

type Result = { ok: boolean; ms: number; detail?: string };
const results: Record<string, Result> = {};

async function time(name: string, fn: () => Promise<string>): Promise<void> {
	const start = Date.now();
	try {
		const detail = await fn();
		results[name] = { ok: true, ms: Date.now() - start, detail };
	} catch (e) {
		results[name] = {
			ok: false,
			ms: Date.now() - start,
			detail: e instanceof Error ? e.message : String(e),
		};
	}
	const r = results[name];
	console.log(`${r.ok ? "PASS" : "FAIL"}  ${name}  (${r.ms}ms)  ${r.detail ?? ""}`);
}

// Run sequentially for readable output
await time("discover", async () => {
	const result = await discover(TEST_URL);
	return `pages=${result.crawl.totalPages} pdps=${result.crawl.pageCounts.pdp} plps=${result.crawl.pageCounts.plp} blog=${result.crawl.pageCounts.blog} sitemap=${result.sitemap.exists} platform=${result.homepage.platform}`;
});

await time("selectSamples", async () => {
	const discovery = await discover(TEST_URL);
	const samples = selectSamples(discovery);
	return `homepage=${samples.homepage}\n       pdps=[${samples.pdps.join(", ")}]\n       plps=[${samples.plps.join(", ")}]\n       editorial=[${samples.editorial.join(", ")}]`;
});

await time("serp", async () => {
	const result = await serpLive("farm rio roupas", 2076, "pt");
	return `${result.results.length} organic results, #1=${result.results[0]?.url ?? "n/a"}`;
});

await time("keywords", async () => {
	const result = await keywordsForKeywords(["farm rio", "vestido farm"], 2076, "pt");
	return `${result.length} keywords, top: ${result[0]?.keyword ?? "n/a"} (vol=${result[0]?.volume ?? 0})`;
});

await time("perplexity", async () => {
	const result = await researchBusiness("Farm Rio", "farmrio.com.br", "fashion e-commerce");
	return `summary=${result.summary.length}chars competitors=[${result.competitors.join(", ")}]`;
});

await time("traffic", async () => {
	const result = await researchTraffic([TEST_URL]);
	const r = result[0];
	if (!r) return "no data";
	return `rank=${r.globalRank} visits=${r.totalVisits} bounce=${r.bounceRate}`;
});

await time("lighthouse", async () => {
	const result = await lighthouseAudit(TEST_URL, { device: "mobile", categories: ["performance"] });
	if (result.error) return `ERROR: ${result.error}`;
	const lcp = result.coreWebVitals.lcp?.numericValue;
	return `perf=${result.scores.performance} lcp=${lcp ? Math.round(lcp) + "ms" : "n/a"} mode=${result.mode}`;
});

// Summary
console.log("\n---");
const passed = Object.values(results).filter((r) => r.ok).length;
console.log(`${passed}/${Object.keys(results).length} passed`);
