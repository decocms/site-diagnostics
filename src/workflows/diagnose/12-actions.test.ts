import { describe, expect, test } from "bun:test";
import type { Finding } from "./11-synthesize.ts";
import { proposeActions } from "./12-actions.ts";

describe("proposeActions", () => {
	const mockFindings: Finding[] = [
		{
			id: "missing-json-ld",
			title: "Product JSON-LD not detected on PDPs",
			severity: "high",
			pagesAffected: 2358,
			evidence: "Of 3 PDPs sampled, none contained Product JSON-LD.",
		},
		{
			id: "high-ttfb",
			title: "TTFB exceeds 2s on homepage",
			severity: "high",
			pagesAffected: "site-wide",
			evidence: "Homepage TTFB measured at 2,340ms across 4 passes.",
		},
		{
			id: "no-reviews-detected",
			title: "No review section on sampled PDPs",
			severity: "medium",
			pagesAffected: 2358,
			evidence: "Of 5 PDPs sampled, none contained a review widget.",
		},
		{
			id: "missing-meta-description",
			title: "Generic meta descriptions on PLPs",
			severity: "medium",
			pagesAffected: 45,
			evidence: "2 of 2 sampled PLPs had identical template descriptions.",
		},
		{
			id: "sitemap-missing-products",
			title: "Product sitemap incomplete",
			severity: "low",
			pagesAffected: "site-wide",
			evidence: "Sitemap lists 1,200 products but crawl found 2,358 PDPs.",
		},
		{
			id: "cross-sell-absent",
			title: "No cross-sell recommendations on PDPs",
			severity: "medium",
			pagesAffected: 2358,
			evidence: "Of 5 PDPs sampled, none showed related product blocks.",
		},
	];

	test("classifies JSON-LD finding as automatable PR", () => {
		const actions = proposeActions(mockFindings);
		const jsonLd = actions.find((a) => a.findingId === "missing-json-ld");
		expect(jsonLd).toBeDefined();
		expect(jsonLd!.type).toBe("pr");
		expect(jsonLd!.automatable).toBe(true);
		expect(jsonLd!.priority).toBe("high");
	});

	test("classifies TTFB finding as alert", () => {
		const actions = proposeActions(mockFindings);
		const ttfb = actions.find((a) => a.findingId === "high-ttfb");
		expect(ttfb).toBeDefined();
		expect(ttfb!.type).toBe("alert");
		expect(ttfb!.automatable).toBe(false);
	});

	test("classifies review finding as manual", () => {
		const actions = proposeActions(mockFindings);
		const reviews = actions.find((a) => a.findingId === "no-reviews-detected");
		expect(reviews).toBeDefined();
		expect(reviews!.type).toBe("manual");
		expect(reviews!.automatable).toBe(false);
	});

	test("classifies meta-description as automatable PR", () => {
		const actions = proposeActions(mockFindings);
		const meta = actions.find(
			(a) => a.findingId === "missing-meta-description",
		);
		expect(meta).toBeDefined();
		expect(meta!.type).toBe("pr");
		expect(meta!.automatable).toBe(true);
	});

	test("classifies sitemap finding as automatable issue", () => {
		const actions = proposeActions(mockFindings);
		const sitemap = actions.find(
			(a) => a.findingId === "sitemap-missing-products",
		);
		expect(sitemap).toBeDefined();
		expect(sitemap!.type).toBe("issue");
		expect(sitemap!.automatable).toBe(true);
	});

	test("classifies cross-sell as issue", () => {
		const actions = proposeActions(mockFindings);
		const crossSell = actions.find((a) => a.findingId === "cross-sell-absent");
		expect(crossSell).toBeDefined();
		expect(crossSell!.type).toBe("issue");
		expect(crossSell!.automatable).toBe(false);
	});

	test("returns one action per finding", () => {
		const actions = proposeActions(mockFindings);
		expect(actions.length).toBe(mockFindings.length);
	});

	test("preserves severity as priority", () => {
		const actions = proposeActions(mockFindings);
		for (const action of actions) {
			const finding = mockFindings.find((f) => f.id === action.findingId);
			expect(action.priority).toBe(finding!.severity);
		}
	});
});
