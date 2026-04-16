# Diagnostic Report: PlazaVea (InRetail / Intercorp)

> **Date:** 2026-04-15 | **URL:** plazavea.com.pe | **Platform:** VTEX Classic (Portal v1.8.0) | **Monthly visits:** ~7.6M (March 2026) | **Category:** E-commerce & Shopping / Marketplace | **Global rank:** #7,409 | **Peru rank:** #63

**Health Score: 34/100** — Structured Data 0/20 | Content Engine 0/15 | Product SEO 5/15 | Performance 3/20 | Social Proof 0/10 | Cross-sell 3/10 | Domain Signals 8/10

**Site inventory:** The sitemap index contains 401 product sitemaps (product-0.xml through product-400.xml), 2 category sitemaps, and 8 brand sitemaps. We measured approximately 200 product URLs in product-0.xml; product-400.xml also contains active product URLs. Given the index structure, the catalog spans hundreds of sitemaps with an estimated large product count — but we did not fetch and count every sitemap file, so the exact total is not measured. The category sitemaps contain hundreds of PLPs across departments including Supermercado, Tecnología, Electrohogar, Mejoramiento del Hogar, Muebles, Belleza, and more. No editorial or blog pages were detected.[^inventory]

[^inventory]: Catalog size based on sitemap index at /sitemap.xml (401 product sitemaps, verified product-0.xml and product-400.xml both active). Category count from category-0.xml and category-1.xml. Editorial discovery via path probing (/blog, /editorial, /revista, /recetas, /guia, /magazine, /stories, /noticias, /inspira — all returned product category pages, not editorial content), crawl_site classification (0 blog pages), and content analysis of rendered pages.

---

## Improvement opportunities identified on plazavea.com.pe

We identified **7 areas of improvement** representing an estimated **thousands of page-level improvements** across the product catalog and category pages. The most impactful findings are severe mobile performance degradation (Lighthouse 29-39 with LCP up to 15.8s on product pages), the absence of structured data (JSON-LD) across all sampled pages, and template-based meta descriptions that limit organic CTR for the catalog.

![PlazaVea Homepage](http://localhost:3002/api/screenshots/www.plazavea.com.pe-desktop-3772a34c.png)

---

## Opportunities

### 1. Mobile performance is materially limiting conversion

Lighthouse measured the homepage at **39/100** and a product page at **29/100** on mobile. Core Web Vitals tell the story:

| Metric | Homepage | PDP (Sporade) | Good threshold |
|---|---|---|---|
| LCP | 7.4 s | 15.8 s | < 2.5 s |
| TBT | 4,550 ms | 2,950 ms | < 200 ms |
| FCP | 3.1 s | 5.1 s | < 1.8 s |
| TTI | 17.9 s | 19.2 s | < 3.8 s |
| CLS | 0.003 | 0.042 | < 0.1 |
| Total page weight | 2,086 KiB | 3,109 KiB | — |

The homepage requires 12.2 seconds of main-thread work and 5.9 seconds of JavaScript execution time. The PDP is worse: 13.2 seconds of main-thread work, 8.5 seconds of JS execution, with 361 KiB of unused JavaScript. Both pages exceeded the 30-second navigation timeout in our full browser tests (capture_har), which means that under real-world conditions the site may fail to fully load for users on slower connections.

Lighthouse flagged unused JavaScript (242-361 KiB of estimated savings) as the primary bottleneck. The VTEX Classic Portal architecture, combined with heavy client-side rendering, contributes to these numbers.

The business impact is direct. Research shows every 0.1s of mobile speed improvement drives an 8.4% conversion lift in retail (Deloitte, "Milliseconds Make Millions", 2020). With LCP exceeding the good threshold by 3-5x, PlazaVea is leaving measurable revenue on the table across approximately 7.6 million monthly visits.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload and defer non-critical scripts | Site-wide (all page types) |
| Optimize LCP element rendering | Site-wide |

### 2. Structured data (JSON-LD) not detected on any sampled page

The DataForSEO audit (100 pages crawled) reported structured data on none of the pages sampled. Our manual inspection of 3 scraped PDPs confirmed this: none contained Product, BreadcrumbList, or Organization JSON-LD markup. The PDP HTML uses Open Graph `product:` prefixes in the head, but these are not a substitute for JSON-LD structured data that Google uses for rich snippets.

Without Product structured data, PlazaVea's product pages cannot display price, availability, or review stars in search results. Rich snippets increase CTR by 20-40% (industry estimates vary; no single peer-reviewed source). For a site where 67.6% of traffic comes from search, this represents a significant missed opportunity.

The breadcrumb navigation is present in the rendered HTML (e.g., plazaVea > Bebidas > Bebidas Funcionales > Bebidas Rehidratantes), but without BreadcrumbList JSON-LD, Google cannot reliably display structured breadcrumbs in SERPs.

| Action | Pages affected |
|---|---|
| Add Product JSON-LD (name, price, availability, brand, image) to product pages | All product pages (401 product sitemaps) |
| Add BreadcrumbList JSON-LD to product and category pages | All product and category pages |

### 3. No customer reviews detected on product pages

Of 3 PDPs scraped (Sporade beverage, Tacama wine, LED lamp), none contained a visible customer review section or rating display. The cross-sell section headers ("Productos que te pueden interesar", "Los clientes también compraron") are present in the DOM, but no review or rating UI was detected in any sampled page.

Products with 50+ reviews convert at 2-3x the rate of products without reviews (Bazaarvoice / Spiegel Research Center). For a grocery and general merchandise retailer with PlazaVea's scale, even a modest post-purchase review request program (5-15% response rate, industry average) could build a meaningful review corpus quickly given the transaction volume.

Beyond conversion, reviews provide unique user-generated content per product — the kind of content that differentiates PDPs in search results and supports long-tail keyword capture.

| Action | Pages affected |
|---|---|
| Implement review collection and display system on PDPs | All product pages |

### 4. Template meta descriptions limit organic CTR

All 3 sampled PDPs follow the same pattern:
- "¡Compra Online [Product Name] desde donde estés en plazaVea.com.pe!"
- "¡Compra online [Product Name] desde donde estés en plazaVea.com.pe!"

The DataForSEO audit also flagged 3 duplicate meta descriptions among the 100 pages crawled. While a template approach ensures coverage, it produces generic SERP snippets that fail to differentiate individual products. Unique, keyword-rich descriptions that include product attributes (brand, size, key benefit) are broadly associated with improved organic traffic per PDP, with industry practitioners commonly citing gains in the 30-50% range.

The PLPs have better differentiation — `/supermercado` has "Aprovecha descuentos y promociones para tu hogar" and `/tecnologia` has "Descubre lo mejor en Tecnología en plazaVea.com.pe" — but the sheer volume of product pages makes PDP meta descriptions the larger opportunity.

| Action | Pages affected |
|---|---|
| Generate unique, attribute-rich meta descriptions for PDPs | All product pages |

### 5. 32 pages missing H1 tags and content structure issues

The SEO audit identified 32 out of approximately 100 crawled pages that are missing H1 tags. Additionally, 16 pages were flagged as duplicate content. The H1 absence is notable because VTEX Classic templates can sometimes render headings inconsistently across page types.

The category-0.xml sitemap contains hundreds of hierarchical PLPs (e.g., /abarrotes/menestras/lenteja, /belleza/cuidado-facial/crema-facial). These deep taxonomy pages are valuable for mid-tail search queries, but only if they have proper heading structure and unique content.

| Action | Pages affected |
|---|---|
| Ensure H1 tags are present and unique on all page types | At least 32 pages identified, likely more across full catalog |

### 6. No editorial content engine detected

We probed 9 editorial paths (/blog, /editorial, /revista, /recetas, /guia, /magazine, /stories, /noticias, /inspira) — all returned HTTP 200 but are product category pages, not editorial content. The `/editorial` path is a books PLP ("Novelas Juveniles, Libros de Ficción"), `/magazine` is a clothing PLP ("Polos Hombre"), and `/recetas` shares the generic homepage meta description. The crawl_site analysis classified none of the 500 discovered pages as blog content. The DataForSEO audit detected 0 blog posts.

For a supermarket brand, editorial content (recipes, seasonal guides, nutrition tips) is a natural fit. Companies with active blogs are widely reported to generate meaningfully more organic visitors — a figure commonly cited in content marketing literature, though originating primarily from vendor research. With "plaza vea" commanding 673,000 monthly searches in Peru (DataForSEO, Peru, March 2026) and related terms like "plaza vea catalogo" (4,400/mo) and "plaza vea ofertas" (2,900/mo), recipe and buying-guide content could capture informational queries that currently bypass the site.

| Action | Pages affected |
|---|---|
| Establish editorial content program (recipes, buying guides, seasonal content) | New pages (ongoing) |

### 7. Technical hygiene items

**Cache headers:** The homepage returns `cache-control: public, max-age=0, s-maxage=120` — a 2-minute CDN TTL with no browser cache. Product pages return the same. The robots.txt returns `cache-control: private`. Short TTLs are common for grocery e-commerce where prices change frequently, but static assets could benefit from longer browser cache durations.

**Robots.txt:** Well-structured. Disallows `/checkout` and 3 brand sitemaps (brand-1, brand-2, brand-3). Points to sitemap.xml correctly. The brand sitemap disallows are unusual and may limit indexation of those brand landing pages.

**SSL, HTTP/2, sitemap:** All confirmed working by the DataForSEO audit. On-page score was 93.87 out of 100 for domain-level signals.

**Cross-sell sections:** The PDP templates include section headers for "Productos que te pueden interesar", "Recomendado para ti", "Los clientes también compraron", and "Productos patrocinados" — but in our scraped content, these sections appeared as empty headers without rendered product carousels. This suggests the recommendations may be loaded asynchronously via JavaScript and were not populated at scrape time. Average AOV uplift from effective cross-sell is 8-15% (Baymard Institute).

| Action | Pages affected |
|---|---|
| Verify cross-sell widget rendering and ensure SSR or fast hydration | All product pages |
| Review brand sitemap disallows in robots.txt | Site-wide config |

![PlazaVea Supermercado PLP](http://localhost:3002/api/screenshots/www.plazavea.com.pe-desktop-bd594a76.png)

---

## Opportunity Summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Mobile performance | Reduce JS payload, optimize LCP, defer non-critical resources | Site-wide |
| 2 | Structured data (JSON-LD) | Add Product + BreadcrumbList schemas | All product + category pages |
| 3 | Customer reviews | Implement review collection and display | All product pages |
| 4 | Meta descriptions | Generate unique, attribute-rich descriptions | All product pages |
| 5 | H1 tags and content structure | Ensure H1 presence and uniqueness | 32+ pages identified |
| 6 | Editorial content engine | Launch recipe/guide content program | New pages (ongoing) |
| 7 | Technical hygiene | Cross-sell rendering, cache, robots.txt cleanup | Site-wide config |
| **Total** | **7 areas** | | **Thousands of page-level improvements across the product catalog and category taxonomy** |

What each improvement requires depends on the platform and team structure. The volume — improvements spanning a catalog of hundreds of product sitemaps and hundreds of category pages — and the ongoing nature of the work (new products inherit the same gaps, seasonal content requires continuous production, review collection never stops) make automated execution essential.

---

## What this requires

The improvements touch every product page and category page in a catalog that spans 401 product sitemaps and hundreds of category URLs. This is not a static scope — PlazaVea's catalog rotates with seasonal inventory, promotions, and new supplier onboarding, meaning new products inherit the same structural gaps the moment they're published.

Some fixes are one-time (structured data templates, performance optimization, H1 corrections). But the most valuable work — generating unique meta descriptions per product, collecting and moderating reviews, producing editorial content, monitoring page speed as the catalog evolves — is continuous, granular, and time-sensitive.

deco AI Agents are purpose-built for this type of execution: specialized agents that continuously audit, generate, and optimize at the page level across the entire catalog. What traditionally takes weeks of manual work per batch, deco delivers in minutes, on autopilot.

Run your digital strategy on autopilot.

---

## Strategic context

PlazaVea holds a commanding position in Peru's online grocery market. The brand ranks #1 for both "plaza vea" (673,000 monthly searches) and "supermercado online peru" in organic search results.[^serp] With an estimated US$234 million in online GMV and projected 10-15% growth for 2026 (based on publicly available estimates from ecdb.com, marketing4ecommerce.net, and InRetail corporate presentations; figures are approximate and unaudited), the digital channel is a significant revenue driver for the InRetail / Intercorp group.[^biz] The competitive landscape includes Wong, Metro, and Tottus — all actively investing in e-commerce capabilities.

PlazaVea's traffic profile is heavily search-dependent: approximately 67.6% of visits arrive via search, with only 29.1% direct traffic and minimal social (0.5%) or email (0.02%) contribution.[^sw] This search concentration makes the structural SEO gaps especially consequential. The top keywords driving traffic are predominantly branded ("plaza vea" at 116,860 volume, "plazavea" at 14,270), meaning the current search strategy captures existing demand but does relatively little to acquire new shoppers through category or informational queries.

The competitive dynamic is shifting. Wong and Metro, both operated by Cencosud, are investing in digital capabilities, while Tottus (Falabella group) brings marketplace technology expertise. PlazaVea's VTEX Classic architecture, while functional, shows its age in the performance metrics — and performance is increasingly a competitive differentiator as Peruvian shoppers become more digitally sophisticated. The AI traffic share data shows early signals of AI-driven discovery (approximately 9.4% from ChatGPT, 12.4% from Gemini), suggesting that structured data and content quality will become increasingly important as AI-mediated shopping grows.[^sw]

The absence of editorial content represents a strategic gap. For a supermarket brand with deep category expertise (fresh produce, wines, seasonal cooking), recipe content and buying guides are natural extensions that competitors have not yet dominated in the Peruvian market. This is an opportunity to build organic authority in informational queries before competitors move.

[^serp]: DataForSEO SERP API, location: Peru (2604), language: es, date: 2026-04-15.
[^biz]: According to market research (ecdb.com, marketing4ecommerce.net, InRetail corporate presentations). Figures are approximate and based on publicly available estimates.
[^sw]: Similarweb data via Apify scraper, March 2026 snapshot. Panel-based estimates, not first-party data. Traffic source percentages are approximate.

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions", 2020 (37 brands, 30M sessions): +8.4% conversion per 0.1s mobile speed improvement in retail
- Rich snippets increase CTR by 20-40% (industry estimates vary; no single peer-reviewed source)
- Bazaarvoice / Spiegel Research Center: Products with 50+ reviews convert at 2-3x vs. no reviews
- Unique product descriptions broadly associated with improved organic traffic per PDP (industry practitioners commonly cite 30-50% gains)
- Companies with active blogs are widely reported to generate meaningfully more organic visitors (commonly cited in content marketing literature, though originating primarily from vendor research)
- Baymard Institute: Average AOV uplift with cross-sell: 8-15%
- Post-purchase review request emails: 5-15% response rate (industry average)

**Data sources:**
- fetch_page: Homepage, robots.txt, sitemap.xml, product sitemaps (product-0.xml, product-400.xml), category sitemaps (category-0.xml), 3 PDPs, 2 PLPs, 9 editorial path probes — April 15, 2026
- crawl_site: 500 pages discovered via Firecrawl — April 15, 2026
- lighthouse_audit: Homepage (mobile) and PDP (mobile) via Lighthouse 13.0.3 — April 15, 2026
- capture_har: Homepage, PLP, PDP — all timed out at 30s, confirming performance issues
- audit_seo: DataForSEO on-page audit, ~100 pages — April 15, 2026
- scrape_page: 3 PDPs via Firecrawl — April 15, 2026
- research_serp: DataForSEO, keywords "plaza vea" and "supermercado online peru", location Peru (2604), April 15, 2026
- research_keywords: DataForSEO, 5 seed keywords, location Peru (2604), April 15, 2026
- research_traffic: Similarweb via Apify, domain plazavea.com.pe, March 2026 snapshot
- research_business: Perplexity web-grounded AI synthesis, April 15, 2026
- screenshot: Homepage desktop, Supermercado PLP desktop — April 15, 2026

**Source URLs (from research_business citations):**
- https://ecdb.com/resources/sample-data/retailer/plazavea
- https://marketing4ecommerce.net/en/how-to-sell-in-plazavea-one-of-the-main-online-supermarkets-in-peru/
- https://www.inretail.pe/Public/Q2'25%20Corporate%20Presentation_InRetail.pdf
- https://cibuslink.it/en/supermercados-peruanos-ante-su-punto-de-inflexion-2026-marca-el-inicio-de-una-nueva-arquitectura-del-retail-en-peru/

---

*Report generated by the deco AI diagnostic pipeline.*
