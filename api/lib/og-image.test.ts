import { describe, expect, test } from "bun:test";
import { generateOgImage } from "./og-image.tsx";

describe("generateOgImage", () => {
	test("returns a valid 1200x630 PNG without external assets", async () => {
		const png = await generateOgImage({
			id: "diag_123",
			url: "https://www.example.com/products/shoes",
			title: "Example Store",
			summary: "Performance and SEO report for Example Store.",
			healthScore: 82,
			report: "# Report",
			status: "complete",
			createdAt: "2026-05-12T00:00:00.000Z",
		});

		expect(Array.from(png.subarray(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		expect(png[16]).toBe(0x00);
		expect(png[17]).toBe(0x00);
		expect(png[18]).toBe(0x04);
		expect(png[19]).toBe(0xb0);
		expect(png[20]).toBe(0x00);
		expect(png[21]).toBe(0x00);
		expect(png[22]).toBe(0x02);
		expect(png[23]).toBe(0x76);
		expect(png.length).toBeGreaterThan(30_000);
	});
});
