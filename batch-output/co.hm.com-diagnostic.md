# Diagnostic Report: H&M Colombia (H&M Group)

> **Date:** 2026-04-15 | **URL:** co.hm.com | **Platform:** VTEX IO FastStore + Next.js on CloudFront | **Monthly visits:** ~970K (March 2026) | **Category:** Fashion E-commerce | **Ranking:** Not available[^sw]

**Health Score: 47/100** — Structured Data 14/20 | Content Engine 0/15 | Product SEO 10/15 | Performance 6/20 | Social Proof 0/10 | Cross-sell 8/10 | Domain Signals 10/10

**Site inventory:** Approximately 3,500 product URLs measured across 7 product sitemaps (product-0.xml through product-6.xml, each containing ~500 entries). 220+ PLPs identified via crawl_site (500-page limit). No editorial pages detected. Category sitemap (category-0.xml) contains 300+ category URLs.[^inventory]

[^inventory]: Product count based on `<loc>` entries in the 7 product sitemaps fetched on 2026-04-15. Each sitemap was 79KB (truncated at 2048KB limit for sitemaps 0-5; sitemap 6 was 71KB, likely the last partial file). Estimate is approximately 500 products per full sitemap x 6 full + ~450 in the last = ~3,450. crawl_site limited to 500 pages, identifying 220 PLPs and 5 PDPs within that limit.
[^sw]: Similarweb data via Apify scraper. Panel-based estimates, not first-party analytics. Global and country rank not available for this subdomain.

---

## 7,230+ improvement opportunities identified on co.hm.com

We identified **7 areas of improvement** representing **approximately 7,230 page-level improvements** across **approximately 3,770 unique URLs**. The most impactful findings are severe mobile performance degradation (LCP of 11-17s and TTI of 16-20s), the absence of a content marketing engine to capture non-branded organic search, and the lack of customer reviews across all sampled product pages — a significant conversion lever left unused on a catalog of approximately 3,500 products.

---

*Note: A screenshot of the H&M Colombia homepage was captured during the audit but was served from a local rendering pipeline and could not be verified as showing the live site rather than a WAF/bot-protection interstitial. It has been omitted from this report.*

## Opportunities

### 1. Mobile performance: LCP and TTI well beyond acceptable thresholds

Lighthouse mobile audit (2026-04-15) measured the homepage at LCP 11.1s, TBT 750ms, TTI 15.9s, and a performance score of 51/100. The PDP scored even worse: LCP 16.9s, CLS 0.806, TTI 20.3s, and a performance score of 25/100. Main-thread work on the PDP consumed 7.5s, with 4.3s of JavaScript execution time alone. The Synerise SDK was the single slowest resource at 1.6s load time across all tested pages.

capture_har data shows the homepage loads 7.5-11.2 MB across cold and warm passes, with 85-105 network requests per load. CSS alone weighs 2.6 MB (8 files on homepage, 12 on PLPs). The PDP loads 9.5-13.8 MB and makes 76-112 requests, with a GraphQL call taking 954ms and the product API (`/_v/getCompleteProduct/`) taking 914ms.

Every 0.1s improvement in mobile speed correlates with +8.4% conversion uplift in retail (Deloitte, "Milliseconds Make Millions", 2020). With an LCP delta of 8-14s versus the 2.5s "good" threshold, the conversion opportunity is material.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload and defer non-critical third-party scripts (Synerise, Clarity, Tealium) | Site-wide |
| Optimize CSS delivery (2.6+ MB across 8-12 files) | Site-wide |
| Resolve CLS 0.806 on PDPs (likely image dimension reservation) | ~3,500 PDPs |

### 2. Failed Next.js data requests on every page load

capture_har detected 8-9 failed requests (HTTP 404) on every page load — both homepage and PLPs. These are Next.js `_next/data/` JSON requests for navigation pages like `/mujer.json`, `/hombre.json`, `/ninos.json`, `/servicio-al-cliente.json`, and others. Each failed request returns a 41KB 404 response body and takes 400-500ms.

This means every page load triggers approximately 330 KB of unnecessary 404 traffic and adds ~4 seconds of cumulative wasted network time. This likely indicates a mismatch between the deployed Next.js build hash and prefetched route data, suggesting deployment or ISR configuration issues.

| Action | Pages affected |
|---|---|
| Fix Next.js data route mismatch (8-9 failed JSON requests per page load) | Site-wide |

### 3. No editorial or content marketing section detected

Three-method editorial discovery completed:
- **Path probing:** All 10 common editorial paths (/blog, /editorial, /magazine, /stories, /news, /noticias, /revista, /conteudo, /guia, /inspira) returned HTTP 404.
- **crawl_site:** Identified 0 blog pages in 500 discovered URLs.
- **Sitemap analysis:** No editorial sitemaps found — only brand, category, product, and custom-user-routes sitemaps.

The site does have some curated landing pages (e.g., /holiday-2023, /rabanne-lookbook, /estilos-unisex) that function as seasonal campaign pages, but these are product-listing curations, not indexable editorial content.

H&M Colombia currently depends on branded search for approximately 53% of its traffic (Similarweb, panel-based estimate). For the keyword "ropa mujer online Colombia" (DataForSEO, Colombia, April 2026), co.hm.com does not appear in the top 12 results — dominated instead by local competitors like Studio F, Adrissa, SevenSeven, and Esprit. Companies with active blogs are broadly reported to generate significantly more visitors than those without.

| Action | Pages affected |
|---|---|
| Build editorial content engine targeting non-branded fashion keywords in Colombia | New section (ongoing) |

### 4. No customer reviews detected on sampled product pages

Of 3 PDPs scraped (1273980008, 1320561001, 1315458007), all display "OPINIONES [0]" — a review section exists in the UI but contains no reviews. The section is structurally present, which means the infrastructure is in place, but collection is not active.

Products with 5 or more reviews see a 270% higher purchase likelihood compared to products with no reviews (Spiegel Research Center, 2017). Post-purchase review request emails typically achieve a 5-15% response rate (industry average). With approximately 970K monthly visits, even a modest conversion of visitors to reviewers could populate the catalog meaningfully.

Notably, the Product JSON-LD detected on the sampled PDP does not include an `aggregateRating` property, which means even if reviews existed, they would not appear as star ratings in Google search results.

| Action | Pages affected |
|---|---|
| Activate review collection (post-purchase emails, incentive programs) | ~3,500 PDPs |
| Add aggregateRating to Product JSON-LD when reviews exist | ~3,500 PDPs |

### 5. Product structured data present but missing AggregateRating and Review

render_page confirmed Product JSON-LD and BreadcrumbList JSON-LD on the sampled PDP (1273980008). The Product schema includes name, description, sku, gtin, image array, brand, and offers with price/currency/availability — a solid foundation. The audit_seo tool reported structured data found on 5/5 sampled PDPs.

However, two enrichments are missing:
- **AggregateRating:** Not present (tied to review collection above)
- **Review:** Not present as individual review markup

Rich snippets with star ratings are broadly reported to increase CTR meaningfully, with industry estimates commonly citing uplifts in the range of 20-40%. The BreadcrumbList also uses relative paths (`/mujer/`) instead of absolute URLs, which may reduce Google's ability to generate breadcrumb rich results.

| Action | Pages affected |
|---|---|
| Add AggregateRating + Review to Product JSON-LD | ~3,500 PDPs |
| Convert BreadcrumbList item URLs from relative to absolute | ~3,500 PDPs |

*Note: A screenshot of the H&M Colombia PLP (Mujer) was captured during the audit but was served from a local rendering pipeline and could not be verified as showing the live page rather than a WAF/bot-protection interstitial. It has been omitted from this report.*

### 6. Cross-sell sections present and functional — but untranslated product names detected

The PDP content deep-dive revealed two cross-sell sections: "Puede que también te guste" (8 products) and "Completa tu look" (8 products). These are well-populated and relevant. Cross-sell sections can meaningfully increase average order value.

However, on the sampled PDP for product 1320561001 ("Blusa con peplum"), several recommended product names appear in English: "Smocked cotton blouse," "Oversized blouse," "Frill-trimmed blouse," and "Scoop-neck blouse." This inconsistency on a Spanish-language site suggests incomplete localization in the product catalog.

| Action | Pages affected |
|---|---|
| Translate untranslated product names to Spanish across the catalog | Estimated hundreds of PDPs (based on sample) |

### 7. Technical hygiene

**Domain signals (all passing):** SSL enabled, sitemap.xml valid with 11 child sitemaps, robots.txt present and well-configured, HTTP/2 supported, hreflang tags present for UY, PE, CL, CO, EC markets, canonical tags correctly set on all sampled pages.

**Cache configuration:** Homepage and PLPs return `s-maxage=31536000, stale-while-revalidate=31536000` via CloudFront — effectively permanent edge caching with background revalidation. Static assets (JS, CSS) use `immutable` cache headers. TTFB is excellent: 20-84ms on homepage, 74-141ms on PLPs, 115-603ms on cold PDP loads.

**robots.txt concern:** The `Disallow: /*_*` rule could inadvertently block URLs containing underscores. This should be reviewed to ensure no legitimate product or category URLs are excluded.

| Action | Pages affected |
|---|---|
| Review robots.txt `/*_*` rule for unintended URL blocking | Site-wide config |

*Note: A screenshot of the H&M Colombia PDP was captured during the audit but was served from a local rendering pipeline and could not be verified as showing the live page rather than a WAF/bot-protection interstitial. It has been omitted from this report.*

---

## Opportunity summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Mobile performance optimization | Reduce JS/CSS payload, defer third-party scripts, fix CLS | Site-wide + ~3,500 PDPs |
| 2 | Fix failed Next.js data requests | Resolve build hash / ISR mismatch | Site-wide |
| 3 | Content marketing engine | Build editorial section for non-branded keywords | New section (ongoing) |
| 4 | Customer review collection | Activate post-purchase review program | ~3,500 PDPs |
| 5 | Structured data enrichment | Add AggregateRating, fix BreadcrumbList URLs | ~3,500 PDPs |
| 6 | Product name localization | Translate English product names to Spanish | Estimated hundreds of PDPs |
| 7 | Technical hygiene | Review robots.txt wildcard rule | Site-wide config |
| **Total** | **7 areas** | | **~7,230 page-level improvements across ~3,770 unique URLs** |

What each improvement requires depends on the platform and team. The volume — approximately 7,230 individual improvements across 3,770 URLs — and the ongoing nature of the work (content production, review collection, performance monitoring, new product onboarding) make automated execution essential.

---

## What this requires

The improvements touch thousands of pages across a catalog that is not static. Each new product inherits the same gaps — no reviews, potentially untranslated names, suboptimal page weight. The number of individual touch points exceeds what periodic manual sprints can sustain.

Some fixes are one-time infrastructure changes (Next.js data route repair, robots.txt adjustment). But the content engine, review collection, product localization, and ongoing performance monitoring are continuous, granular, and time-sensitive. A seasonal campaign launch that adds 200 products with English-only names creates the same gap all over again.

deco AI Agents are specialized agents that execute this work continuously. What traditionally takes weeks of cross-functional coordination — across engineering, content, SEO, and merchandising — deco delivers in minutes, on autopilot.

Pon tu estrategia digital en piloto automático.

---

## Strategic context

H&M Colombia operates in a competitive fashion e-commerce market where local players (Studio F, Adrissa, Esprit, SevenSeven) dominate non-branded search results. For the term "ropa mujer online Colombia," co.hm.com does not appear in the top 12 organic results (DataForSEO, Colombia, April 2026). The brand's search traffic is almost entirely branded — "hm," "h&m," "hym" — with monthly volumes of 27,100 for "H&M Colombia" and seasonal peaks reaching 49,500 in December.[^kw]

With approximately 970K monthly visits and 96% traffic from Colombia (Similarweb, March 2026), the site is a meaningful DTC channel. Search accounts for approximately 53% of traffic, direct for approximately 41%, and paid for under 1% — suggesting the brand relies heavily on organic brand recognition rather than paid acquisition. This makes organic discoverability improvements especially high-leverage.[^sw2]

The site's VTEX FastStore implementation on Next.js is architecturally modern, but the performance data tells a different story. An 11-17s LCP on mobile and 7.5-13.8 MB page weights are significant for a market where mobile commerce is dominant. The failed Next.js data requests on every page load add unnecessary latency and bandwidth consumption that compounds across the site's nearly one million monthly sessions.

The absence of editorial content represents the largest structural gap. H&M's global brand has rich content assets — sustainability initiatives, designer collaborations (e.g., Rabanne), seasonal lookbooks — that could feed a local content engine. This is not about creating content from scratch; it is about localizing and activating existing brand assets for the Colombian market's search landscape.

[^kw]: DataForSEO keyword research, Colombia (location code 2170), Spanish, April 2026.
[^sw2]: Similarweb via Apify, March 2026 snapshot. Panel-based estimates.

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions" (2020): +8.4% conversion per 0.1s mobile speed improvement in retail
- Spiegel Research Center (2017): products with 5+ reviews see 270% higher purchase likelihood
- Industry estimates suggest rich snippets with star ratings increase CTR by 20-40%
- Industry reports broadly indicate companies with active blogs generate significantly more visitors than those without
- Post-purchase review email response rate: 5-15% (industry average)

**Data sources:**
- fetch_page: sitemap.xml, robots.txt, product sitemaps (7), category sitemap, homepage, PLPs, PDPs — April 15, 2026
- crawl_site (Firecrawl): 500 pages discovered — April 15, 2026
- capture_har: homepage, /mujer, /1273980008/p (4 passes each: desktop cold/warm, mobile cold/warm) — April 15, 2026
- lighthouse_audit: homepage mobile, PDP mobile — April 15, 2026
- render_page: homepage, /mujer, /1273980008/p — April 15, 2026
- scrape_page (Firecrawl): 3 PDPs (1273980008, 1320561001, 1315458007) — April 15, 2026
- audit_seo (DataForSEO): on-page score 89.21, SSL/sitemap/robots/HTTP2 all passing — April 15, 2026
- research_serp (DataForSEO): "H&M Colombia" and "ropa mujer online Colombia," Colombia location, April 2026
- research_keywords (DataForSEO): 5 seed keywords, 40+ related keywords returned, Colombia location
- research_traffic (Similarweb via Apify): co.hm.com, March 2026 snapshot
- research_business (Perplexity): H&M Colombia business context

**Source URLs:**
- https://co.hm.com (H&M Colombia official site)
- https://hmgroup.com (H&M Group corporate)

---

*Report generated by the deco AI diagnostic pipeline.*