import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	onPagePages,
	onPageTaskPost,
	pollOnPageTask,
} from "../lib/dataforseo.ts";
import { urlInput } from "../lib/schemas.ts";
import type { Env } from "../types/env.ts";

// ── Schemas ────────────────────────────────────────────────

export const auditSeoInputSchema = z.object({
	url: urlInput.describe("The site URL to audit (domain will be extracted)"),
	maxPages: z
		.number()
		.max(1000)
		.default(100)
		.describe("Maximum pages to crawl"),
});

export type AuditSeoInput = z.infer<typeof auditSeoInputSchema>;

export const auditSeoOutputSchema = z.object({
	url: z.string(),
	crawlStatus: z.string(),
	totalPagesCrawled: z.number(),
	onpageScore: z.number(),
	domainInfo: z.object({
		cms: z.string().nullable().optional(),
		ssl: z.boolean(),
		sitemap: z.boolean(),
		robotsTxt: z.boolean(),
		http2: z.boolean(),
	}),
	issues: z.array(
		z.object({
			type: z.string(),
			count: z.number(),
			severity: z.enum(["critical", "medium", "low"]),
		}),
	),
	contentStats: z.object({
		avgWordCount: z.number(),
		pagesWithStructuredData: z.number(),
		pagesWithMetaDescription: z.number(),
		pagesWithoutMetaDescription: z.number(),
		pagesWithoutH1: z.number(),
		totalInternalLinks: z.number(),
		totalBlogPosts: z.number(),
	}),
	onPageSignals: z.array(
		z.object({
			label: z.string(),
			value: z.string(),
			status: z.enum(["pass", "warn", "fail"]),
		}),
	),
	error: z.string().optional(),
});

export type AuditSeoOutput = z.infer<typeof auditSeoOutputSchema>;

// ── Tool Definition ────────────────────────────────────────

export const auditSeoTool = (_env: Env) =>
	createTool({
		id: "audit_seo",
		description:
			"Deep SEO audit using DataForSEO's on-page crawler. Crawls up to 1000 pages and returns: " +
			"SEO score, broken links, duplicate titles/descriptions, missing meta tags, missing H1, " +
			"pages without JSON-LD, content word counts, domain info (CMS, SSL, sitemap, HTTP/2). " +
			"Use for: quantifying SEO issues at scale across the ENTIRE site (not just sample pages). " +
			"Takes 1-3 minutes to complete (polls until crawl finishes).",
		inputSchema: auditSeoInputSchema,
		outputSchema: auditSeoOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, maxPages } = context;

			try {
				// Strip protocol and www for DataForSEO target
				const target = url
					.replace(/^https?:\/\//, "")
					.replace(/^www\./, "")
					.replace(/\/$/, "");

				// Submit crawl task
				const taskId = await onPageTaskPost(target, maxPages);

				// Poll until complete (max 3 minutes)
				const summary = await pollOnPageTask(taskId, 180_000);

				// Fetch per-page data
				const pages = await onPagePages(taskId, 100);

				// Aggregate issues
				const pm = summary.pageMetrics;
				const issues: AuditSeoOutput["issues"] = [];

				if (pm.brokenLinks > 0)
					issues.push({
						type: "Broken links",
						count: pm.brokenLinks,
						severity: "critical",
					});
				if (pm.duplicateTitle > 0)
					issues.push({
						type: "Duplicate title tags",
						count: pm.duplicateTitle,
						severity: "medium",
					});
				if (pm.duplicateDescription > 0)
					issues.push({
						type: "Duplicate meta descriptions",
						count: pm.duplicateDescription,
						severity: "medium",
					});
				if (pm.duplicateContent > 0)
					issues.push({
						type: "Duplicate content pages",
						count: pm.duplicateContent,
						severity: "medium",
					});
				if (pm.nonIndexable > 0)
					issues.push({
						type: "Non-indexable pages",
						count: pm.nonIndexable,
						severity: "medium",
					});
				if (pm.brokenResources > 0)
					issues.push({
						type: "Broken resources (images, scripts)",
						count: pm.brokenResources,
						severity: "low",
					});

				// Page-level aggregations
				const pagesWithNoH1 = pages.filter((p) => p.checks.no_h1_tag).length;
				if (pagesWithNoH1 > 0)
					issues.push({
						type: "Pages missing H1 tag",
						count: pagesWithNoH1,
						severity: "medium",
					});

				const pagesWithoutMeta = pages.filter(
					(p) => !p.meta.description,
				).length;
				if (pagesWithoutMeta > 0)
					issues.push({
						type: "Pages missing meta description",
						count: pagesWithoutMeta,
						severity: "medium",
					});

				// Content stats
				const htmlPages = pages.filter(
					(p) => p.statusCode >= 200 && p.statusCode < 400,
				);
				const totalWordCount = htmlPages.reduce(
					(sum, p) => sum + p.content.plainTextWordCount,
					0,
				);
				const avgWordCount =
					htmlPages.length > 0
						? Math.round(totalWordCount / htmlPages.length)
						: 0;
				const pagesWithStructuredData = pages.filter(
					(p) => p.checks.has_microdata || p.checks.has_json_ld,
				).length;
				const pagesWithMetaDescription = pages.filter(
					(p) => p.meta.description,
				).length;
				const blogPages = pages.filter((p) => p.url.includes("/blog"));

				// On-page signals
				const onPageSignals: AuditSeoOutput["onPageSignals"] = [
					{
						label: "SSL / HTTPS",
						value: summary.domainInfo.ssl ? "Enabled" : "Not enabled",
						status: summary.domainInfo.ssl ? "pass" : "fail",
					},
					{
						label: "XML Sitemap",
						value: summary.domainInfo.sitemap ? "Found" : "Not found",
						status: summary.domainInfo.sitemap ? "pass" : "fail",
					},
					{
						label: "Robots.txt",
						value: summary.domainInfo.robotsTxt ? "Found" : "Not found",
						status: summary.domainInfo.robotsTxt ? "pass" : "fail",
					},
					{
						label: "HTTP/2",
						value: summary.domainInfo.http2 ? "Supported" : "Not supported",
						status: summary.domainInfo.http2 ? "pass" : "warn",
					},
					{
						label: "Structured Data",
						value:
							pagesWithStructuredData > 0
								? `Found on ${pagesWithStructuredData}/${pages.length} pages`
								: "No structured data found",
						status: pagesWithStructuredData > 0 ? "pass" : "fail",
					},
					{
						label: "Average Word Count",
						value: `${avgWordCount} words/page`,
						status:
							avgWordCount >= 1000
								? "pass"
								: avgWordCount >= 500
									? "warn"
									: "fail",
					},
				];

				return {
					url,
					crawlStatus: summary.crawlProgress,
					totalPagesCrawled: summary.domainInfo.totalPages,
					onpageScore: pm.onpageScore,
					domainInfo: {
						cms: summary.domainInfo.cms,
						ssl: summary.domainInfo.ssl,
						sitemap: summary.domainInfo.sitemap,
						robotsTxt: summary.domainInfo.robotsTxt,
						http2: summary.domainInfo.http2,
					},
					issues,
					contentStats: {
						avgWordCount,
						pagesWithStructuredData,
						pagesWithMetaDescription,
						pagesWithoutMetaDescription: pagesWithoutMeta,
						pagesWithoutH1: pagesWithNoH1,
						totalInternalLinks: pm.linksInternal,
						totalBlogPosts: blogPages.length,
					},
					onPageSignals,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					url,
					crawlStatus: "error",
					totalPagesCrawled: 0,
					onpageScore: 0,
					domainInfo: {
						ssl: false,
						sitemap: false,
						robotsTxt: false,
						http2: false,
					},
					issues: [],
					contentStats: {
						avgWordCount: 0,
						pagesWithStructuredData: 0,
						pagesWithMetaDescription: 0,
						pagesWithoutMetaDescription: 0,
						pagesWithoutH1: 0,
						totalInternalLinks: 0,
						totalBlogPosts: 0,
					},
					onPageSignals: [],
					error: msg,
				};
			}
		},
	});
