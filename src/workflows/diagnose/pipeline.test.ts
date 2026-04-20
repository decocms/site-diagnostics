import { describe, expect, test } from "bun:test";
import { selectSamples } from "./02-select-samples.ts";
import type { DiscoveryResult } from "./types.ts";

const mockDiscovery: DiscoveryResult = {
	crawl: {
		totalPages: 150,
		pageCounts: { pdp: 80, plp: 20, blog: 10, institutional: 5, other: 35 },
		sampleUrls: {
			pdp: [
				"https://example.com/product/shoes-1/p",
				"https://example.com/product/shoes-2/p",
				"https://example.com/product/shirt-1/p",
			],
			plp: ["https://example.com/shoes", "https://example.com/shirts"],
			blog: ["https://example.com/blog/post-1"],
			institutional: ["https://example.com/about"],
		},
		allUrls: [
			"https://example.com/",
			"https://example.com/shoes",
			"https://example.com/product/shoes-1/p",
		],
	},
	sitemap: { exists: true, productSitemapUrls: [], totalProductUrls: 500 },
	robots: { exists: true, rules: "User-agent: *\nAllow: /", sitemapUrls: [] },
	homepage: {
		status: 200,
		headers: {},
		seoMeta: { title: "Example Store - Buy Online" },
		links: [],
		platform: "deco.cx",
		cdn: "cloudflare",
	},
	editorial: {
		paths: [
			{ path: "/blog", exists: true, linkCount: 10 },
			{ path: "/editorial", exists: false, linkCount: 0 },
		],
	},
};

describe("selectSamples", () => {
	test("returns homepage from discovery URL origin", () => {
		const samples = selectSamples(mockDiscovery);
		expect(samples.homepage).toBeDefined();
		expect(samples.homepage).toContain("example.com");
	});

	test("returns up to 3 PDPs", () => {
		const samples = selectSamples(mockDiscovery);
		expect(samples.pdps.length).toBeLessThanOrEqual(3);
		expect(samples.pdps.length).toBeGreaterThan(0);
	});

	test("returns up to 2 PLPs", () => {
		const samples = selectSamples(mockDiscovery);
		expect(samples.plps.length).toBeLessThanOrEqual(2);
		expect(samples.plps.length).toBeGreaterThan(0);
	});

	test("returns editorial if discovered", () => {
		const samples = selectSamples(mockDiscovery);
		expect(samples.editorial.length).toBeGreaterThan(0);
	});

	test("returns empty editorial when none exist", () => {
		const noEditorial = {
			...mockDiscovery,
			editorial: { paths: [{ path: "/blog", exists: false, linkCount: 0 }] },
			crawl: {
				...mockDiscovery.crawl,
				sampleUrls: { ...mockDiscovery.crawl.sampleUrls, blog: [] },
			},
		};
		const samples = selectSamples(noEditorial);
		expect(samples.editorial).toEqual([]);
	});

	test("is deterministic (same input → same output)", () => {
		const a = selectSamples(mockDiscovery);
		const b = selectSamples(mockDiscovery);
		expect(a).toEqual(b);
	});
});
