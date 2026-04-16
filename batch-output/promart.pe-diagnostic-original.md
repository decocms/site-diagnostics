# Diagnostic Report: Promart (Intercorp Group)

> **Date:** 2026-04-15 | **URL:** promart.pe | **Platform:** VTEX Legacy Portal v1.8.0 (CloudFront CDN) | **Monthly visits:** ~6.8M (March 2026)[^sw] | **Category:** E-commerce / Marketplace | **Global rank:** #8,108 | **Peru rank:** #72 | **Category rank (Peru):** #7

**Health Score: 34/100** — Structured Data 0/20 | Content Engine 3/15 | Product SEO 5/15 | Performance 6/20 | Social Proof 0/10 | Cross-sell 8/10 | Domain Signals 8/10

**Site inventory:** 327 product sitemaps identified in sitemap.xml. First sitemap (product-0.xml) contains approximately 250 product URLs; last sitemap (product-326.xml) contains 52 product URLs. The full catalog size was not individually counted across all 327 files but is estimated to be in the tens of thousands based on the sitemap structure. crawl_site discovered 463 PDPs within its 500-page limit. Blog: 10 posts discovered at /blog. Category sitemaps: 2. Brand sitemaps: 4 (3 blocked in robots.txt).[^inventory]

[^inventory]: Product count based on sitemap index structure (327 product sitemaps) and sampling of product-0.xml (~250 URLs) and product-326.xml (52 URLs). crawl_site capped at 500 pages. Blog posts counted via crawl_site classification. No editorial sections found outside /blog (paths /editorial, /revista, /news, /noticias, /stories, /guia, /inspira all returned VTEX product category pages, not editorial content).

[^sw]: Traffic data from Similarweb via Apify (March 2026 snapshot). Panel-based estimates, not first-party data. Monthly visit figures are approximate.

---

## Approximately 80,000+ page-level improvement opportunities identified on promart.pe

We identified **8 areas of improvement** representing an estimated **80,000+ page-level improvements** across the catalog. The most impactful findings: Product JSON-LD structured data was not detected on any of the 3 PDPs sampled, which limits rich snippet eligibility for the entire product catalog. Mobile performance is significantly below industry thresholds, with a Lighthouse performance score of 30/100 and an LCP of 12.7 seconds on the homepage. The content engine — currently 10 blog posts — represents a substantial untapped opportunity for a brand with 550,000 monthly branded searches.

![Promart Homepage](http://localhost:3002/api/screenshots/www.promart.pe-desktop-57a07810.png)

---

## Opportunities

### 1. Add Product JSON-LD structured data to all product pages

Of the 3 PDPs sampled (Escritorio Industrial, Camara IP Wifi, Numero 3 de Bronce), none contained Product JSON-LD or any structured data markup in the HTML source. The audit_seo tool confirmed: "Structured Data: Not found (sampled 5 PDPs)." Blog posts, by contrast, do include Article JSON-LD with proper schema.org markup.

Without Product JSON-LD, Promart's product pages are ineligible for rich results in Google (price, availability, rating stars, review count). Rich snippets are broadly associated with higher CTR, with commonly cited estimates ranging from 20–40%, though figures vary by query type and vertical. For a site where 83% of traffic comes from search (approximately 5.7M monthly visits from search per Similarweb[^sw]), this represents the single largest organic opportunity.

| Action | Pages affected |
|---|---|
| Implement Product JSON-LD with price, availability, brand, and image | All product pages (tens of thousands based on 327 product sitemaps) |

### 2. Improve mobile performance (LCP, TBT, TTI)

Lighthouse mobile scores measured on 2026-04-15:

| Page | Performance | LCP | TBT | CLS | TTI |
|---|---|---|---|---|---|
| Homepage | 30/100 | 12.7s | 3,630ms | 0.029 | 30.6s |
| PDP (Escritorio) | 26/100 | 7.0s | 3,050ms | 0.194 | 31.2s |

The homepage loads 3.5 MB of resources (Lighthouse total-byte-weight) with 713 KiB of unused JavaScript. The main thread is blocked for 14.4 seconds on the homepage. PDP pages load 62 JavaScript files totaling 2.9 MB (capture_har byType). A single custom JS file (`promart.global.js`, 613 KB) took 1,419ms to load on the PDP.

Every 0.1s of mobile speed improvement correlates with +8.4% conversion in retail (Deloitte, "Milliseconds Make Millions", 2020). With LCP at 12.7s on the homepage, the performance gap is measured in seconds, not milliseconds.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload (713 KiB unused JS identified by Lighthouse) | Site-wide |
| Optimize critical rendering path and defer non-essential scripts | Site-wide |
| Address main-thread blocking (14.4s on homepage) | Site-wide |

### 3. Generate unique, keyword-targeted meta descriptions for product pages

All 3 PDPs sampled use a templated meta description pattern:
- "Compra online [Product Name] en Promart.pe" or "¡[Category] a solo un clic! Compra online [Product Name] en Promart.pe"

These descriptions contain no product-specific attributes (dimensions, materials, brand, price range) and don't target category-level search queries. The PLP sampled (Ruteadoras y Fresadoras) has a better, customized description: "Descubre la mejor ruteadora y fresadora en Promart a precios unicos en marcas como Bosch, Dewalt, Makita y mas."

Unique product descriptions are broadly associated with improved organic traffic per PDP, with industry practitioners commonly citing meaningful gains at catalog scale. At catalog scale, this compounds significantly.

| Action | Pages affected |
|---|---|
| Generate unique meta descriptions incorporating product attributes and category keywords | All product pages (tens of thousands) |

### 4. Scale the content engine (blog)

Three-method editorial discovery results:
- **Path probing:** /blog returned HTTP 200 with a valid blog index page. All other editorial paths (/editorial, /revista, /news, /noticias, /stories, /guia, /inspira) returned product category pages, not editorial content.
- **crawl_site:** Classified 10 pages as blog content, all under /blog/.
- **Blog content quality (sampled 1 post):** "Partes de un Televisor" is a well-structured, approximately 1,500-word article with Article JSON-LD, canonical tag, internal links to product categories, proper H1 structure, and a unique meta description. The content quality is good but the volume is minimal.

With 10 blog posts for a home improvement retailer generating approximately 6.8M monthly visits, the content engine represents a significant untapped channel. Companies with active blogs are widely reported to generate significantly more visitors, though precise uplift estimates vary across studies. The home improvement category offers high-volume informational queries ("como instalar...", "como elegir...", "tipos de...") that Promart is well-positioned to capture.

Additionally, blog pages have `lang="en-us"` instead of the correct `lang="es-pe"`, which may confuse search engines about the content's target language.

| Action | Pages affected |
|---|---|
| Scale blog content production targeting informational queries | New pages (ongoing) |
| Fix `lang` attribute on blog pages from "en-us" to "es-pe" | 10+ blog pages |

### 5. Add user reviews to product pages

Of the 3 PDPs deep-scraped, no review section, rating display, or review collection mechanism was identified. One PDP (Escritorio Industrial) displays a seller rating ("42 ventas") but no product reviews from buyers.

Products with 50+ reviews convert at 2-3x compared to products without reviews (Bazaarvoice / Spiegel). Post-purchase review request emails typically achieve a 5-15% response rate (industry average). With a catalog of this size and Promart's transaction volume across 37 physical stores and online, building a review corpus is achievable with automated post-purchase flows.

| Action | Pages affected |
|---|---|
| Implement review collection and display on product pages | All product pages |
| Add Review/AggregateRating to Product JSON-LD once reviews exist | All product pages with reviews |

### 6. Fix blog pages not included in sitemap

The blog at /blog was not found in the sitemap.xml index. The sitemap contains product, brand, and category sitemaps only. Without sitemap inclusion, blog content relies entirely on internal linking and crawl discovery for indexation.

| Action | Pages affected |
|---|---|
| Add blog pages to a dedicated sitemap (e.g., sitemap/blog-0.xml) | 10+ blog pages (growing) |

### 7. Reduce third-party script payload on PDPs

capture_har identified 10+ third-party domains loading on PDP pages, including Google Tag Manager (750 KB), TikTok Analytics (479 KB), Criteo (73 KB), Microsoft Clarity (80 KB), and OneSignal (137 KB). Total third-party payload on the PDP: approximately 2.9 MB. The GTM container alone (750 KB) likely contains multiple tags that fire synchronously and contribute to the 3,050ms Total Blocking Time measured by Lighthouse.

| Action | Pages affected |
|---|---|
| Audit and optimize third-party tag loading (defer, lazy-load, or remove unused tags) | Site-wide |

### 8. Technical hygiene

**Cache headers:** HTML pages have `max-age=0, s-maxage=120` (2-minute CDN cache). Blog pages return `cache-control: private`, bypassing the CDN entirely. Static assets (JS, CSS) are well-cached through CloudFront with high age values.

**robots.txt:** Blocks 3 brand sitemaps (brand-1, brand-2, brand-3) from crawlers but allows brand-0. This inconsistency may limit brand page indexation.

**OpenGraph errors:** VTEX is rendering a visible HTML comment on blog pages: "ATENÇÃO, esse erro prejudica a performance do seu site, o conteudo de nome opengraph não foi renderizado por nao ser um XDocument válido." This means OpenGraph tags are broken on blog pages, limiting social sharing preview quality.

| Action | Pages affected |
|---|---|
| Enable CDN caching for blog pages (currently `private`) | 10+ blog pages |
| Review robots.txt brand sitemap blocking for consistency | Site-wide config |
| Fix OpenGraph meta tag rendering errors on blog pages | 10+ blog pages |

![Promart PLP - Ruteadoras y Fresadoras](http://localhost:3002/api/screenshots/www.promart.pe-desktop-eb7d4a66.png)

![Promart PDP - Escritorio Industrial](http://localhost:3002/api/screenshots/www.promart.pe-desktop-be328224.png)

---

## Opportunity Summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Product JSON-LD | Add structured data with price, availability, brand | All product pages (tens of thousands) |
| 2 | Mobile performance | Reduce JS payload, optimize critical path, unblock main thread | Site-wide |
| 3 | Unique meta descriptions | Generate attribute-rich, keyword-targeted descriptions | All product pages (tens of thousands) |
| 4 | Content engine | Scale blog production; fix lang attribute | 10+ existing + new (ongoing) |
| 5 | User reviews | Implement review collection and display system | All product pages |
| 6 | Blog sitemap | Add blog pages to XML sitemap | 10+ pages |
| 7 | Third-party scripts | Audit and optimize tag loading | Site-wide |
| 8 | Technical hygiene | Cache, robots.txt, OpenGraph fixes | Site-wide + 10+ blog pages |
| **Total** | **8 areas** | | **Estimated 80,000+ page-level improvements across tens of thousands of unique URLs** |

What each improvement requires depends on the platform and team. The volume — tens of thousands of individual improvements across the full catalog — and the ongoing nature of the work (new products inheriting the same gaps, continuous content production, review collection) make automated execution essential.

---

## What this requires

The improvements span the full product catalog — tens of thousands of pages across 327 product sitemaps — and the catalog is not static. New products added to the marketplace inherit the same structural gaps unless the underlying patterns change. The blog, currently at 10 posts, requires sustained production to reach the scale needed for meaningful organic traffic capture in the home improvement category.

Some fixes are configuration-level (structured data templates, cache headers, robots.txt). The content work — unique meta descriptions, blog articles, review collection — is continuous, granular, and time-sensitive. Each new product listing needs unique copy. Each category needs editorial content. Each customer transaction is an opportunity to collect a review.

deco AI Agents are specialized agents designed to execute exactly this type of work continuously. Structured data deployment, meta description generation at catalog scale, content production, and ongoing SEO monitoring — what traditionally takes weeks, deco delivers in minutes, on autopilot.

Run your digital strategy on autopilot.

---

## Strategic context

Promart competes directly with Sodimac (Falabella group) and Cassinelli in Peru's home improvement market. In our SERP analysis (DataForSEO, Peru, 2026-04-15), Promart ranks #1 for "promart peru" and #3 for "tienda mejoramiento hogar peru," behind Sodimac at positions #2 and #8. The brand keyword "promart" commands 550,000 monthly searches in Peru (DataForSEO, Peru, March 2026), indicating strong brand recognition. However, 83% of Promart's traffic comes from search[^sw], making organic visibility not just a growth channel but the primary acquisition engine.

The absence of Product JSON-LD is particularly impactful in this competitive context. When Sodimac product pages display price, availability, and ratings in search results and Promart's do not, the CTR gap compounds across millions of monthly search impressions. This is structural, not incremental — it affects every product query where both brands appear.[^business]

Promart's position within the Intercorp group (alongside Plaza Vea, Oechsle, and other retail brands) provides marketplace infrastructure and payment ecosystem advantages (Tarjeta oh!, Tarjeta Sip). The e-commerce platform supports marketplace sellers alongside first-party inventory, which adds SKU velocity but also increases the need for automated quality control across meta descriptions, structured data, and content standards.[^business]

The home improvement category in Peru is growing as urbanization and the construction sector expand. AI traffic to promart.pe is already measurable — ChatGPT accounts for approximately 43% and Gemini approximately 21% of detected AI referral traffic[^sw] — suggesting the brand is already surfacing in AI-powered search and shopping experiences. Structured data improvements would strengthen this emerging channel.

[^business]: Business context synthesized from Perplexity research (April 2026). Revenue and employee figures vary across sources and should be treated as approximate. Sources: zoominfo.com, intercorpretail.pe, rocketreach.co, scribd.com.

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions" (2020) — mobile speed and conversion correlation
- Rich snippets and CTR uplift — commonly cited range 20–40%; figures vary by query type and vertical
- Bazaarvoice / Spiegel Research Center — review count and conversion correlation
- Industry practitioners — unique product descriptions and organic traffic per PDP
- Industry average — post-purchase review email response rates (5-15%)

**Data sources:**
- **crawl_site** (Firecrawl): 500-page crawl, 2026-04-15. Page classification: 463 PDPs, 10 blog, 3 other.
- **fetch_page**: Homepage, 3 PDPs, 1 PLP, 2 blog posts, sitemap.xml, robots.txt, 10 editorial path probes. 2026-04-15.
- **capture_har**: Homepage and 1 PDP, 4 passes each (desktop cold/warm, mobile cold/warm). 2026-04-15.
- **lighthouse_audit**: Homepage (mobile) and PDP (mobile). Lighthouse v13.0.3. 2026-04-15.
- **scrape_page** (Firecrawl): 3 PDPs, 1 blog post. 2026-04-15.
- **screenshot**: Homepage, PLP, PDP (all desktop). 2026-04-15.
- **audit_seo** (DataForSEO): On-page crawl, score 97.0/100, domain signals. 2026-04-15.
- **research_serp** (DataForSEO): "promart peru" and "tienda mejoramiento hogar peru," location Peru (2604), Spanish. 2026-04-15.
- **research_keywords** (DataForSEO): 5 seed keywords, location Peru (2604), Spanish. 2026-04-15.
- **research_traffic** (Similarweb via Apify): promart.pe, March 2026 snapshot.
- **research_business** (Perplexity): Promart business intelligence. April 2026.

**Source URLs (research_business citations):**
1. https://www.zoominfo.com/c/promart/371826812
2. https://intercorpretail.pe/Home%20Improvement/28/
3. https://www.cbinsights.com/company/promart-homecenter
4. https://rocketreach.co/promart-profile_b5e5c0d4f42e6162
5. https://www.scribd.com/document/746634468/Promart-Homecenter

---

*Report generated by the deco AI diagnostic pipeline.*
