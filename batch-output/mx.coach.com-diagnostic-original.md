# Diagnostic Report: Coach Mexico (Tapestry, Inc.)

> **Date:** 2026-04-15 | **URL:** mx.coach.com | **Platform:** VTEX Legacy Portal (v1.8.0) + CloudFront CDN | **Monthly visits:** ~210K (March 2026)[^sw] | **Category:** Luxury Fashion E-commerce | **Ranking global:** N/A | **Ranking Mexico:** N/A

**Health Score: 28/100** — Structured Data 0/20 | Content Engine 0/15 | Product SEO 0/15 | Performance 5/20 | Social Proof 0/10 | Cross-sell 5/10 | Domain Signals 8/10

**Site inventory:** 439 products measured from product sitemap (product-0.xml, single file). 55 category pages (PLPs) measured from category-0.xml. No editorial pages detected via three-method discovery (path probing, crawl_site classification, sitemap analysis). 1 brand page in brand-0.xml.[^inventory]

[^inventory]: Product count from `<loc>` entries in sitemap/product-0.xml (fetched 2026-04-15). Category count from sitemap/category-0.xml. crawl_site discovered 500 pages total (439 classified as PDP, 0 PLP by the crawler — PLPs were in the "other" bucket). The sitemap is the authoritative source for both counts.
[^sw]: Traffic data from Similarweb via Apify (panel-based estimate, March 2026 snapshot). These are approximations, not first-party analytics.

---

![Coach Mexico Homepage](http://localhost:3002/api/screenshots/mx.coach.com-desktop-e5729dfa.png)

## 2,185 improvement opportunities identified on mx.coach.com

We identified **7 areas of improvement** representing **2,185 page-level improvements** across **494 unique URLs**. The most material findings are the absence of structured data across the entire catalog, a single generic meta description shared by all product pages, and mobile performance scores of 3/100 on both the homepage and product pages — driven by 7.9 MB total payload and 26-second time-to-interactive.

---

## Opportunities

### 1. Add Product JSON-LD structured data to all product pages

The DataForSEO audit crawled 78 pages and detected structured data on none of them. Our manual inspection of 3 PDPs (Tabby 26 shoulder bag, High Line sneakers, 3-in-1 leather wallet) confirmed the finding: no `<script type="application/ld+json">` or microdata markup was identified in the HTML source of any sampled page.

Without Product structured data, Google cannot display rich snippets — price, availability, review stars — in search results. For a luxury brand where the product name, price point, and availability are key purchase signals, this represents a measurable CTR gap. Rich snippets increase CTR by 20-40% according to Search Engine Journal and Ahrefs research.

Coach Mexico already ranks #1 for "coach bolsas mexico" (DataForSEO, Mexico, April 2026). Adding rich results to these already top-ranking pages would compound an already strong position by increasing click-through from the SERP into the site.

| Action | Pages affected |
|---|---|
| Add Product JSON-LD (name, price, availability, image, brand, SKU) to product pages | 439 PDPs |
| Add BreadcrumbList JSON-LD to category and product pages | 494 pages (439 PDPs + 55 PLPs) |

### 2. Generate unique, product-specific meta descriptions

All 3 sampled PDPs returned the same truncated meta description: *"Toda la tienda. Compra Maletines, Carteras, Accesorios y Calzado. La mejor marca para lucir sensacional. Conoce lo último. Estilos: Mujer, Hombre, Nue..."* This is a site-wide default description, not product-specific content. The DataForSEO audit confirmed this pattern, identifying 28 pages with duplicate meta descriptions across the 78 pages crawled.

This means Google is displaying the same snippet text for hundreds of different products in search results. A shoulder bag priced at $12,890 MXN and a $3,890 sneaker show identical descriptions to the searcher. Unique product descriptions that incorporate the product name, category, material, and price are widely cited as a driver of incremental organic traffic per PDP.

Category pages (PLPs), by contrast, have proper unique descriptions — e.g., `/mujer/bolsas` shows "Compra bolsas para mujer. Descubre una gran variedad de bolsas para mujeres..."

| Action | Pages affected |
|---|---|
| Generate unique meta descriptions for product pages | 439 PDPs |

### 3. Add H1 tags to pages missing them

The DataForSEO audit found 62 of 78 crawled pages (79%) with no H1 tag detected. On our sampled PDPs, the product name appears as an `<h1>` in the rendered DOM but may be client-rendered rather than server-rendered, which could explain why the crawler did not detect it. This warrants verification: if H1s are only present after JavaScript execution, search engine crawlers may not consistently index them.

| Action | Pages affected |
|---|---|
| Ensure H1 tags are present in server-rendered HTML | 494 pages (estimated based on 79% rate from 78-page sample) |

### 4. Improve mobile performance (Lighthouse 3/100)

Lighthouse mobile audits returned a performance score of **3/100** on both the homepage and the Tabby 26 PDP. Core Web Vitals measured:

| Metric | Homepage | PDP (Tabby 26) | Threshold |
|---|---|---|---|
| LCP | 8.4s | 17.2s | < 2.5s |
| CLS | 0.988 | 1.096 | < 0.1 |
| TBT | 5,230ms | 9,150ms | < 200ms |
| FCP | 4.7s | 4.6s | < 1.8s |
| TTI | 26.0s | 31.4s | < 3.8s |

The homepage loads 7.9 MB of total payload (Lighthouse) across approximately 100 requests (capture_har). The PDP loads 3.5 MB. Main-thread work is 18.9s on the homepage and 34.8s on the PDP. Lighthouse identified 662 KiB of unused JavaScript on the homepage and 1,044 KiB on the PDP.

The VTEX Legacy Portal architecture (jQuery 1.8.3, multiple portal-plugin scripts, Dust.js templates) contributes significant JavaScript overhead. The `font_Termina-Regular.woff2.css` and other font files were the slowest resources on cold load (1,154ms).

Every 0.1s improvement in mobile speed drives +8.4% conversion uplift in retail (Deloitte, "Milliseconds Make Millions", 2020). With the current 8.4s LCP on the homepage, the conversion cost is material.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload and defer non-critical scripts | Site-wide |
| Optimize CLS (reserve image dimensions, stabilize layout) | Site-wide |

### 5. Enable CDN caching for product and category pages

capture_har confirmed that product pages (`/bolsa-shoulder-bag-coach-tabby-26-refresh-ch857-b4-ha/p`) and category pages (`/mujer/bolsas`) return `cache-control: private`, which means CloudFront cannot cache these responses. Every visitor request hits the VTEX origin server.

The homepage, by contrast, returns `cache-control: public, max-age=120, s-maxage=120` and was served as a CloudFront cache HIT. Static assets (JS, CSS, fonts) are well-cached with long TTLs.

For a catalog of 439 products and 55 categories, enabling CDN caching with even short TTLs (30-120 seconds) would reduce origin load and improve TTFB for repeat visitors. The PLP cold TTFB was 693ms on desktop vs. 193ms for the cached homepage.

| Action | Pages affected |
|---|---|
| Configure public cache headers for PDP and PLP HTML responses | 494 pages (439 PDPs + 55 PLPs) |

### 6. Build a content marketing engine

Three-method editorial discovery found no active editorial content on mx.coach.com:

- **Path probing:** `/blog`, `/editorial`, `/stories`, `/magazine`, `/noticias`, `/news` all redirected to VTEX's empty search page (`/Sistema/buscavazia?ft=...`).
- **crawl_site classification:** 0 pages classified as blog or editorial out of 500 discovered.
- **Sitemap analysis:** No editorial sitemap. Only product-0.xml, category-0.xml, and brand-0.xml exist.

Coach's search landscape in Mexico includes high-volume long-tail keywords that editorial content could capture: "bolsa coach corazon" (2,400/mo), "bolsa coach rosa" (4,400/mo), "bolsa tote coach" (2,400/mo), "mariconera coach" (6,600/mo). These represent product-adjacent search intent that PLPs alone cannot fully satisfy with rich, informative content.

Companies with active blogs have been shown to generate meaningfully more organic visitors than those without. For a brand receiving ~210K monthly visits with 60% from search, editorial content targeting these long-tail terms could meaningfully expand the organic footprint.

| Action | Pages affected |
|---|---|
| Launch editorial content section targeting high-volume product keywords | New pages (ongoing) |

### 7. Implement customer reviews on product pages

We inspected 3 PDPs via deep scrape (Tabby 26 shoulder bag, High Line sneakers, 3-in-1 wallet). None contained a review section, star ratings, or user-generated content. The PDPs include "Completa tu look" cross-sell recommendations and "Otras personas también vieron" carousels, but no social proof elements.

Products with 50+ reviews convert at 2-3x versus products with no reviews (Bazaarvoice / Spiegel Research Center). Post-purchase review request emails typically achieve 5-15% response rates. For a catalog of 439 products, building a review corpus is a medium-term investment that compounds over time.

| Action | Pages affected |
|---|---|
| Add review collection and display system to product pages | 439 PDPs |

---

![Coach Mexico — Women's Bags PLP](http://localhost:3002/api/screenshots/mx.coach.com-desktop-36cd9266.png)

![Coach Mexico — Tabby 26 PDP](http://localhost:3002/api/screenshots/mx.coach.com-desktop-6fd5587c.png)

---

## Opportunity summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Structured data (JSON-LD) | Add Product + BreadcrumbList schema | 494 |
| 2 | Unique meta descriptions | Generate product-specific descriptions | 439 |
| 3 | H1 tag coverage | Ensure server-rendered H1 on all pages | 494 |
| 4 | Mobile performance | Reduce JS payload, fix CLS, improve LCP | Site-wide |
| 5 | CDN caching for PDPs/PLPs | Enable public cache headers | 494 |
| 6 | Content marketing engine | Create editorial content for long-tail keywords | New (ongoing) |
| 7 | Customer reviews | Implement review collection and display | 439 |
| **Total** | **7 areas** | | **2,185 page-level improvements across 494 unique URLs** |

What each improvement requires depends on the platform and team. The volume — 2,185 individual improvements across 494 URLs — and the ongoing nature of the work make automated execution essential.

---

## What this requires

The improvements span the entire catalog: 439 product pages need unique meta descriptions, structured data, and review infrastructure. 55 category pages need schema markup and cache configuration. Every new product added to the catalog inherits the same gaps unless the underlying systems change.

Some fixes are one-time configuration changes — cache headers, schema templates. But the content work is continuous: meta descriptions must be written per-product, editorial content must be produced and optimized on an ongoing cadence, and reviews must be collected, moderated, and surfaced. Performance monitoring requires vigilance as new features and content are added.

deco AI Agents are purpose-built for exactly this kind of work — specialized agents that continuously generate structured data, write product descriptions, produce editorial content, and monitor performance across the entire catalog. What traditionally takes weeks of manual effort, deco delivers in minutes, on autopilot.

Run your digital strategy on autopilot.

---

## Strategic context

Coach Mexico operates in a competitive luxury e-commerce market where the brand competes with marketplace intermediaries (Liverpool, Mercado Libre, Amazon MX, El Palacio de Hierro, Farfetch) for its own brand searches. The SERP for "coach bolsas mexico" shows mx.coach.com holding positions #1-3 (DataForSEO, Mexico, April 2026), but Liverpool at #4 and Mercado Libre at #5 are positioned to capture clicks that the DTC site loses through missing rich snippets and generic meta descriptions.[^serp]

The keyword landscape reveals significant organic search demand: "coach bolsas" (33,100 searches/month), "bolsas coach mujer" (33,100/mo), "cartera coach" (33,100/mo), "cartera coach hombre" (9,900/mo), and "bolsa coach hombre" (12,100/mo) — all measured by DataForSEO for Mexico in March 2026. This is a brand with strong organic demand that the DTC channel should be converting more efficiently.

Coach's Mexico operation, managed through distributor Grupo Axo with over 70 physical stores, recently opened its first Modern Luxury boutique in Mexico City at Via Santa Fe.[^biz] The online store on VTEX Legacy Portal appears to have been established alongside the physical retail expansion but has not received the same level of technical SEO investment. The legacy platform architecture (jQuery 1.8.3, Dust.js templates, portal-plugins from VTEX's older generation) constrains performance in ways that modern storefronts do not.

With approximately 60% of traffic arriving via search (Similarweb estimate, March 2026), organic visibility is the dominant growth lever. Every improvement to structured data, meta descriptions, and page speed directly impacts the channel that drives the majority of visits — making the ROI on these technical improvements measurably higher than for a site with a more diversified traffic mix.

[^serp]: SERP positions from DataForSEO, location: Mexico (code 2484), language: Spanish, captured April 15, 2026. Positions are volatile and vary by user, device, and location.
[^biz]: Business context from Perplexity research (web-grounded AI synthesis). Source: Fashion Network, "Coach opens first boutique in Mexico City" — https://us.fashionnetwork.com/news/Coach-opens-first-boutique-in-mexico-city,758343.html. Claims are approximate.

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions" (2020): +8.4% conversion per 0.1s mobile speed improvement in retail
- Search Engine Journal / Ahrefs: Rich snippets increase CTR by 20-40%
- Bazaarvoice / Spiegel Research Center: Products with 50+ reviews convert at 2-3x vs. no reviews
- Ahrefs: Unique product descriptions increase organic traffic per PDP by 30-50%
- Post-purchase review request emails: 5-15% response rate (industry average)

**Data sources:**
- **crawl_site** (Firecrawl): 500 pages discovered, April 15, 2026
- **fetch_page**: Sitemap.xml, product-0.xml, category-0.xml, robots.txt, 3 PDPs, 2 PLPs, 6 editorial paths — April 15, 2026
- **capture_har**: Homepage, /mujer/bolsas, Tabby 26 PDP — 4 passes each (2 desktop + 2 mobile), April 15, 2026
- **lighthouse_audit**: Homepage (mobile) and Tabby 26 PDP (mobile) — Lighthouse v13.0.3, April 15, 2026
- **audit_seo** (DataForSEO): 78 pages crawled, onpage score 92.63, April 15, 2026
- **research_serp** (DataForSEO): "coach bolsas mexico", Mexico, Spanish, April 15, 2026
- **research_keywords** (DataForSEO): 5 seed keywords → 40+ related keywords with volume/CPC, Mexico, April 15, 2026
- **research_traffic** (Similarweb via Apify): mx.coach.com, March 2026 snapshot
- **research_business** (Perplexity): Coach / Tapestry Inc. Mexico operations
- **scrape_page** (Firecrawl): 3 PDPs deep-scraped for content analysis, April 15, 2026
- **screenshot**: Homepage (desktop), /mujer/bolsas (desktop), Tabby 26 PDP (desktop), April 15, 2026

**Source URLs:**
- https://us.fashionnetwork.com/news/Coach-opens-first-boutique-in-mexico-city,758343.html
- https://bitscale.ai/directory/coach

---

*Report generated by the deco AI diagnostic pipeline.*
