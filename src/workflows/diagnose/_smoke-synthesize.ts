/**
 * Smoke test for the synthesis pipeline.
 * Run: bun run src/workflows/diagnose/_smoke-synthesize.ts
 */
import { completeJSON } from "../../integrations/anthropic.ts";
import type { DataBundle } from "./11-synthesize.ts";
import { synthesize } from "./11-synthesize.ts";
import { proposeActions } from "./12-actions.ts";

// ── Mock data (minimal but realistic shapes) ─────────────

const mockBundle: DataBundle = {
	discovery: {
		crawl: {
			totalPages: 1247,
			pageCounts: { pdp: 892, plp: 34, blog: 12, institutional: 8, other: 301 },
			sampleUrls: {
				pdp: [
					"https://www.example.com.br/produto/camiseta-basica",
					"https://www.example.com.br/produto/vestido-midi",
					"https://www.example.com.br/produto/tenis-casual",
				],
				plp: [
					"https://www.example.com.br/feminino",
					"https://www.example.com.br/masculino",
				],
				blog: ["https://www.example.com.br/blog/tendencias-verao"],
				institutional: ["https://www.example.com.br/sobre"],
			},
			allUrls: [],
		},
		sitemap: {
			exists: true,
			productSitemapUrls: [
				"https://www.example.com.br/sitemap-products-1.xml",
			],
			totalProductUrls: 892,
		},
		robots: {
			exists: true,
			rules: "User-agent: *\nAllow: /\nSitemap: https://www.example.com.br/sitemap.xml",
			sitemapUrls: ["https://www.example.com.br/sitemap.xml"],
		},
		homepage: {
			status: 200,
			headers: {
				"content-type": "text/html",
				server: "cloudflare",
				"x-powered-by": "VTEX",
			},
			seoMeta: {
				title: "Example Store | Moda Feminina e Masculina",
				description: "Loja online de moda com as melhores marcas.",
			},
			links: [],
			platform: "VTEX IO",
			cdn: "Cloudflare",
		},
		editorial: {
			paths: [
				{ path: "/blog", exists: true, linkCount: 12 },
				{ path: "/editorial", exists: false, linkCount: 0 },
				{ path: "/revista", exists: false, linkCount: 0 },
			],
		},
	},
	samples: {
		homepage: "https://www.example.com.br",
		pdps: [
			"https://www.example.com.br/produto/camiseta-basica",
			"https://www.example.com.br/produto/vestido-midi",
			"https://www.example.com.br/produto/tenis-casual",
		],
		plps: ["https://www.example.com.br/feminino"],
		editorial: ["https://www.example.com.br/blog/tendencias-verao"],
	},
	perf: {
		hars: [
			{
				url: "https://www.example.com.br",
				ttfbMs: 1240,
				totalRequests: 87,
				totalKB: 3420,
				cacheHits: 23,
				cacheMisses: 64,
				thirdPartyInventory: [
					{ domain: "googletagmanager.com", requests: 12, kb: 340 },
					{ domain: "facebook.net", requests: 8, kb: 210 },
				],
			},
		],
		lighthouses: [
			{
				url: "https://www.example.com.br",
				scores: {
					performance: 42,
					accessibility: 78,
					seo: 85,
					bestPractices: 67,
				},
				webVitals: {
					lcp: { score: 0.3, value: 4200, display: "4.2s" },
					cls: { score: 0.8, value: 0.05, display: "0.05" },
					tbt: { score: 0.2, value: 1800, display: "1,800ms" },
					fcp: { score: 0.5, value: 2100, display: "2.1s" },
					si: { score: 0.4, value: 5600, display: "5.6s" },
					tti: { score: 0.3, value: 7200, display: "7.2s" },
				},
				diagnostics: [
					{
						id: "render-blocking-resources",
						title: "Eliminate render-blocking resources",
						score: 0,
						displayValue: "Potential savings of 1,200ms",
						numericValue: 1200,
					},
				],
			},
		],
		screenshots: [
			{
				url: "https://www.example.com.br",
				imageUrl: "https://r2.example.com/screenshots/homepage.png",
				device: "desktop",
			},
		],
	},
	seo: {
		audit: {
			score: 62,
			brokenLinks: 3,
			duplicateMeta: 28,
			missingMetadata: 156,
			structuredDataCoverage: 12,
			issues: [
				{ type: "missing_meta_description", count: 156, severity: "critical" },
				{ type: "duplicate_title", count: 28, severity: "medium" },
			],
		},
		pageMeta: [
			{
				url: "https://www.example.com.br/produto/camiseta-basica",
				title: "Camiseta Básica | Example Store",
				description: "Compre agora na Example Store",
				canonical: "https://www.example.com.br/produto/camiseta-basica",
				jsonLd: [],
			},
			{
				url: "https://www.example.com.br/produto/vestido-midi",
				title: "Vestido Midi | Example Store",
				description: "Compre agora na Example Store",
				canonical: "https://www.example.com.br/produto/vestido-midi",
				jsonLd: [],
			},
		],
		sitemapHealth: {
			productCount: 892,
			indexable: true,
			orphanedEstimate: 45,
		},
		domainSignals: {
			ssl: true,
			sitemap: true,
			robotsTxt: true,
			http2: true,
			cms: "VTEX IO",
		},
	},
	content: {
		pdpScrapes: [
			{
				url: "https://www.example.com.br/produto/camiseta-basica",
				hasReviews: false,
				hasCrossSell: false,
				hasJsonLd: false,
				jsonLdTypes: [],
				descriptionLength: 45,
				imageCount: 4,
				imageAlts: 1,
			},
			{
				url: "https://www.example.com.br/produto/vestido-midi",
				hasReviews: false,
				hasCrossSell: true,
				hasJsonLd: false,
				jsonLdTypes: [],
				descriptionLength: 38,
				imageCount: 6,
				imageAlts: 2,
			},
			{
				url: "https://www.example.com.br/produto/tenis-casual",
				hasReviews: false,
				hasCrossSell: false,
				hasJsonLd: false,
				jsonLdTypes: [],
				descriptionLength: 52,
				imageCount: 5,
				imageAlts: 0,
			},
		],
		editorialScrapes: [
			{
				url: "https://www.example.com.br/blog/tendencias-verao",
				wordCount: 680,
				publishDate: "2025-11-15",
				hasAuthor: false,
				hasSeoMeta: true,
			},
		],
		screenshots: [
			{
				url: "https://www.example.com.br/produto/camiseta-basica",
				imageUrl: "https://r2.example.com/screenshots/pdp.png",
				device: "desktop",
			},
		],
	},
	research: {
		traffic: {
			globalRank: 182450,
			countryRank: 8934,
			totalVisits: 890000,
			bounceRate: 0.52,
			pagesPerVisit: 3.8,
			trafficSources: [
				{ name: "direct", share: 0.35 },
				{ name: "search", share: 0.42 },
				{ name: "social", share: 0.15 },
				{ name: "referral", share: 0.08 },
			],
			topCountries: [{ country: "Brazil", share: 0.94 }],
			topKeywords: [
				{ keyword: "example store", searchVolume: 12000, cpc: 0.45 },
				{ keyword: "moda feminina online", searchVolume: 33000, cpc: 1.2 },
			],
			monthlyVisits: [
				{ month: "2025-09", visits: 820000 },
				{ month: "2025-10", visits: 870000 },
				{ month: "2025-11", visits: 890000 },
			],
		},
		business: {
			summary:
				"Example Store is a mid-market Brazilian fashion e-commerce brand focused on women's and men's apparel, competing with Renner, C&A, and Riachuelo in the online space.",
			competitors: ["Renner", "C&A", "Riachuelo"],
			recentNews: [
				"Expanded to marketplace model in Q3 2025",
				"Launched sustainability collection",
			],
		},
		serp: [
			{
				keyword: "moda feminina online",
				results: [
					{
						position: 1,
						url: "https://www.renner.com.br",
						title: "Moda Feminina | Renner",
					},
					{
						position: 5,
						url: "https://www.example.com.br/feminino",
						title: "Feminino | Example Store",
					},
				],
				relatedSearches: ["vestidos online", "roupas femininas baratas"],
				peopleAlsoAsk: ["Qual a melhor loja online de moda feminina?"],
			},
		],
		keywords: [
			{
				keyword: "moda feminina online",
				volume: 33000,
				difficulty: 72,
				cpc: 1.2,
				competition: "high",
				monthlyTrends: [{ year: 2025, month: 11, volume: 33000 }],
			},
		],
	},
};

// ── Run Tests ────────────────────────────────────────────

async function main() {
	console.log("=== Smoke Test: Phase 3 Synthesis ===\n");

	// Test 1: completeJSON wrapper
	console.log("1. Testing completeJSON wrapper...");
	const start1 = Date.now();
	const result = await completeJSON<{ answer: number }>(
		'Return exactly this JSON: {"answer": 42}. No other text.',
		{ maxTokens: 100 },
	);
	console.log(
		`   ✓ completeJSON returned: ${JSON.stringify(result)} (${Date.now() - start1}ms)`,
	);

	// Test 2: Full synthesis pipeline
	console.log("\n2. Testing full synthesize() with mock data...");
	const start2 = Date.now();
	const report = await synthesize(mockBundle, "pt-BR");
	const elapsed = Date.now() - start2;

	console.log(`   ✓ Synthesis completed in ${(elapsed / 1000).toFixed(1)}s`);
	console.log(`   Health score: ${report.healthScore}/100`);
	console.log(
		`   Score breakdown: ${JSON.stringify(report.scoreBreakdown, null, 2)}`,
	);
	console.log(`   Findings: ${report.findings.length}`);
	console.log(
		`   Report length: ${report.report.length} chars (${report.report.split("\n").length} lines)`,
	);
	console.log(`   Language: ${report.metadata.language}`);
	console.log(`   Platform: ${report.metadata.platform}`);

	// Test 3: Actions from synthesis findings
	console.log("\n3. Testing proposeActions() from synthesis output...");
	const actions = proposeActions(report.findings);
	console.log(`   ✓ ${actions.length} actions proposed:`);
	for (const a of actions) {
		console.log(
			`     [${a.type}] ${a.title} (${a.priority}, automatable: ${a.automatable})`,
		);
	}

	// Print first 50 lines of report
	console.log("\n4. Report preview (first 50 lines):");
	console.log("─".repeat(60));
	console.log(report.report.split("\n").slice(0, 50).join("\n"));
	console.log("─".repeat(60));
	console.log(`   ... (${report.report.split("\n").length - 50} more lines)`);

	console.log("\n=== All smoke tests passed ===");
}

main().catch((err) => {
	console.error("Smoke test failed:", err);
	process.exit(1);
});
