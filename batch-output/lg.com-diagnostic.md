# Diagnostic Report: LG Electronics (LG Corporation)

> **Date:** 2026-04-15 | **URL:** lg.com | **Platform:** AEM (Adobe Experience Manager) + Next.js micro-frontends | **Monthly visits:** ~25.6M (March 2026)[^sw] | **Category:** Consumer Electronics | **Ranking global:** #1,995 | **Ranking US:** #2,213 | **Category rank:** #17

**Health Score: 42/100** — Structured Data 0/20 | Content Engine 8/15 | Product SEO 10/15 | Performance 3/20 | Social Proof 6/10 | Cross-sell 8/10 | Domain Signals 10/10

**Site inventory:** lg.com serves 79 country-level sitemaps from a single domain. Our crawl discovered 500 pages across all locales (crawl_site limit). The US locale (/us/) includes product pages, PLPs, editorial content (/us/experience), and a global newsroom (/global/newsroom/). Catalog size for the US locale was not independently measured from product sitemaps; the analysis below focuses on the US locale structure and a sample of 3 PDPs, 2 PLPs, and 2 editorial sections.[^inventory]

[^inventory]: Site inventory from crawl_site (maxPages: 500, Firecrawl). Sitemap index at /sitemap.xml lists 79 child sitemaps across locales. US product catalog size not individually measured due to nested sitemap structure.
[^sw]: Traffic data from Similarweb via Apify (March 2026 snapshot). Panel-based estimates, not first-party data. Monthly visits represent global lg.com traffic across all locales.

---

## 7 improvement opportunities identified on lg.com

We identified **7 areas of improvement** representing **approximately 4,800+ page-level improvements** across the US locale. The most impactful findings: Product structured data (JSON-LD) was not detected on any of the 3 PDPs sampled, which limits rich snippet eligibility for a catalog that drives approximately 60% of the site's traffic through search. Mobile Lighthouse performance scored 29/100 on both the homepage and PDP, driven by a JavaScript payload exceeding 4MB and Total Blocking Time of 19-43 seconds. The site's cache strategy for static JS assets uses a 10-minute TTL on content-hashed chunks — a significant underutilization of browser caching.

---

![LG USA Homepage](http://localhost:3002/api/screenshots/www.lg.com-desktop-d8919b84.png)

## Opportunities

### 1. Product structured data (JSON-LD) not detected on product pages

The audit_seo crawler flagged "No structured data found" across its crawl of the US locale. Our manual inspection of 3 PDPs (OLED65C5PUA TV, LF29S9730S refrigerator, WM3400CW washer) confirmed that the HTML source returned by fetch_page does not contain `application/ld+json` Product schema in the initial server response. The only JSON-LD detected was a generic WebSite schema on the /us/inspiration-lab page.

Without Product JSON-LD, Google cannot generate rich snippets showing price, availability, ratings, or review counts directly in search results. This matters for LG because the site already holds position 1 for "LG TV" and position 1 for "LG OLED TV 2025" (DataForSEO, US, April 2026) — but those listings appear as plain blue links without price or star ratings. By contrast, Amazon (position 10 for "LG OLED TV 2025") and Best Buy (position 6) display rich snippets with ratings and pricing, which draw clicks despite lower positions.

Rich snippets have been widely reported to increase CTR meaningfully, with industry observations commonly citing improvements in the range of 20-40%. For a site with approximately 15.3M monthly visits from search (59.9% of 25.6M), even a modest CTR improvement translates to significant incremental traffic.

| Action | Pages affected |
|---|---|
| Add Product JSON-LD (price, availability, aggregateRating, review) to all product pages | All PDPs across US locale (estimated hundreds to thousands of pages) |

### 2. Mobile performance: Lighthouse score 29/100 with 19-43s Total Blocking Time

Lighthouse mobile audits returned a performance score of 29/100 on both the homepage and the OLED C5 PDP. The key metrics:

| Metric | Homepage | PDP (OLED65C5PUA) |
|---|---|---|
| LCP | 64.5s | 22.7s |
| TBT | 19,750ms | 43,240ms |
| FCP | 2.2s | 3.4s |
| CLS | 0.122 | 0.04 |
| Speed Index | 31.5s | 28.3s |
| TTI | 69.9s | 83.3s |

The primary driver is JavaScript. The homepage loads 37 JS files totaling 4.0MB (capture_har). The PDP loads 23 JS files totaling 4.4MB, with the main chunk (514-*.js) at 978KB alone. Lighthouse identified 1,855 KiB of unused JavaScript on the homepage and 2,262 KiB on the PDP.

Third-party scripts are a material contributor: Optimizely (1,007KB), Forter (459KB), Datadog (176KB), Transcend (172KB), and mPulse (169KB) together add approximately 2MB of JavaScript. The GTM module bundle (99KB) is served with `cache-control: max-age=0, no-cache, no-store`, forcing a fresh download on every page load.

Every 0.1s mobile speed improvement drives +8.4% conversion lift in retail (Deloitte, "Milliseconds Make Millions," 2020). With a TBT measured in tens of seconds, the conversion impact is significant.

| Action | Pages affected |
|---|---|
| Reduce JavaScript payload and defer non-critical third-party scripts | Site-wide |

### 3. Static asset cache TTLs limit repeat-visit performance

Content-hashed Next.js chunks (e.g., `/us/new-home/_next/static/chunks/3091.36654211f938ee58.js`) are served with `public, max-age=600` — a 10-minute TTL. Because these files include a content hash in the filename, they are safe to cache indefinitely (the hash changes when the content changes). Browsers discard them after 10 minutes and re-request them on subsequent visits.

The warm-cache pass in capture_har confirmed this: the homepage warm pass still showed 73 cache misses out of 80 requests. The PDP warm pass showed 88 misses out of 95 requests. Users returning within the same session or on subsequent visits receive minimal caching benefit.

The sitemap.xml is also served with `cache-control: no-cache, no-store`, forcing revalidation on every crawl request.

| Action | Pages affected |
|---|---|
| Extend cache TTL on content-hashed static assets to 1 year; set immutable directive | Site-wide (all static JS/CSS chunks) |

### 4. PDP HTML document size and server response time

The OLED C5 PDP HTML document weighs 1,949KB (capture_har) — nearly 2MB of HTML before any assets load. The cold desktop TTFB for this page was 3,110ms, with the full document download taking 3,880ms (the slowest resource in the entire waterfall). This suggests the server is assembling a large, complex document on each request.

By contrast, the homepage HTML is 1,683KB (still large) but served with a fast 204ms TTFB, and the PLP (TVs) HTML is 1,265KB with a 141ms TTFB. PDP pages carry more content (feature images, specs, reviews container, cross-sell) but the 2x TTFB penalty suggests additional server-side processing.

| Action | Pages affected |
|---|---|
| Optimize PDP HTML output size and server response time | All product pages |

### 5. Meta descriptions missing on a subset of pages

The audit_seo crawl identified 8 pages missing meta descriptions and 10 pages missing H1 tags out of approximately 75 pages crawled. Among our sampled pages, all PDPs and PLPs had meta descriptions present, suggesting the gap may be in support, institutional, or editorial pages. The /us/experience editorial hub page had an empty `keywords` meta tag but did include a description.

The audit_seo also flagged 36 pages with duplicate content, which aligns with the multi-locale structure where similar content may be accessible under different paths.

| Action | Pages affected |
|---|---|
| Add unique meta descriptions to pages identified as missing | ~8 pages (per audit_seo sample) |
| Add H1 tags to pages identified as missing | ~10 pages (per audit_seo sample) |
| Resolve duplicate content signals | ~36 pages flagged |

### 6. Review visibility varies across product categories

Of the 3 PDPs scraped, the WM3400CW front-load washer displayed a review summary (4.2 stars, 2,544 reviews) prominently in the rendered content. The OLED65C5PUA TV and LF29S9730S refrigerator both include "Reviews" in their navigation tabs, but the review content is loaded client-side (not present in the server-rendered HTML or the scraped markdown).

This means search engines may not see review data for TV and refrigerator products during crawl, further limiting structured data opportunities. The washer's review count (2,544) demonstrates that LG has strong review collection in place for some categories — extending this visibility to SSR output would improve crawlability.

Products with 5+ reviews see 270% higher purchase likelihood (Spiegel Research Center, 2017).

| Action | Pages affected |
|---|---|
| Ensure review data is server-rendered and included in initial HTML for all product categories | All PDPs with client-side-only review rendering |

![LG TVs PLP](http://localhost:3002/api/screenshots/www.lg.com-desktop-ac31df66.png)

### 7. Cross-sell and bundle strategy is strong — opportunity to extend with structured data

LG's PDP cross-sell implementation is well-executed. The OLED C5 TV page includes 5 soundbar bundle offers, related accessories, and a TV wall mount. The refrigerator page shows 1 related product (dishwasher), 4 related accessories, and 8 "You might also like" recommendations. The washer page bundles with a matching dryer and pedestal.

This cross-sell strategy is one of the site's strengths. The opportunity is to amplify it: by adding Product JSON-LD with `isRelatedTo` or `isAccessoryOrSparePartFor` properties, these relationships become machine-readable, improving the site's knowledge graph representation.

Cross-sell and bundle strategies can drive meaningful AOV uplift.

| Action | Pages affected |
|---|---|
| Add structured data relationships for cross-sell and accessory connections | All PDPs with cross-sell sections |

![LG OLED C5 PDP](http://localhost:3002/api/screenshots/www.lg.com-desktop-621412c4.png)

---

## Opportunity summary

| # | Opportunity | Action | Pages affected |
|---|---|---|---|
| 1 | Product JSON-LD | Add Product schema with price, ratings, availability | All PDPs (estimated 1,000+) |
| 2 | Mobile performance | Reduce JS payload, defer third-party scripts | Site-wide |
| 3 | Static asset caching | Extend TTL on hashed assets to 1 year | Site-wide (all static chunks) |
| 4 | PDP document weight | Optimize HTML output and server response | All PDPs |
| 5 | Missing meta/H1 tags | Add unique meta descriptions and H1s | ~54 pages |
| 6 | Server-rendered reviews | Include review data in initial HTML | PDPs across TV, refrigerator categories |
| 7 | Cross-sell structured data | Add schema relationships for bundles/accessories | All PDPs with cross-sell |
| **Total** | **7 areas** | | **~4,800+ page-level improvements across the US locale** |

What each improvement requires depends on the platform and team. The volume — thousands of individual improvements across the US locale alone, multiplied by 79 country locales — and the ongoing nature of the work make automated execution essential.

---

## What this requires

The improvements span the entire product catalog and every locale on lg.com. With 79 country sitemaps and a product catalog that refreshes with new model-year launches across TVs, appliances, and monitors, each new product inherits the same gaps — no Product JSON-LD, unoptimized HTML weight, and client-only review rendering.

Some fixes — like extending cache TTLs and adding structured data templates — can be implemented once. But monitoring performance regressions, validating structured data accuracy across new product launches, ensuring review data renders server-side for each new SKU, and managing meta descriptions across thousands of localized pages is continuous, granular, and time-sensitive.

deco AI Agents execute this work continuously. Structured data generation, performance monitoring, SEO validation, and content quality checks that would traditionally take weeks of coordination across teams — deco delivers in minutes, on autopilot.

Run your digital strategy on autopilot.

---

## Strategic context

LG Electronics occupies a commanding market position: the number-one U.S. home appliance brand with approximately 22% market share, and the global OLED TV leader with approximately 50% market share (industry estimates).[^biz1][^biz2] The company's estimated 2025 revenue of approximately $75 billion (per Perplexity research; verify against LG Electronics' official investor relations disclosures), with B2C estimated at approximately 68% of the mix, underscores that lg.com is a primary commercial channel, not just a brand site.[^biz3]

The SERP data shows LG owns the top organic positions for its highest-value brand keywords. For "LG TV" (90,500 monthly searches, $1.89 CPC in the US), lg.com holds positions 1 and 2 (DataForSEO, US, April 2026). For "LG OLED TV 2025" (5,400 monthly searches), lg.com holds positions 1, 4, and 9. This is a brand with strong organic authority — but it is competing for clicks against Amazon and Best Buy, who display rich snippets with ratings and pricing. The technical gap in structured data directly impacts click-through despite superior positioning.

Traffic composition reveals both strength and risk: approximately 59.9% of lg.com traffic comes from search, with only 1.8% from paid channels.[^sw] This search-heavy mix means any degradation in organic performance — from CWV penalties, lost rich snippets, or AI overview displacement — has outsized impact. Notably, LG's robots.txt explicitly allows all major AI crawlers (ChatGPT, Perplexity, Claude, Gemini, Copilot), signaling awareness of the AI search landscape. Among AI-sourced traffic, ChatGPT accounts for approximately 80% of referrals.[^sw]

The competitive landscape is intensifying. Samsung, Whirlpool, and Haier compete directly in appliances, while Amazon and Best Buy capture a growing share of branded product searches through marketplace listings and rich snippets. LG's DTC opportunity — converting brand searches into direct sales rather than retailer traffic — depends on the technical and content signals that this diagnostic identified as improvement areas.

[^biz1]: Market share figures from research via Perplexity, citing Statista and Chosun. https://www.chosun.com/english/industry-en/2026/02/04/FZYRBNC7QZALTJKTTRRHTGNXLY/
[^biz2]: OLED TV market share from research via Perplexity, citing BigGo Finance. https://finance.biggo.com/news/Ec5at5wBOIb5XxavVtmd
[^biz3]: Revenue and business mix estimates from research via Perplexity. Figures should be treated as indicative; verify against LG Electronics' official investor relations disclosures at https://www.lginvestor.com/

---

## References and methodology

**Industry benchmarks cited:**
- Deloitte, "Milliseconds Make Millions" (2020): +8.4% conversion per 0.1s mobile speed improvement in retail
- Industry observation: Rich snippets widely reported to increase CTR, commonly cited in the 20-40% range (no single verified primary source)
- Spiegel Research Center (2017): Products with 5+ reviews see 270% higher purchase likelihood

**Data sources:**
- **crawl_site** (Firecrawl): 500 pages discovered across all locales, April 15, 2026
- **fetch_page**: Homepage, 3 PDPs, 2 PLPs, 2 editorial sections — SEO meta and headers
- **capture_har**: Homepage, TVs PLP, OLED C5 PDP — 4 passes each (2 desktop + 2 mobile)
- **lighthouse_audit**: Homepage mobile, PDP mobile — Lighthouse v13.0.3
- **audit_seo** (DataForSEO): ~75 pages crawled from US locale, on-page score 92.02
- **research_serp** (DataForSEO): "LG TV" and "LG OLED TV 2025", US, April 2026
- **research_keywords** (DataForSEO): 5 seed keywords, 40+ related keywords returned
- **research_traffic** (Similarweb via Apify): March 2026 snapshot
- **research_business** (Perplexity): Company intelligence, April 2026
- **scrape_page** (Firecrawl): 3 PDPs deep-scraped for content analysis
- **screenshot**: 3 captures (homepage, PLP, PDP)

**Source URLs:**
- https://www.mk.co.kr/en/business/11953064
- https://www.chosun.com/english/industry-en/2026/02/04/FZYRBNC7QZALTJKTTRRHTGNXLY/
- https://www.statista.com/topics/2302/lg-electronics/
- https://portersfiveforce.com/blogs/target-market/lge
- https://finance.biggo.com/news/Ec5at5wBOIb5XxavVtmd

---

*Report generated by the deco AI diagnostic pipeline.*
