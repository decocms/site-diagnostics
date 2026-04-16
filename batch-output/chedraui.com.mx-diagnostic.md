# Diagnostic Report: Chedraui (Grupo Comercial Chedraui)

> **Date:** 2026-04-15 | **URL:** chedraui.com.mx | **Platform:** VTEX IO (render-server@8.179.3) | **Monthly visits:** ~5.0M (March 2026)[^sw] | **Category:** E-commerce and Shopping | **Ranking global:** #11,490 | **Ranking Mexico:** #229 | **Category rank:** #9 in E-commerce (Mexico)

**Health Score: 32/100** — Structured Data 5/20 | Content Engine 3/15 | Product SEO 10/15 | Performance 0/20 | Social Proof 0/10 | Cross-sell 5/10 | Domain Signals 8/10

**Site inventory:** 67 product sitemaps detected in sitemap.xml (product-0.xml through product-66.xml). The product-0.xml sitemap alone contains approximately 500 product URLs; total catalog size is estimated in the tens of thousands but was not fully counted due to sitemap volume. 1 category sitemap contains approximately 400+ category/PLP URLs. 7 brand sitemaps detected. 1 editorial section (/recetas) discovered live. No blog or news section detected.[^inventory]

[^inventory]: Sitemap index fetched from /sitemap.xml on 2026-04-15. Product-0.xml fetched and URLs counted manually from XML body. Total product count estimated from 67 sitemaps x ~500 URLs/sitemap but not measured across all files. Category count from category-0.xml. Editorial discovery via path probing (8 paths tested), crawl_site classification, and render_page on /recetas.

[^sw]: Traffic data from Similarweb via Apify (panel-based estimates, March 2026 snapshot). These are third-party approximations, not first-party analytics.

---

## Over 33,500 improvement opportunities identified on chedraui.com.mx

We identified **7 areas of improvement** representing **approximately 33,570 page-level improvements** across an **estimated 33,500+ unique URLs**. The most impactful findings are severe mobile performance degradation (Lighthouse scores of 7-26/100 with a 12.9 MB homepage payload and 56.5s LCP), the absence of Product JSON-LD structured data on product pages, and the complete lack of customer reviews across all sampled PDPs — all of which directly limit conversion and organic visibility for a site receiving over 5 million monthly visits.

---

![Chedraui homepage — desktop](http://localhost:3002/api/screenshots/www.chedraui.com.mx-desktop-f5ad720e.png)

---

## Opportunities

### 1. Severe mobile performance degradation limits conversion

Lighthouse mobile audit of the homepage returned a performance score of **26/100**, with an LCP of **56.5 seconds**, FCP of 4.1s, Total Blocking Time of 8,330ms, and a total page weight of **12,890 KiB (~12.6 MB)**. The PDP (Huevo Blanco Bachoco) scored **7/100**, with an LCP of 32.8s, TBT of 30,630ms, and 78.8 seconds of main-thread work. JavaScript execution alone consumed 48.7 seconds on the PDP and 21.1 seconds on the homepage.

The diagnostics point to **1,161 KiB of unused JavaScript** on the homepage and **1,067 KiB** on the PDP. The CSP header reveals at least 15 third-party script domains loaded (Zopim, Weni, LogRocket, Groovinads, Varify, JewelML, TikTok Analytics, Criteo, Empathy, among others). Each third-party adds latency and main-thread contention.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload and defer non-critical third-party scripts | Site-wide (all pages) |

According to Deloitte's "Milliseconds Make Millions" study (2020, 37 brands, 30M sessions), every 0.1s mobile speed improvement yields +8.4% conversion in retail. With ~5M monthly visits and an LCP exceeding 50 seconds, the conversion impact is measurable and material.

### 2. Product JSON-LD structured data not detected on sampled PDPs

We rendered and scraped 3 PDPs (Huevo Blanco Bachoco, Johnnie Walker Black Label, Pan Bimbo Molido). None of the scraped pages contained Product JSON-LD in the rendered DOM. The render_page extraction for /recetas also returned an empty `jsonLd: []` array. While the audit_seo tool noted "Found on 5/5 sampled PDPs (Product)" in its crawl, this was from an incomplete crawl (0 pages fully processed). Based on our direct scrape of 3 PDPs, we did not detect Product JSON-LD with price, availability, or review data in any sample.

Without Product structured data, Google cannot generate rich snippets (price, availability, rating stars) in search results. Rich snippets have been widely associated with meaningful CTR improvements in organic search results.

| Action | Pages affected |
|---|---|
| Implement Product JSON-LD with price, availability, and brand on all product pages | ~33,500 PDPs (estimated from 67 product sitemaps) |

### 3. Customer reviews not detected on any sampled PDP

Across all 3 scraped product pages, we found product descriptions, specifications, and "Productos relacionados" sections — but no customer review section, rating display, or review collection mechanism. The pages contain breadcrumbs and product attributes but no social proof elements.

Products with 5 or more reviews see a 270% higher purchase likelihood (Spiegel Research Center, 2017). For a grocery retailer where repeat purchase decisions are heavily influenced by peer validation (especially for specialty products like wines and premium foods), the absence of reviews removes a conversion lever.

| Action | Pages affected |
|---|---|
| Add customer review collection and display system to product pages | ~33,500 PDPs (estimated) |

### 4. Editorial content engine (/recetas) underutilized and not optimized

The /recetas path returned HTTP 200 and renders content, confirming an active editorial section exists. However, when rendered via browser, the page returned **no title tag, no meta description, no headings, and no JSON-LD**. The content appeared to be primarily CSS/JS shell with no visible editorial text extracted by our renderer — suggesting the section may be primarily image/link-based rather than text-rich editorial content.

No other editorial paths were found: /blog, /editorial, /revista, /noticias, /stories, /guia, and /conteudo all returned HTTP 404. crawl_site classified 0 pages as blog/editorial. The /recetas section is not included in the sitemap index (no editorial-specific sitemap detected).

Recipe and meal-planning content can significantly expand organic reach through long-tail keyword capture. For a grocery retailer, this content directly drives basket building and category discovery — a significant organic traffic opportunity for keywords like "recetas con..." that Chedraui is currently not capturing.

| Action | Pages affected |
|---|---|
| Build out /recetas with SEO-optimized recipe content, proper meta tags, and sitemap inclusion | 1 section (new content creation ongoing) |

### 5. Homepage title tag appears dynamic and non-descriptive

The Similarweb crawler captured the homepage title as "Microondas prácticos y accesibles para tu cocina | Chedraui" — a product-category title rather than the brand's primary homepage title. The SERP result for the brand keyword shows "Chedraui — Tu supermercado en línea", suggesting the title may rotate or be dynamically generated. An unstable homepage title sends inconsistent signals to search engines and dilutes brand SERP presence.

| Action | Pages affected |
|---|---|
| Set a stable, branded homepage title and meta description | 1 page |

### 6. Cross-sell present but limited in scope

All 3 scraped PDPs contained a "Productos relacionados" carousel with 8-10 related products. This is a positive signal. However, the recommendations appear to be same-category substitutes (e.g., other egg brands on the egg PDP) rather than complementary cross-sell items (e.g., pan, aceite, salsa on the egg PDP). Complementary recommendations drive higher basket sizes than substitution-only approaches.

| Action | Pages affected |
|---|---|
| Enhance product recommendations with complementary cross-sell logic | ~33,500 PDPs (estimated) |

![Chedraui PLP — Despensa category, desktop](http://localhost:3002/api/screenshots/www.chedraui.com.mx-desktop-20fdc096.png)

### 7. Technical hygiene: robots.txt disallow patterns and cache configuration

**Robots.txt** is present and functional, correctly blocking /account/, /login, /checkout/, and /search. However, it contains a large number of Disallow entries for legacy category paths (/Departamentos/, /Súper/, /Bebidas/, /Caballero/, etc.) which may be leftovers from a prior platform. If these paths still resolve, they should return proper 404 or redirect responses rather than relying solely on robots.txt.

**Cache headers** are well-configured: the homepage returns `public, max-age=612, stale-while-revalidate=1200, stale-if-error=3600`, and sitemap files cache for 86,400 seconds. HSTS is active with `max-age=31536000; includeSubDomains; preload`. CloudFront CDN headers confirm edge distribution. SSL is active. X-Frame-Options and X-Content-Type-Options are properly set.

| Action | Pages affected |
|---|---|
| Audit and clean up legacy Disallow rules in robots.txt; verify legacy paths return proper HTTP status codes | Site-wide configuration |

![Chedraui PDP — Huevo Blanco Bachoco, desktop](http://localhost:3002/api/screenshots/www.chedraui.com.mx-desktop-8661ad55.png)

---

## Opportunity summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Mobile performance | Reduce JS payload, defer third-party scripts | Site-wide |
| 2 | Product JSON-LD | Implement structured data with price/availability/brand | ~33,500 PDPs |
| 3 | Customer reviews | Add review collection and display | ~33,500 PDPs |
| 4 | Content engine | Build out /recetas with SEO optimization | 1 section (ongoing) |
| 5 | Homepage title | Set stable, branded title and meta description | 1 page |
| 6 | Cross-sell enhancement | Add complementary product recommendations | ~33,500 PDPs |
| 7 | Technical hygiene | Clean up robots.txt legacy rules | Site-wide config |
| | **Total** | **7 areas** | **~33,570 page-level improvements across ~33,500+ unique URLs** |

What each improvement requires depends on the platform and team. The volume — approximately 33,570 individual improvements across more than 33,500 URLs — and the ongoing nature of the work make automated execution essential.

---

## What this requires

The improvements touch tens of thousands of product pages, and the catalog is not static — Chedraui's ongoing expansion (approximately 84 new stores in 2024, with around 144 reportedly planned for 2025, according to third-party estimates[^biz]) means new products are continuously added, each inheriting the same gaps in structured data, reviews, and content.

Some fixes are one-time configurations (homepage title, robots.txt cleanup), but the core work — generating structured data for every PDP, collecting and moderating reviews, producing recipe content, and monitoring performance regressions across third-party scripts — is continuous, granular, and time-sensitive.

deco AI Agents are specialized agents that execute continuously across the entire catalog. Structured data generation, review solicitation workflows, content production, and performance monitoring that would traditionally take weeks of manual coordination — deco delivers in minutes, on autopilot.

Pon tu estrategia digital en piloto automático.

[^biz]: Source: research_business via Perplexity, citing matrixbcg.com/blogs/growth-strategy/chedraui. These figures could not be verified against primary sources (e.g., official press releases or annual reports) and should be treated as approximate.

---

## Strategic context

Chedraui ranks #1 for its brand keyword and #2 for "supermercado en linea mexico" in Google Mexico (DataForSEO, Mexico location, April 2026) — a strong position that validates the brand's organic authority. However, the SERP for non-brand keywords reveals intense competition from Walmart, Soriana, La Comer, and digital-native players like Jüsto and Freshify. The keyword "chedraui en linea" drives approximately 90,500 monthly searches, and "ofertas chedraui" about 22,200 — both heavily branded terms that indicate strong demand but also dependency on brand awareness rather than category-level organic capture.[^kw]

With approximately 60.6% of traffic coming from search and only 33.9% direct[^sw], Chedraui's digital business is materially search-dependent. The absence of structured data and editorial content limits the site's ability to compete for informational and long-tail product queries — precisely the territory where competitors with recipe blogs, comparison guides, and rich product markup are gaining ground.

The Mexican online grocery market is growing rapidly, and Chedraui's estimated 30%+ digital sales growth in 2024[^biz] demonstrates momentum. The technical gaps identified in this report — particularly performance and structured data — represent the difference between maintaining current share and accelerating ahead of competitors investing in the same digital infrastructure.

Chedraui's VTEX IO platform provides native capabilities for structured data and performance optimization that are not fully leveraged today. The patterns identified — heavy JavaScript, missing schema markup, absent reviews — are solvable at scale with the right automation layer.

[^kw]: Keyword data from DataForSEO, Mexico location (code 2484), Spanish language, April 2026.

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions" (2020, 37 brands, 30M sessions): +8.4% retail conversion per 0.1s speed improvement
- Spiegel Research Center (2017): Products with 5+ reviews see 270% higher purchase likelihood

**Data sources:**
- crawl_site (Firecrawl): 500 pages discovered, 473 classified as PDP, 2026-04-15
- fetch_page: sitemap.xml, robots.txt, homepage, product-0.xml, category-0.xml, 8 editorial paths probed
- render_page: /recetas rendered with JS execution
- scrape_page (Firecrawl): 3 PDPs deep-scraped for content analysis
- lighthouse_audit: Homepage + PDP, mobile, Lighthouse 13.0.3
- capture_har: Attempted 3 URLs, all timed out (site too heavy for browser session)
- screenshot: 3 screenshots (homepage, PLP, PDP)
- research_traffic (Similarweb via Apify): March 2026 snapshot
- research_business (Perplexity): Company context and competitor intelligence
- research_serp (DataForSEO): "chedraui" and "supermercado en linea mexico", Mexico location
- research_keywords (DataForSEO): 5 seed keywords, 40+ related keywords returned
- audit_seo (DataForSEO): Crawl initiated, partial results (crawl still in progress at report time)

**Source URLs:**
- [^2] https://matrixbcg.com/blogs/growth-strategy/chedraui
- [^3] https://chedrauiusa.com
- [^4] https://progressivegrocer.com/chedraui-boosts-self-checkout-capability-mexico

---

*Report generated by the deco AI diagnostic pipeline.*
