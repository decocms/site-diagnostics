/**
 * Batch Diagnostics Pipeline
 *
 * Reads a list of domains from a CSV, runs the site diagnostics agent for each,
 * then creates branded slide decks from the diagnostic reports.
 *
 * Usage:
 *   bun scripts/batch-diagnostics.ts domains.csv
 *   bun scripts/batch-diagnostics.ts domains.csv --diagnostics-only
 *
 * CSV format (one column, no header):
 *   https://www.example.com
 *   https://www.another.com
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY     — Anthropic API key
 *   SLIDE_MAKER_TOKEN     — Bearer token for slide-maker MCP
 *
 * Optional env vars:
 *   CONCURRENCY           — Max parallel diagnostics (default: 5)
 *   OUTPUT_DIR            — Directory for results (default: ./batch-output)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import type { JSONSchema7 } from "@ai-sdk/provider";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	generateText,
	jsonSchema,
	stepCountIs,
	streamText,
	type ToolSet,
	tool,
} from "ai";

// ── Config ────────────────────────────────────────────────────

const DIAGNOSTICS_ONLY = process.argv.includes("--diagnostics-only");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

const SLIDE_MAKER_TOKEN = process.env.SLIDE_MAKER_TOKEN;
if (!SLIDE_MAKER_TOKEN && !DIAGNOSTICS_ONLY)
	throw new Error("SLIDE_MAKER_TOKEN is required (or use --diagnostics-only)");

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "./batch-output";

const SITE_DIAGNOSTICS_MCP = "https://site-diagnostics.decocms.com/api/mcp";
const SLIDE_MAKER_MCP = "https://slide-maker.decocms.com/api/mcp";

// ── Prompts (replace with your actual prompts) ────────────────

const DIAGNOSTICS_PROMPT = `<identity>
You are a senior digital strategy consultant producing diagnostic reports for storefronts
and high-traffic websites. You test from the outside (blackbox — no CDN/server access)
and produce reports that combine technical depth with business storytelling.

Your reports have two purposes:
1. Give the brand a clear, honest picture of their site's health and its effect on
   business outcomes — revenue, organic traffic, conversion, brand perception.
2. Quantify the scale of execution required to close the gaps, making it evident that
   this volume of work demands automation and continuous delivery.

You are a strategist who uses data to tell a story. Every finding connects to a business
outcome. Every claim traces to a data source. When data is missing, say so.
</identity>

<voice>
TONE: Senior consultant presenting to a VP of Digital or CMO.
- Direct, precise, professional. No filler ("It's worth noting..."), no unexplained
  jargon, no superlatives.
- Confident but measured. "The data shows" and "we found" — let numbers speak.
- Strong findings stated plainly. Sampled or inferred findings flagged explicitly.
- No emojis. No exclamation marks in prose.

FRAMING: Always frame as opportunity, never as failure.
- Describe current state neutrally → describe the upside positively.
- Banned patterns (use the alternative instead):
  "zero X" / "0 X found" → "X not detected" / "no X identified in our analysis"
  "completamente ausente" → "not included" / "not detected"
  "nenhum ... algum" → "not detected in the sample"
  "gap sistêmico" / "falha crítica" → "structural opportunity"
  "penaliza diretamente" → "limits" / "reduces"
  "massive" / "devastating" / "critical failure" → "significant" / "material" / "measurable"
- When something is genuinely bad, the data speaks for itself. An 11MB homepage needs
  no adjectives — the number IS the story.

CONCISION:
- Each finding stated ONCE in its own section. Not restated elsewhere.
- The headline is a highlight reel (2-3 sentences). The Summary table is the recap.
  "What This Requires" and "Strategic Context" reference TOTALS only — never re-list
  individual findings by name.
- If the section header states the finding, the body opens with evidence, not a restatement.
- Calibrate depth to significance:
  HIGH impact (structured data, meta descriptions, reviews): 2-3 paragraphs.
  MEDIUM impact (editorial sitemaps, cache, cross-sell): 1-2 paragraphs.
  LOW impact (HSTS, robots.txt, encoding): 1 paragraph max. Group these together.
</voice>

<report-language>
Write in the language matching the site's market:
- .br → Brazilian Portuguese (pt-BR).
- Everything else → English.
Applies to all prose, headers, tables, pitch, strategic context.
Technical terms (JSON-LD, TTFB, CDN, CWV, SSR) stay in English.
Brand names, tool names ("deco", "AI Agents"), benchmark sources stay in English.

NATURAL LANGUAGE:
The report must read as if written by a fluent native speaker in the local market's
professional register — not machine-translated or overly academic.
- Industry terms commonly used in English in the local market should stay in English.
  In Brazilian e-commerce, words like "health score", "review", "cross-sell", "blog",
  "template", "bundle", "cache", "rich snippet" are standard. Don't force translations.
- Ordinary language should sound natural. Read each sentence aloud — would a senior
  marketing director say it this way? If it sounds stiff or translated, rewrite it.
</report-language>

<url-normalization>
Always normalize URLs before passing to any tool:
- No protocol → prepend https://
- No www and domain doesn't resolve → try with www
- Validate protocol before ANY tool call
</url-normalization>

<tools>
You have fourteen tools. Call them directly.

**Performance & Technical:**
1. **fetch_page** — HTTP fetch (no browser). Returns: status, headers, seo, links, sitemaps.
   - Set maxBodyKB: 1 when you only need SEO/headers.
   - Set extractLinks: false unless you need internal link discovery.
   - Don't fetch_page a URL you're already running capture_har on.

2. **capture_har** — Full browser load, 4 passes (2 desktop + 2 mobile). Returns: TTFB,
   request counts, cache analysis, third-party inventory, failed requests, slowest resources.

3. **lighthouse_audit** — Lighthouse performance audit. Returns: CWV, category scores, diagnostics.
   Run once per page type (homepage, PLP, PDP). Default to mobile.

4. **render_page** — Browser render with JS execution. Returns: full DOM, visible text, JSON-LD.
   Use only when fetch_page returns skeleton HTML (SPAs, client-rendered).

5. **screenshot** — Screenshot a URL.

**Site Intelligence:**
6. **crawl_site** — Discover pages via Firecrawl map (fast, no scraping). Returns: page counts
   by type, sample URLs per category. Run early — foundation for all scope math.

7. **scrape_page** — Deep-scrape a single page via Firecrawl. Returns: markdown, metadata,
   branding. Use for: PDP content quality, reviews, cross-sell, JSON-LD, image alts.

8. **audit_seo** — SEO audit via DataForSEO (up to 1000 pages). Returns: score, broken links,
   duplicates, missing meta, structured data coverage. Takes 1-3 minutes.

9. **research_serp** — Google SERP via DataForSEO. Returns: top 10 organic, related searches,
   people also ask, AI overview.

10. **research_keywords** — Keyword metrics via DataForSEO. Returns: volume, difficulty, CPC,
    competition, monthly trends.

11. **research_business** — Business intelligence via Perplexity (web-grounded). Returns:
    company summary, competitors, news, traffic estimates.

12. **research_content** — Editorial content discovery via Perplexity. Query: "Does {brand}
    ({domain}) have a blog, editorial section, or content marketing pages? List URLs found."
    Catches content on subdomains and non-standard paths.

13. **research_traffic** — Website traffic intelligence via Similarweb (Apify scraper). Input:
    array of full URLs (e.g. ["https://www.example.com/"]). Returns per domain: global/country/
    category rank, monthly visits (3-month trend), engagement metrics (bounce rate, pages/visit,
    avg duration), traffic source breakdown (direct, search, social, referral, mail, paid),
    top countries by share, top keywords (volume, CPC, estimated value), and AI traffic share
    (ChatGPT, Claude, Perplexity, Gemini, Copilot). Use for: populating the Traffic Intelligence
    section, benchmarking against competitors, and validating SEO opportunity sizing.

14. **save_diagnostic** — Save completed report. Always call after writing the full report.
    Fields: id (domain-slug-timestamp), url, title, createdAt (ISO), healthScore (0-100),
    summary (1-2 sentences), report (full markdown), status ("complete").
</tools>

<graceful-degradation>
When a tool returns an API key error: skip dependent sections silently, continue with
other tools. Add a single footnote at the end if needed:
"*Some sections may reflect partial data due to tool availability.*"
Technical analysis (fetch_page + capture_har + lighthouse) is always available.
</graceful-degradation>

<parallelism>
Maximize parallelism: spawn a SEPARATE sub-agent for each independent tool call.
Never call tools sequentially when they can run concurrently.
Within a phase, fire all independent calls in ONE message. Only wait between phases
when the next phase depends on the previous phase's results.
</parallelism>

<execution-order>
Execute ALL FIVE PHASES (0-4) in order. Start immediately. Never skip a phase. Never
stop after a partial report. Always end with Phase 4 (self-review + save).

PHASE 0 — DISCOVERY (parallel, ~10s)

Spawn in one message:
  1. crawl_site(url, maxPages: 500)
  2. research_business(companyName, domain, category)
  3. fetch_page("{site}/sitemap.xml", extractLinks: false, maxBodyKB: 512)
  4. fetch_page("{site}", extractLinks: true, maxBodyKB: 1)
  5. fetch_page("{site}/robots.txt", extractLinks: false, maxBodyKB: 1)
  6. research_content(brandName, domain, category)
  7. research_traffic(urls: ["https://{domain}/"])

Then establish:

**SITE INVENTORY:**
  Record from crawl_site: totalPages, pdpCount, plpCount, blogCount, institutionalCount.
  These are your denominators for all report math.

**SITEMAP PRODUCT COUNT:**
  If /sitemap.xml lists child product sitemaps, fetch each one and count <loc> entries.
  Sum = measured catalog size (replaces crawl_site pdpCount).
  If sitemaps can't be fetched, use crawl_site count only. State what you measured.
  NEVER extrapolate or multiply (e.g., "6 sitemaps × ~500 = ~3,000" is fabrication).

**EDITORIAL DISCOVERY (mandatory):**
  Use three methods in parallel:

  Method 1 — Path probing: fetch_page (maxBodyKB: 1, extractLinks: true) on common
  editorial paths:
    /blog, /editorial, /revista, /conteudo, /magazine, /news, /noticias, /stories,
    /artigos, /guia, /inspira
  Any path returning HTTP 200 with editorial content (not a product listing or redirect
  to homepage) counts as an active editorial section.

  Method 2 — research_content results from step 6 above. Cross-reference: for any URL
  found that wasn't covered by path probing, fetch to confirm it's live.

  Method 3 — crawl_site categories for blog/editorial classifications.

  For any live editorial section found, extract links to estimate volume and scrape 1-2
  posts to assess quality and recency.

  Report what you found precisely. Use only paths and data specific to THIS site.
  Do not reference paths or content from other sites or prior analyses.

Write status: "Discovered {N} pages ({pdps} products, {plps} PLPs, {blog} editorial).
Starting technical analysis..."

PHASE 1 — QUICK SEO SCAN (~10s)

Select from crawl_site results: 2-3 PDPs, 1-2 PLPs, 1 editorial post (if any).
Spawn parallel fetch_page calls (maxBodyKB: 1, extractLinks: false).
Write quick report: platform, CDN, structure summary, SEO per page, content status,
business context. Then: "Quick scan complete. Starting deep analysis..."

PHASE 2 — DEEP ANALYSIS (parallel, ~60-120s)

Spawn all as separate sub-agents:
  - capture_har (homepage, plp1, pdp1)
  - lighthouse_audit (homepage mobile, pdp1 mobile)
  - screenshot (homepage, device: desktop)
  - screenshot (plp1, device: desktop) — if plp1 was discovered
  - audit_seo (url, maxPages: 100)
  - research_serp (brandName; brandName + category)
  - research_keywords (top 3-5 keywords)

PHASE 3 — CONTENT DEEP DIVE (~30s, e-commerce only)

If PDP count > 0: spawn scrape_page on 3-5 PDPs, 1-2 editorial posts, AND
screenshot(pdp1, device: desktop) in parallel. The PDP screenshot is included in the report after
PDP-related findings to visually ground the analysis.
Analyze: reviews, cross-sell blocks, content quality, JSON-LD, image alts.
Then write the FULL REPORT. Proceed to Phase 4.

PHASE 4 — SELF-REVIEW & SAVE (mandatory)

Before saving, verify each of these. If any fails, fix the report.

  a) DATA PROVENANCE: Every number traces to a specific tool. If you can't name the
     tool that returned it, remove it.

  b) OPPORTUNITY COUNT: {N} = distinct action items. {total_page_improvements} = sum of
     Pages Affected values. {unique_urls} = deduplicated URLs. Verify all three match
     the headline and Summary table. No double-counting actions across sections.

  c) BENCHMARKS: Each one is from the safe list or clearly attributed. If uncertain,
     soften to a range or remove.

  d) EXTRAPOLATION: Every sampled finding says "based on N sampled pages." No sample
     presented as a measured fact.

  e) HEALTH SCORE: Recalculate per rubric. Verify breakdown matches header.

  f) RESEARCH_BUSINESS: Every claim uses hedging ("approximately", "segundo pesquisa
     de mercado") with footnoted source.

  g) EDITORIAL: Verify you completed the three-method discovery. Verify the report
     describes only what was actually found on THIS site.

  h) SERP: Every position claim includes source, location, and date.

  i) TONE: Scan for banned patterns (see <voice>). Fix any found.

  j) REPETITION: No finding re-listed outside its own section. "What This Requires"
     names no specific findings. "Strategic Context" references patterns, not items.

  k) SITE-SPECIFICITY: No references to paths, content, or findings from other sites.
     Every example, path, and data point must come from THIS site's tool results.

  l) TRAFFIC DATA: If research_traffic returned data, verify the header monthly visits,
     category, and ranking numbers come from the tool output (not invented). If
     research_traffic failed, fall back to research_business estimates and state source.

  m) SCREENSHOTS: Verify that every screenshot tool call that returned an imageUrl has
     its URL embedded in the report as ![caption](imageUrl). Count: you should have
     inserted as many images as successful screenshot calls.

  Then call save_diagnostic.
</execution-order>

<opportunity-counting>
Frame each opportunity as "what needs to change" + "how many pages are affected."
Do NOT classify as template/per-page/config — we don't know the implementation path.

  Good: "Add Product JSON-LD to product pages | 2,358 PDPs"
  Good: "Generate unique meta descriptions | 2,358 pages need unique content"
  Bad: "1 template change → 2,358 pages" (we don't know it's a template)
  Bad: "2,358 manual rewrites" (we don't know it's manual)

COUNTING:
- Each distinct action = 1 opportunity. Scope column shows pages affected.
- {N} = number of distinct actions. {total_page_improvements} = sum of all Pages Affected.
  {unique_urls} = deduplicated page count across all actions.
- Present all three numbers transparently in the headline and summary.
- Ongoing work (content production, review collection) noted separately, excluded from {N}.
</opportunity-counting>

<report-template>
Structure the report exactly as below. This is a narrative — each section builds on
the last. Use actual tool data. Never fabricate.

---

# Diagnostic report: {Brand} ({Parent Company if known})

> **Date:** {YYYY-MM-DD} **URL:** {domain} **Platform:** {detected} **Monthly visits:** ~{totalVisits}
> ({month of snapshot from research_traffic}) **Category:** {category from research_traffic or detected}
> **Ranking global:** #{rankGlobal} | **Ranking Brasil:** #{countryRank}

**Health Score: {score}/100** — Structured Data {X}/20 | Content Engine {X}/15 | Product SEO {X}/15 | Performance {X}/20 | Social Proof {X}/10 | Cross-sell {X}/10 | Domain Signals {X}/10

**Site inventory:** {Measured counts with sources. State what was measured vs. estimated.}[^inventory]
[^inventory]: {Methodology: which sitemaps, crawl limits, discovery methods.}

---

## {total_page_improvements} improvement opportunities identified on {domain}

We identified **{N} areas of improvement** representing **{total_page_improvements}
page-level improvements** across **{unique_urls} unique URLs**. {2-3 sentences on the
most impactful findings — stated here once, not repeated later.}

---

## Opportunities

Each section: finding with inline source references → scope table → business implication.

| Action | Pages affected |
|---|---|
| {what needs to change} | {number or "site-wide" for config} |

Number sections sequentially (### 1., ### 2., etc.).
Include only sections with tool data. Group minor fixes in one "Technical hygiene" section.

**Screenshots (MANDATORY):** You MUST insert every successful screenshot into the report.
The screenshot tool returns an imageUrl field — use that exact URL, never modify or invent URLs.
Insert each screenshot inline where it contextually belongs:
- Homepage screenshot: after the headline/summary section
- PLP screenshot: after the last PLP/navigation-related finding
- PDP screenshot: after the last PDP-related opportunity (structured data, reviews, cross-sell)
Use markdown image syntax: ![caption](imageUrl). Omit silently ONLY if the screenshot tool returned an error.
Before calling save_diagnostic, verify that every successful screenshot imageUrl appears in the report markdown.

---

## Opportunity summary

| Opportunity | Action | Pages affected |
|---|---|---|
| {each section} | {description} | {count} |
| **Total** | **{N} areas** | **{total_page_improvements} page-level improvements across {unique_urls} unique URLs** |

One paragraph below (no finding names):
"What each improvement requires depends on the platform and team. The volume —
{total_page_improvements} individual improvements across {unique_urls} URLs — and the
ongoing nature of the work make automated execution essential."

---

## What this requires

6-8 sentences MAXIMUM. Three short paragraphs:

1. Scale: the improvements touch thousands of pages, and the catalog is not static.
   New products inherit the same gaps. Reference TOTALS only.

2. Nature of the work: some fixes are one-time; the content and monitoring work is
   continuous, granular, and time-sensitive.

3. deco AI Agents: specialized agents that execute continuously. What traditionally
   takes weeks, deco delivers in minutes, on autopilot.

Close with: "Run your digital strategy on autopilot." (or equivalent in report language)

RULES: Do NOT name specific findings. Do NOT claim agencies are slow or overpriced.
Do NOT quote prices or timelines.

---

## Strategic context

3-4 focused paragraphs of EXTERNAL context (market, competition, timing).
Do NOT rehash technical findings. Reference them only at the pattern level.
Footnote all research_business claims. Caveat all SERP positions with source/location/date.

---

## References and methodology

**Industry benchmarks cited:** {list with sources}
**Data sources:** {tool, scope, date for each}
**Source URLs:** {footnoted references from research_business citations}

---

*Report generated by the deco AI diagnostic pipeline.*

</report-template>

<data-integrity>
NON-NEGOTIABLE. A single fabricated stat destroys the entire report.

PROVENANCE: Every number traces to a named tool.
  Good: "2,358 PDPs measured from product sitemaps"
  Bad: "~3,000 products estimated"

ABSENCE vs. NON-DETECTION: This is a blackbox diagnostic.
  Always: "not detected", "not found in our analysis", "not identified"
  Never: "zero", "none whatsoever", "completely absent", "does not exist"

SITEMAPS vs. REALITY: Sitemaps are incomplete signals. Content can exist without being
  in a sitemap. Never conclude content doesn't exist based solely on sitemap data.

SERP POSITIONS: Volatile, personalized, location-dependent. Every claim must include
  source (DataForSEO), location, and date.

SAMPLING: If based on a sample, state the sample size explicitly.
  "Of 3 PDPs sampled, none contained a review section."
  Never extrapolate a 3-page sample as a catalog-wide fact.

CAUSAL CLAIMS: Distinguish observation from inference.
  Observation: "Homepage weighs 11.2 MB" (measured)
  Inference: "likely driven by an undeferred video embed" (use "likely", "suggests")

FINANCIAL DATA: Specify currency, period, gross vs. net, source with footnote.
  Never mix currencies without stating the conversion.

RESEARCH_BUSINESS: AI-synthesized, can be wrong. Always hedge ("approximately",
  "segundo pesquisa de mercado") and footnote with citation URL.

RESEARCH_TRAFFIC (Similarweb): Third-party panel-based estimates, not first-party data.
  - Present as "approximately" / "estimated" — never as exact figures.
  - Always include the [^sw] footnote explaining the data source and its limitations.
  - Traffic source shares are percentages that sum to ~100%. Present as percentages, not
    absolute visit counts per channel (unless you multiply share × totalVisits and label
    it as "estimated").
  - AI traffic shares may be null for some sources — display "—", don't say "zero".
  - Keyword CPC may be null — display "—", don't say "free" or "zero".
  - When comparing with competitors, both numbers MUST come from research_traffic
    (same source, same snapshot period). Never mix Similarweb with other traffic sources.
  - If research_traffic returns an error or empty data, omit the Traffic Intelligence
    section entirely. Add a footnote: "Traffic intelligence unavailable for this domain."

CATALOG SIZE: Measured from sitemaps = fact. From crawl_site = stated with crawl limit.
  Never extrapolate. Every catalog reference uses the same number from the same source.

BENCHMARKS — safe list (pre-vetted, use freely):
  * "Every 0.1s mobile speed improvement → +8.4% conversion (retail), +10.1% (travel)" (Deloitte, "Milliseconds Make Millions", 2020, 37 brands, 30M sessions)
  * "Product recommendations drive 10-30% of e-commerce revenue" (McKinsey)
  * "Rich snippets increase CTR by 20-40%" (Search Engine Journal / Ahrefs)
  * "Products with 50+ reviews convert at 2-3x vs. zero reviews" (Bazaarvoice / Spiegel)
  * "Unique product descriptions increase organic traffic per PDP by 30-50%" (Ahrefs)
  * "Post-purchase review request emails: 5-15% response rate" (industry average)
  * "Average AOV uplift with cross-sell: 8-15%" (Baymard Institute)
  * "Companies with active blogs generate ~55% more visitors" (HubSpot)
  Any benchmark not on this list must be attributed to a verifiable source.
  If unsure, use a range. Never invent a stat and attribute it to a real source.

COMPETITORS: Only name competitors that appeared in tool results. Traffic comparisons
  require both numbers from the same source.

MISSING DATA: Omit the section. Don't fill with guesses. 5 solid sections beat 8
  where 3 are padded.
</data-integrity>

<health-score-rubric>
Calculate from measured data. If a category has no data, score N/A and redistribute.

1. STRUCTURED DATA (0-20)
   0: No JSON-LD on any sampled page | 5: <25% or partial | 10: 25-75% with Product
   15: >75% with Product + BreadcrumbList | 20: Full coverage all relevant types

2. CONTENT ENGINE (0-15)
   0: No editorial found after full discovery | 3: Editorial exists but not in sitemaps
   5: In sitemaps, <10 posts or outdated | 10: 10-50 posts, some SEO optimization
   15: 50+ posts, active publishing, SEO-optimized

3. PRODUCT SEO (0-15)
   0: All sampled pages generic/template meta | 5: <25% unique | 8: 25-50% unique
   12: 50-90% unique | 15: >90% unique, keyword-targeted

4. PERFORMANCE (0-20) = TTFB+Weight (0-10) + Caching (0-10)
   TTFB+Weight: 0 if >3s or >10MB | 3 if 2-3s or 5-10MB | 6 if 1-2s & 3-5MB
   8 if 600ms-1s & 1.5-3MB | 10 if <600ms & <1.5MB
   Caching: 0 if no-cache all | 3 if homepage only | 6 if most pages, low TTL
   10 if proper headers on all types

5. SOCIAL PROOF (0-10)
   0: No reviews on any sampled PDP | 3: Reviews exist, <5 avg | 6: 5-50 avg
   10: 50+ on most sampled PDPs

6. CROSS-SELL (0-10)
   0: No recommendations on any sampled PDP | 3: API detected but not rendered
   5: Present on some PDPs | 10: Present on all sampled PDPs

7. DOMAIN SIGNALS (0-10)
   SSL: +2 | Sitemap valid: +2 | Robots.txt valid: +2 | Canonicals correct: +2
   No conflicting robots meta: +2

Header format:
"**Health Score: {score}/100** — Structured Data {X}/20 | Content Engine {X}/15 |
Product SEO {X}/15 | Performance {X}/20 | Social Proof {X}/10 | Cross-sell {X}/10 |
Domain Signals {X}/10"
</health-score-rubric>

<checklist>
Before writing output, verify compliance. Violations observed in past runs are marked *.

1. LANGUAGE: .br → pt-BR. Everything else → English. No exceptions.
2. NO EMOJIS anywhere.
3. STRUCTURE: Follow <report-template> exactly. No invented sections.
4. NO PACE CLAIMS about agencies or SIs. No sprint plans. No pricing.
5. CDN details in Performance section only — not in the header.
6. HEALTH SCORE uses correct max values: /20, /15, /15, /20, /10, /10, /10.
7. ALL 5 PHASES executed. Always end with save_diagnostic.
8. * EDITORIAL: Full three-method discovery completed before any conclusion.
9. * SERP: Source, location, date on every position claim.
10. * SAMPLES: Every sampled finding states the sample size.
11. COUNTING: Actions = {N}. Pages = {total_page_improvements}. Deduplicated = {unique_urls}.
12. * BENCHMARKS: From safe list or verifiably attributed.
13. * TONE: "Not detected" instead of "zero." Opportunity framing, not failure framing.
14. * NO REPETITION: Findings in their section only. Totals in summary sections.
15. * DEPTH: High-impact 2-3¶. Low-impact 1¶ max, grouped.
16. * SITE-SPECIFICITY: Every path, example, and finding from THIS site's data only.
17. HEADLINE: Always "{total} oportunidades de melhoria identificadas em {domain}".
18. * NATURAL LANGUAGE: No machine-translated phrasing. Keep English industry terms
    where natural in the local market. Read aloud test.
19. TRAFFIC DATA: Header monthly visits, category, and rankings from research_traffic.
    If unavailable, fall back to research_business and state source.
</checklist>`;

const SLIDE_PROMPT = `You create branded diagnostic presentation decks using the slide-maker MCP tools.

<slide-creation>
Pass the FINAL HTML for every slide directly in the slide_maker call. Each slide's html field must contain the complete, rendered content.
The brand theme is applied automatically — do not call import_brand or worry about brandId.
</slide-creation>

<copy-rules>
SLIDE COPY RULES:
- NEVER mention internal tool names (audit_seo, capture_har, fetch_page, lighthouse_audit, scrape_page, render_page, research_traffic, etc.) in slide text.
- Instead of "audit_seo identified 20 duplicate titles", write "SEO audit identified 20 duplicate titles".
- Instead of "capture_har measured TTFB of 258ms", write "Network analysis measured TTFB of 258ms".
- Instead of "DataForSEO crawled 100 pages", write "SEO crawler analyzed 100 pages".
- The audience is a VP/CMO — they don't know or care about tool names. Use plain business language.
</copy-rules>

<image-rules>
CRITICAL — IMAGE SAFETY RULES:
- ONLY use image URLs that appear literally in the diagnostic report markdown (screenshot URLs from site-diagnostics.decocms.com/api/screenshots/...).
- NEVER invent, guess, or fabricate image URLs. NEVER use URLs from CDNs, stock photo sites, or any source not in the report.
- If the report contains no screenshot URLs, do NOT include any images in slides. Use solid color backgrounds or data visualizations instead.
- If you need a product image but none exists in the report, use a colored placeholder div with the product name as text — never a fake URL.
- Violation of these rules causes brand damage (e.g., showing competitor products). This is the highest priority constraint.
</image-rules>

YOUR SLIDE CREATION PROMPT HERE — replace the rest of this with the prompt that tells the AI how to structure the deck, which tools to call (list_templates, get_template_slide, slide_maker, build_slides, save_deck), and the slide content strategy.`;

// ── MCP Client Helper ─────────────────────────────────────────

async function connectMcp(
	url: string,
	headers?: Record<string, string>,
): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL(url), {
		requestInit: { headers },
	});
	const mcpClient = new Client({ name: "batch-diagnostics", version: "1.0" });
	await mcpClient.connect(transport);
	return mcpClient;
}

/** Append __decoFBT=0 to any URL string to simulate bot rendering on deco.cx sites */
function injectDecoFBT(value: unknown): unknown {
	if (typeof value === "string" && /^https?:\/\//.test(value)) {
		try {
			const u = new URL(value);
			if (!u.searchParams.has("__decoFBT")) {
				u.searchParams.set("__decoFBT", "0");
			}
			return u.toString();
		} catch {
			return value;
		}
	}
	if (Array.isArray(value)) return value.map(injectDecoFBT);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = injectDecoFBT(v);
		}
		return out;
	}
	return value;
}

const MAX_RESULT_CHARS = 30_000; // ~7500 tokens, prevents context blowup

function truncateResult(result: unknown): string {
	const str =
		typeof result === "string" ? result : JSON.stringify(result, null, 2);
	if (str.length <= MAX_RESULT_CHARS) return str;
	return `${str.slice(0, MAX_RESULT_CHARS)}\n\n... [truncated, ${str.length} chars total]`;
}

async function toolsFromMcp(mcpClient: Client, slug: string): Promise<ToolSet> {
	const list = await mcpClient.listTools();
	const entries = list.tools.map((t) => {
		// Ensure schema has "type": "object" — Anthropic API requires it
		const raw = (t.inputSchema ?? {}) as Record<string, unknown>;
		const schema = { ...raw, type: raw.type ?? "object" } as JSONSchema7;
		return [
			t.name,
			tool({
				description: t.description ?? "",
				inputSchema: jsonSchema(schema),
				execute: async (input) => {
					log(slug, `tool: ${t.name}`);
					const args = injectDecoFBT(input) as Record<string, unknown>;
					const result = await mcpClient.callTool(
						{ name: t.name, arguments: args },
						CallToolResultSchema,
						{ timeout: 300_000 },
					);
					// Truncate large results to prevent context overflow
					return truncateResult(result);
				},
			}),
		];
	});
	return Object.fromEntries(entries) as ToolSet;
}

// ── Helpers ───────────────────────────────────────────────────

function readDomains(csvPath: string): string[] {
	const content = readFileSync(csvPath, "utf-8");
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

function domainSlug(url: string): string {
	try {
		return new URL(url).hostname
			.replace(/^www\./, "")
			.replace(/[^a-z0-9.-]/g, "-");
	} catch {
		return url.replace(/[^a-z0-9.-]/g, "-");
	}
}

function log(domain: string, msg: string) {
	const ts = new Date().toISOString().slice(11, 19);
	console.log(`[${ts}] [${domain}] ${msg}`);
}

// ── Step 1: Run Diagnostic ────────────────────────────────────

async function runDiagnostic(domain: string): Promise<string | null> {
	const slug = domainSlug(domain);
	const outputPath = join(OUTPUT_DIR, `${slug}-diagnostic.md`);

	if (existsSync(outputPath)) {
		log(slug, "Diagnostic already exists, skipping");
		return readFileSync(outputPath, "utf-8");
	}

	log(slug, "Starting diagnostic...");
	const mcpClient = await connectMcp(SITE_DIAGNOSTICS_MCP);

	try {
		const tools = await toolsFromMcp(mcpClient, slug);

		// Intercept save_diagnostic to capture the report
		let savedReport: string | null = null;
		let savedMeta: Record<string, unknown> | null = null;
		// biome-ignore lint/suspicious/noExplicitAny: wrapping dynamic MCP tool
		const originalSave = tools.save_diagnostic as any;
		if (originalSave?.execute) {
			const origExecute = originalSave.execute;
			originalSave.execute = async (
				input: Record<string, unknown>,
				options: unknown,
			) => {
				savedReport = input.report as string;
				savedMeta = {
					id: input.id,
					url: input.url,
					title: input.title,
					healthScore: input.healthScore,
					summary: input.summary,
					status: input.status,
					createdAt: input.createdAt,
				};
				log(slug, "tool: save_diagnostic (intercepted)");
				return origExecute(input, options);
			};
		}

		const result = streamText({
			model: anthropic("claude-opus-4-6"),
			system: DIAGNOSTICS_PROMPT,
			messages: [{ role: "user", content: `Diagnose this site: ${domain}` }],
			tools,
			stopWhen: stepCountIs(50),
			onStepFinish: ({ text }) => {
				if (text) {
					log(slug, `text: ${text.slice(0, 80).replace(/\n/g, " ")}...`);
				}
			},
		});

		const usage = await result.usage;
		log(slug, `done, usage: ${JSON.stringify(usage)}`);

		const report = savedReport as string | null;
		if (report !== null && savedMeta !== null) {
			writeFileSync(outputPath, report);
			writeFileSync(
				join(OUTPUT_DIR, `${slug}-diagnostic-meta.json`),
				JSON.stringify(savedMeta, null, "\t"),
			);
			log(slug, `Diagnostic saved (${Math.round(report.length / 1024)}KB)`);
			return report;
		}

		throw new Error("save_diagnostic tool was not called — no report produced");
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(slug, `ERROR in diagnostic: ${msg}`);
		writeFileSync(join(OUTPUT_DIR, `${slug}-diagnostic-error.txt`), msg);
		return null;
	} finally {
		await mcpClient.close().catch(() => {});
	}
}

// ── Step 2: Create Slide Deck ─────────────────────────────────

async function createSlideDeck(
	domain: string,
	diagnosticReport: string,
): Promise<string | null> {
	const slug = domainSlug(domain);
	const outputPath = join(OUTPUT_DIR, `${slug}-deck.json`);

	if (existsSync(outputPath)) {
		log(slug, "Deck already exists, skipping");
		return readFileSync(outputPath, "utf-8");
	}

	log(slug, "Creating slide deck...");
	const mcpClient = await connectMcp(SLIDE_MAKER_MCP, {
		Authorization: `Bearer ${SLIDE_MAKER_TOKEN}`,
	});

	try {
		// Import brand deterministically — inject brandId into tool calls
		log(slug, "Importing brand...");
		let brandId: string | undefined;
		let brandLogoUrl: string | undefined;
		try {
			const brandResult = await mcpClient.callTool(
				{ name: "import_brand", arguments: { url: domain } },
				CallToolResultSchema,
				{ timeout: 120_000 },
			);
			// biome-ignore lint/suspicious/noExplicitAny: dynamic MCP response
			const br = brandResult as any;
			const brandData = br?.structuredContent ?? br;
			brandId = brandData?.id ?? undefined;
			brandLogoUrl = brandData?.assets?.logo ?? undefined;
			if (brandId && brandData) {
				// Persist the full brand object
				await mcpClient.callTool(
					{ name: "save_brand", arguments: brandData },
					CallToolResultSchema,
					{ timeout: 30_000 },
				);
				log(
					slug,
					`Brand imported and saved: ${brandId} (logo: ${brandLogoUrl ?? "none"})`,
				);
			}
		} catch (e) {
			log(slug, `Brand import failed, proceeding without: ${e}`);
		}

		const tools = await toolsFromMcp(mcpClient, slug);

		// Intercept slide_maker and save_deck to inject brandId
		if (brandId) {
			for (const toolName of ["slide_maker", "save_deck"]) {
				// biome-ignore lint/suspicious/noExplicitAny: wrapping dynamic MCP tool
				const orig = tools[toolName] as any;
				if (!orig?.execute) continue;
				const origExecute = orig.execute;
				orig.execute = async (
					input: Record<string, unknown>,
					options: unknown,
				) => {
					// Clone and inject brandId — AI SDK may freeze the input object
					const patched = JSON.parse(JSON.stringify(input));
					if (patched.deck && typeof patched.deck === "object") {
						patched.deck.brandId = brandId;
					}
					if (toolName === "save_deck") {
						patched.brandId = brandId;
					}
					log(slug, `${toolName}: injected brandId=${brandId}`);
					return origExecute(patched, options);
				};
			}
		}

		const result = streamText({
			model: anthropic("claude-opus-4-6"),
			system: SLIDE_PROMPT,
			messages: [
				{
					role: "user",
					content: `Create a diagnostic presentation slide deck for ${domain}.${brandLogoUrl ? `\n\nBrand logo URL (use this in the cover and closing slides): ${brandLogoUrl}` : ""}\n\nHere is the diagnostic report:\n\n${diagnosticReport}`,
				},
			],
			tools,
			stopWhen: stepCountIs(50),
		});

		const finalText = await result.text;

		writeFileSync(outputPath, finalText);
		log(slug, "Deck created");
		return finalText;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(slug, `ERROR in slide creation: ${msg}`);
		writeFileSync(join(OUTPUT_DIR, `${slug}-deck-error.txt`), msg);
		return null;
	} finally {
		await mcpClient.close().catch(() => {});
	}
}

// ── Step 2.5: Post-Generation Validator ───────────────────────

const VALIDATOR_PROMPT = `You are a quality-control reviewer for auto-generated site diagnostic reports.

Check the report for these specific issues ONLY:

1. **DELOITTE_MISQUOTE** — Any mention of "every 1 second" or "5% conversion uplift" attributed to Deloitte. The real stat is per 0.1s, sector-specific (8.4% retail, 10.1% travel).
2. **WAF_SCREENSHOT** — References to screenshots that actually show WAF/bot-protection pages (Akamai "Access Denied", Cloudflare challenge, 403 Forbidden, etc.) presented as real site content.
3. **UNVERIFIED_FINANCIALS** — Specific revenue, GMV, or valuation figures without a source (e.g., "Company X generates $2B in revenue" with no citation).
4. **WEAK_SOURCES** — YouTube videos, Wikipedia, or generic blog posts cited as business intelligence or industry benchmarks.
5. **CURRENCY_CONFUSION** — Mixing up "billones" (Spanish = trillions) with "billions", or using wrong currency units for LATAM companies.
6. **SISTER_BRAND_COMPETITOR** — Listing a brand owned by the same parent company as a competitor.
7. **OVERLY_SPECIFIC_UNVERIFIED** — Very precise unverified claims (e.g., "37.2% of users abandon…") that look hallucinated — round numbers with sources are fine, suspiciously precise numbers without sources are not.

For each issue found, return:
- check: the check ID from the list above
- severity: "high" | "medium" | "low"
- location: a short quote from the report where the issue appears
- explanation: why this is wrong

Respond with ONLY valid JSON, no markdown fences:
{
  "issues": [ { "check": "...", "severity": "...", "location": "...", "explanation": "..." } ],
  "passed": [ "CHECK_IDS that passed..." ],
  "summary": "one-sentence overall assessment"
}`;

async function runValidator(domain: string, report: string): Promise<void> {
	const slug = domainSlug(domain);
	const reviewPath = join(OUTPUT_DIR, `${slug}-diagnostic-review.json`);

	// Idempotent — skip if already reviewed
	if (existsSync(reviewPath)) {
		log(slug, "Review already exists, skipping validator");
		return;
	}

	log(slug, "Running quality validator...");

	try {
		const result = await generateText({
			model: anthropic("claude-sonnet-4-6"),
			system: VALIDATOR_PROMPT,
			messages: [
				{
					role: "user",
					content: `Review this diagnostic report for ${domain}:\n\n${report}`,
				},
			],
		});

		const review = JSON.parse(result.text);
		writeFileSync(reviewPath, JSON.stringify(review, null, "\t"));

		const issueCount = review.issues?.length ?? 0;
		log(
			slug,
			issueCount > 0
				? `Validator found ${issueCount} issue(s): ${review.summary}`
				: `Validator passed: ${review.summary}`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(slug, `Validator error (non-blocking): ${msg}`);
	}
}

// ── Pipeline ──────────────────────────────────────────────────

async function processDomain(domain: string): Promise<void> {
	const diagnostic = await runDiagnostic(domain);
	if (!diagnostic) return;

	await runValidator(domain, diagnostic);
	if (!DIAGNOSTICS_ONLY) {
		await createSlideDeck(domain, diagnostic);
	}
}

async function runBatch(domains: string[]) {
	for (let i = 0; i < domains.length; i += CONCURRENCY) {
		const batch = domains.slice(i, i + CONCURRENCY);
		const batchNum = Math.floor(i / CONCURRENCY) + 1;
		const totalBatches = Math.ceil(domains.length / CONCURRENCY);

		console.log(
			`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} domains) ---\n`,
		);

		await Promise.allSettled(batch.map((domain) => processDomain(domain)));
	}
}

// ── Main ──────────────────────────────────────────────────────

const csvPath = process.argv.find(
	(a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1],
);
if (!csvPath) {
	console.error(
		"Usage: bun scripts/batch-diagnostics.ts <domains.csv> [--diagnostics-only]",
	);
	process.exit(1);
}

const domains = readDomains(csvPath);
console.log(`Loaded ${domains.length} domains from ${csvPath}`);
console.log(`Concurrency: ${CONCURRENCY}`);
console.log(
	`Mode: ${DIAGNOSTICS_ONLY ? "diagnostics only" : "diagnostics + slides"}`,
);
console.log(`Output: ${OUTPUT_DIR}\n`);

mkdirSync(OUTPUT_DIR, { recursive: true });

const startTime = Date.now();
await runBatch(domains);
const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);

console.log(
	`\n=== Done! ${domains.length} domains processed in ~${elapsed} minutes ===`,
);
console.log(`Results in: ${OUTPUT_DIR}/`);
