# Site Diagnostics Rewrite Plan

## Overview

Rewrite site-diagnostics from a monolithic 500-line prompt that tells Opus which tools to call, into a **deterministic pipeline** of pure functions where code calls tools in a fixed order and LLMs only do synthesis at the end. Multi-agent for the synthesis step (small focused prompts instead of one giant one). Auth layer for proprietary data sources. Pluggable cache.

---

## 1. Architecture

### HTTP layer

No framework (no Hono). Raw fetch handlers composed as middleware, same pattern as today:

```
withLogging(withAuth(withPurge(withMcpApiRoute(runtime.fetch))))
```

Route table:

```
/api/auth/*        →  BetterAuth handler (OTP + anonymous)
/api/mcp/*         →  MCP runtime (tools still exposed)
/api/pipeline/*    →  Pipeline trigger + status
/api/screenshots/* →  R2 proxy (unchanged)
/purge             →  Admin cache purge (secret-gated)
```

### Two runtimes

**Bun (local dev):** `Bun.serve({ fetch })` — uses bun:sqlite for DB, in-memory Map for cache.

**Cloudflare Workers (prod):** `export default { fetch }` — uses D1 binding for DB, KV binding for cache.

Both runtimes share the same `createApp()` function. The difference is how external services are injected:

```typescript
// createApp now accepts injectable deps
export function createApp(config: {
  clientHTML?: string;
  db: D1Database | BunSQLiteDatabase;  // BetterAuth + org tables
  cache: KVStore;                       // Pipeline cache
}) { ... }

// main.bun.ts — injects local implementations
const db = new Database("data/auth.sqlite");
const cache = new FileKVStore(".kv");
const app = createApp({ db, cache });
Bun.serve({ fetch: app.fetch });

// main.workers.ts — injects CF bindings
export default {
  fetch(request: Request, env: WorkerEnv) {
    const app = createApp({
      clientHTML: CLIENT_HTML,
      db: env.D1,
      cache: new CloudflareKVStore(env.CACHE),
    });
    return app.fetch(request);
  }
};
```

### CF Bindings (wrangler.toml additions)

```toml
[[d1_databases]]
binding = "D1"
database_name = "site-diagnostics"
database_id = "b703371e-0bbe-4eab-9a4b-8aee9643cb22"

[[kv_namespaces]]
binding = "CACHE"
id = "75797ec99ceb414bb23d40744f9d369f"
```

Everything else (API keys, secrets) stays as env vars / wrangler secrets — same as today.

### MCP tools = pipeline steps

The old low-level MCP tools (fetchPage, captureHar, lighthouse, etc.) become internal implementation details. The MCP server exposes **step-level tools** instead:

| Tool | What it does | Cached |
|------|-------------|--------|
| `discover` | Crawl, sitemap, robots, homepage meta, editorial probes | 24h |
| `analyze_perf` | HAR + Lighthouse + screenshots on samples | 24h |
| `analyze_seo` | SEO audit + page meta + JSON-LD sampling | 24h |
| `analyze_content` | Scrape PDPs + editorial, review/cross-sell detection | 24h |
| `research` | Traffic, business context, SERP, keywords | 7d |
| `synthesize` | Multi-agent LLM synthesis into final report | never |

The agent prompt for Claude Code / Claude Desktop shrinks to:
```
Run these tools in order for the given URL:
1. discover(url) → site structure + samples
2. analyze_perf, analyze_seo, analyze_content, research → run in parallel
3. synthesize(all outputs) → final report
```

**No server-side LLM key needed** — the MCP client provides the intelligence. The server is a pure data collection engine.

### Agent-native flow (Claude Code)

When connected from Claude Code with a repo open:
```
Claude Code
  ├── site-diagnostics MCP  →  discover, analyzePerf, analyzeSeo, analyzeContent, research
  ├── the repo on disk       →  IS the repo analysis (grep, read package.json, check code)
  └── Claude itself          →  IS the synthesizer (writes the report directly)
```

Proprietary sources move to the agent layer — they're not pipeline steps on this server:
- **Repo analysis**: Claude Code has the filesystem. No `sourceRepo` step needed.
- **HyperDX / BigQuery / CDN**: Can be separate MCPs, direct API calls, or tools the agent has access to.

The sub-agent escape hatch (section 12) is free in this mode — Claude Code can verify false positives by reading the actual source code.

### Automated pipeline (Cloudflare Workflows)

For batch runs and cron jobs, the pipeline runs as a **Cloudflare Workflow** — durable execution with per-step retries and crash recovery. This path DOES need a server-side `ANTHROPIC_API_KEY`.

Both modes use the same pure step functions underneath:

```
Interactive (MCP):        Agent calls step tools → agent synthesizes
Automated (pipeline):     CF Workflow calls step functions → server-side synthesis
```

#### Workflow definition

```typescript
// src/workflows/diagnose/workflow.ts
export class DiagnosePipeline extends WorkflowEntrypoint {
  async run(event, step) {
    const { url, orgId, sources } = event.payload;
    const lang = url.includes(".br") ? "pt-BR" : "en";

    const discovery = await step.do("discover", () => discover(url));
    const samples = await step.do("select-samples", () => selectSamples(discovery));

    const [perf, seo, content, researchData] = await Promise.all([
      step.do("analyze-perf", () => analyzePerformance(samples)),
      step.do("analyze-seo", () => analyzeSeo(url, samples)),
      step.do("analyze-content", () => analyzeContent(samples, discovery)),
      step.do("research", () => research(url, discovery)),
    ]);

    const cdn = sources.cdn
      ? await step.do("source-cdn", () => sourceCdn(sources.cdn))
      : null;

    const bundle = { discovery, samples, perf, seo, content, research: researchData, cdn, hyperdx: null, bigquery: null, repo: null };

    const report = await step.do("synthesize", () => synthesize(bundle, lang));
    const actions = await step.do("actions", () => proposeActions(report, null));

    await step.do("save", () => saveDiagnostic(report, orgId));

    return { report, actions };
  }
}
```

Each `step.do()` is durable — result persists, retries on failure, pipeline resumes from last completed step on crash.

#### Wrangler binding

```toml
[[workflows]]
name = "diagnose-pipeline"
binding = "DIAGNOSE_PIPELINE"
class_name = "DiagnosePipeline"
```

#### API endpoints (auth-gated)

Both endpoints require authentication. Anonymous users cannot trigger or query pipeline runs — they can only use the MCP step tools interactively.

```typescript
// POST /api/pipeline/run — start a pipeline
if (url.pathname === "/api/pipeline/run") {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.isAnonymous) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { targetUrl } = await request.json();
  const orgId = await resolveOrg(session.user.email);
  const sources = orgId ? await loadOrgCredentials(orgId) : {};

  const instance = await env.DIAGNOSE_PIPELINE.create({
    params: { url: targetUrl, orgId, sources },
  });
  return Response.json({ id: instance.id });
}

// GET /api/pipeline/status/:id — check progress (scoped to org)
if (url.pathname.startsWith("/api/pipeline/status/")) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.isAnonymous) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = url.pathname.split("/").pop();
  const instance = await env.DIAGNOSE_PIPELINE.get(id);

  // Verify the run belongs to this user's org
  const orgId = await resolveOrg(session.user.email);
  if (instance.params.orgId !== orgId) {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json({ status: instance.status, output: instance.output });
}
```

---

## 2. Database

**Cloudflare D1** in prod (binding from Workers), **bun:sqlite** for local dev. BetterAuth supports both natively.

### Schema

```sql
-- BetterAuth managed tables (auto-migrated)
-- user, session, account, verification

-- Org credentials: one row per org, JSON blob for all API keys
CREATE TABLE org_credentials (
  org_id    TEXT PRIMARY KEY,
  creds     TEXT NOT NULL  -- JSON: { cdn, hyperdx, bigquery, repo }
);

-- Map an entire email domain to an org
-- e.g. "decocms.com.br" → org "abc123"
CREATE TABLE email_domain_mapping (
  domain    TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES org_credentials(org_id)
);

-- Map a specific email to an org (overrides domain mapping)
-- e.g. "partner@gmail.com" → org "abc123"
CREATE TABLE individual_email_mapping (
  email     TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES org_credentials(org_id)
);
```

### Org resolution logic

```
resolveOrg(email):
  1. Check individual_email_mapping for exact email
  2. If not found, extract domain from email, check email_domain_mapping
  3. If found → load org_credentials by org_id → return creds
  4. If not found → user is authenticated but has no org → no proprietary sources
```

### Credentials JSON shape

```typescript
interface OrgCredentials {
  cdn?: {
    endpoint: string;       // CDN data lake API
    token: string;
  };
  hyperdx?: {
    apiKey: string;
    serviceNames: string[];
  };
  bigquery?: {
    projectId: string;
    dataset: string;
    credentials: object;    // Google service account JSON
  };
  repo?: {
    owner: string;
    repo: string;
    token: string;          // GitHub PAT
  };
}
```

---

## 3. Auth

**BetterAuth** with two plugins: email OTP + anonymous.

### Setup

```typescript
// src/auth.ts
import { betterAuth } from "better-auth";
import { emailOTP, anonymous } from "better-auth/plugins";

export function createAuth(db: D1Database | BunSQLiteDatabase) {
  return betterAuth({
    database: db,
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(email, `Your verification code: ${otp}`);
        },
        otpLength: 6,
        expiresIn: 300,
      }),
      anonymous(),
    ],
  });
}
```

### Flows

**Anonymous**: Client connects with `?anon` → BetterAuth `anonymous()` creates a guest session → pipeline runs public steps only (1-6). No proprietary data sources.

**Email OTP**: User enters email → `sendVerificationOtp({ email })` → user enters code → `verifyEmail({ email, otp })` → session created → server resolves org from email → all available sources unlocked.

### Integration with MCP server

BetterAuth sits in front. The MCP runtime doesn't know about auth — we just inject context via headers before passing the request through:

```typescript
// In the HTTP server fetch handler
if (url.pathname.startsWith("/api/mcp")) {
  const session = await auth.api.getSession({ headers: request.headers });
  const isAnon = url.searchParams.has("anon") || !session || session.user.isAnonymous;

  let orgId = "";
  if (!isAnon && session?.user?.email) {
    orgId = await resolveOrg(session.user.email);
  }

  // Clone request with context headers (Workers Request headers are immutable)
  const enriched = new Request(request, {
    headers: new Headers([
      ...request.headers.entries(),
      ["x-user-email", isAnon ? "" : session.user.email],
      ["x-org-id", orgId],
      ["x-is-anonymous", String(isAnon)],
    ]),
  });

  return mcpRuntime.fetch(enriched);
}
```

---

## 4. Cache

Injectable KV interface. Anything that implements this can back the cache.

```typescript
interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
```

Implementations:
- **Local dev**: File-based `.kv/` directory (gitignored). One JSON file per key, stores `{ data, expiresAt }`. Survives process restarts. `list()` via `readdir`.
- **Prod**: Cloudflare KV binding (has native `list({ prefix })`)
- **Tests**: Same in-memory Map, or a no-op store

### Per-step TTLs

| Step | TTL | Why |
|------|-----|-----|
| discover | 24h | Site structure is stable day-to-day |
| analyzePerf | 24h | Lighthouse/HAR results stable within a day |
| analyzeSeo | 24h | SEO audit is slow, results don't change fast |
| analyzeContent | 24h | Content changes slowly |
| research | 7d | Traffic/SERP data is weekly cadence |
| sourceCdn | 1h | CDN trends need to be fairly fresh |
| sourceHyperDx | NONE | Must capture real-time errors |
| sourceBigQuery | 6h | Analytics data has inherent lag |
| sourceRepo | 24h | Repo doesn't change that fast |
| synthesize | NONE | Always re-synthesize from latest data |
| actions | NONE | Always fresh proposals |

### Cache key format

`{domain}:{stepName}:{configHash}` — domain is a readable prefix for easy purging.

```
www.example.com:discover:a1b2c3
www.example.com:analyzePerf:a1b2c3
www.example.com:sourceBigQuery:d4e5f6
```

This format enables:
- **Purge single key**: `delete("www.example.com:discover:a1b2c3")`
- **Purge all for a domain**: `list("www.example.com:")` → delete each

### Usage in steps

```typescript
// Each step function is wrapped with caching at the orchestration layer,
// NOT inside the function itself. The function stays pure.
const discovery = await cachedRun(cache, "discover", domain, url, () => discover(url));
```

### Admin purge endpoint

```
POST /purge  { key: "<single-key>" }         → purge one key
POST /purge  { domain: "www.example.com" }   → purge all for domain

Header: Authorization: Bearer <ADMIN_SECRET>
```

Secret is a simple env var (`ADMIN_SECRET`), sent via `Authorization` header (not query params — avoids leaking in logs/referers). Returns 401 if wrong. Requires `key` or `domain` in the JSON body.

```typescript
if (url.pathname === "/purge" && request.method === "POST") {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== env.ADMIN_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key, domain } = await request.json();

  if (key) {
    await cache.delete(key);
    return Response.json({ purged: [key] });
  }

  if (domain) {
    const keys = await cache.list(`${domain}:`);
    await Promise.all(keys.map(k => cache.delete(k)));
    return Response.json({ purged: keys });
  }

  return new Response("Missing key or domain in body", { status: 400 });
}
```

---

## 5. Pipeline Steps (Pure Functions)

All functions live in `src/workflows/diagnose/`. Each is a pure async function with typed input/output. No knowledge of cache, auth, or orchestration. Just business logic.

### Directory layout

```
src/
├── workflows/
│   └── diagnose/
│       ├── types.ts                 # All input/output interfaces
│       ├── 01-discover.ts           # Site discovery
│       ├── 02-select-samples.ts     # Deterministic sample selection
│       ├── 03-analyze-perf.ts       # HAR + Lighthouse + screenshots
│       ├── 04-analyze-seo.ts        # SEO audit + page meta
│       ├── 05-analyze-content.ts    # Scrape PDPs + editorial
│       ├── 06-research.ts           # Traffic, business, SERP, keywords
│       ├── 07-source-cdn.ts         # CDN data lake
│       ├── 08-source-hyperdx.ts     # HyperDX logs
│       ├── 09-source-bigquery.ts    # GA4 analytics
│       ├── 10-source-repo.ts        # Repository analysis
│       ├── 11-synthesize.ts         # Multi-agent LLM synthesis
│       ├── 12-actions.ts            # Action proposals
│       └── index.ts                 # Re-exports
├── integrations/                    # External service clients
│   ├── browserless.ts
│   ├── dataforseo.ts
│   ├── firecrawl.ts
│   ├── perplexity.ts
│   ├── similarweb.ts
│   ├── hyperdx.ts
│   ├── bigquery.ts
│   ├── github.ts
│   ├── cdn-datalake.ts
│   └── anthropic.ts
├── cache/
│   ├── interface.ts                 # KVStore interface
│   ├── memory.ts                    # In-memory implementation
│   └── cloudflare-kv.ts            # CF KV implementation
├── auth/
│   ├── auth.ts                      # BetterAuth setup
│   ├── resolve-org.ts              # Email → org_id resolution
│   └── db.ts                       # Schema + migrations
└── api/                             # MCP tools (existing, thin wrappers)
    └── tools/
```

### Step details

#### Step 1: discover

```
Input:  { url: string }
Output: DiscoveryResult {
  crawl: { totalPages, pageCounts: { pdp, plp, blog, institutional, other }, sampleUrls, allUrls }
  sitemap: { exists: boolean, productSitemapUrls: string[], totalProductUrls: number }
  robots: { exists: boolean, rules: string, sitemapUrls: string[] }
  homepage: { status, headers, seoMeta, links, platform, cdn }
  editorial: { paths: { path: string, exists: boolean, linkCount: number }[] }
}
```

Runs in parallel:
- `crawlSite(url, maxPages: 500)`
- `fetchPage(url + "/sitemap.xml")` → if index, fetch children and count `<loc>` entries
- `fetchPage(url + "/robots.txt")`
- `fetchPage(url, { extractLinks: true, maxBodyKB: 1 })`
- Probe editorial paths: `/blog`, `/editorial`, `/revista`, `/conteudo`, `/magazine`, `/news`, `/noticias`, `/stories`

#### Step 2: selectSamples

```
Input:  DiscoveryResult
Output: SampleSet {
  homepage: string
  pdps: string[]          // up to 3, spread across categories
  plps: string[]          // up to 2, top-level
  editorial: string[]     // 0-1, most recent if found
}
```

Pure function, no I/O. Deterministic rules:
- PDPs: pick from different categories in crawl results, prefer shorter URLs (less likely to be variants)
- PLPs: pick top-level collection/category pages
- Editorial: first link from the first editorial path that had `exists: true`

#### Step 3: analyzePerformance

```
Input:  SampleSet
Output: PerfData {
  hars: { url, ttfb, requests, resourceBreakdown, failedRequests, thirdPartyInventory, cacheHits, cacheMisses }[]
  lighthouses: { url, scores: { performance, accessibility, seo, bestPractices }, webVitals: { lcp, cls, tbt, fcp, si, tti }, diagnostics }[]
  screenshots: { url, imageUrl, device, blocked }[]
}
```

Parallel per sample:
- `captureHar(url)` on homepage + 1 PLP + 1 PDP
- `lighthouseAudit(url, { device: "mobile" })` on homepage + 1 PDP
- `screenshot(url, { device: "desktop" })` on homepage + 1 PLP + 1 PDP

#### Step 4: analyzeSeo

```
Input:  { url: string, samples: SampleSet }
Output: SeoData {
  audit: { score, brokenLinks, duplicateMeta, missingMetadata, structuredDataCoverage }
  pageMeta: { url, title, description, h1, canonical, robots, jsonLd, ogTags }[]
  sitemapHealth: { productCount, indexable, orphanedEstimate }
}
```

Parallel:
- `auditSeo(url, { maxPages: 100 })` — takes 1-3 min
- `fetchPage(url, { maxBodyKB: 1 })` per sample for meta extraction
- PDP JSON-LD sampling (5 PDPs from crawl results)

#### Step 5: analyzeContent

```
Input:  { samples: SampleSet, discovery: DiscoveryResult }
Output: ContentData {
  pdpScrapes: { url, hasReviews, hasCrossSell, hasJsonLd, jsonLdTypes, descriptionLength, imageCount, imageAlts }[]
  editorialScrapes: { url, wordCount, publishDate, hasAuthor, hasSeoMeta }[]
  screenshots: { url, imageUrl, device }[]
}
```

Parallel:
- `scrapePage(url)` on 3-5 PDPs
- `scrapePage(url)` on 1-2 editorial posts (if discovered)
- `screenshot(pdp, { device: "desktop" })`

#### Step 6: research

```
Input:  { url: string, discovery: DiscoveryResult }
Output: ResearchData {
  traffic: { globalRank, countryRank, totalVisits, bounceRate, pagesPerVisit, trafficSources, topCountries, topKeywords, monthlyVisits, aiTraffic }
  business: { summary, marketPosition, competitors, recentNews, businessContext }
  serp: { keyword, results: { position, url, title }[], relatedSearches, peopleAlsoAsk }[]
  keywords: { keyword, volume, difficulty, cpc, competition, monthlyTrends }[]
}
```

Parallel:
- `researchTraffic([url])`
- `researchBusiness(domain)`
- `researchSerp(brandName)` + `researchSerp(brandName + category)`
- `researchKeywords(top 3-5 seeds from crawl/business context)`

Keyword seed selection is deterministic: extract brand name from homepage title, combine with top category names from crawl page counts.

#### Step 7: sourceCdn

```
Input:  CdnConfig { endpoint, token, domain }
Output: CdnData {
  requestsPerSecond: TimeSeriesData
  topPages: { path, hits, avgResponseTime }[]
  geoDistribution: { country, percentage }[]
  cacheHitRate: number
  cacheHitByPath: { pattern, hitRate }[]
  edgeVsOriginRatio: number
  ttfbP50: number
  ttfbP95: number
  ttfbP99: number
  errorRate: number
  errorsByStatus: { status, count, topPaths }[]
  error5xxTrend: TimeSeriesData
  totalBandwidthGB: number
  avgResponseSizeKB: number
}
```

Queries CDN data lake API. This is first-party server-side data — more reliable than Similarweb panel estimates. When both CDN and research_traffic are available, the synthesizer should prefer CDN numbers for traffic/performance claims.

#### Step 8: sourceHyperDx

```
Input:  HyperDxConfig { apiKey, serviceNames }
Output: HyperDxData {
  errorRate: number
  topErrors: { message, count, firstSeen, lastSeen, service }[]
  latency: { p50, p95, p99 }
  errorPaths: { path, count, statusCode }[]
  recentSpikes: { timestamp, metric, value }[]
}
```

Queries HyperDX API. Always fresh (no cache) — the whole point is catching recent errors.

#### Step 9: sourceBigQuery

```
Input:  BigQueryConfig { projectId, dataset, credentials } + url
Output: AnalyticsData {
  bounceByPageType: Record<string, number>
  conversionFunnel: { step, sessions, dropoff }[]
  trafficTrend: { date, sessions, users, revenue }[]
  deviceSplit: { desktop, mobile, tablet }
  topLandingPages: { path, sessions, bounceRate, avgDuration, revenue }[]
  searchConsole: { query, clicks, impressions, ctr, position }[]  // if available
}
```

Runs predefined BigQuery SQL queries against GA4 export tables. Queries are deterministic (same SQL templates with date range parameters).

#### Step 10: sourceRepo

```
Input:  RepoConfig { owner, repo, token }
Output: RepoData {
  framework: string                           // next, nuxt, remix, gatsby, vtex-io, faststore, etc.
  packageManager: string
  deps: { name, version, latest, outdated }[]
  bundleSize: { total, byRoute }              // if build stats available
  antiPatterns: { file, line, pattern, severity, suggestion }[]
  recentCommits: { message, author, date }[]  // last 20
  openIssues: number
}
```

Clones repo (shallow), analyzes package.json, looks for known anti-patterns (unoptimized images in code, missing lazy loading, large dependencies, etc.).

#### Step 11: synthesize

```
Input:  DataBundle {
  discovery, samples, perf, seo, content, research,
  cdn: CdnData | null,
  hyperdx: HyperDxData | null,
  bigquery: AnalyticsData | null,
  repo: RepoData | null
}
+ lang: "pt-BR" | "en"

Output: DiagnosticReport {
  id: string
  url: string
  healthScore: number
  scoreBreakdown: {
    structuredData: number    // 0-20
    contentEngine: number     // 0-15
    productSeo: number        // 0-15
    performance: number       // 0-20
    socialProof: number       // 0-10
    crossSell: number         // 0-10
    domainSignals: number     // 0-10
  }
  findings: Finding[]
  report: string              // final markdown
  metadata: { date, platform, cdn, language }
}
```

This is the only step that uses LLMs. Two-phase:

**Phase A — Parallel specialist agents** (each gets a data slice + focused ~60 line prompt):

| Agent | Model | Input | Output |
|-------|-------|-------|--------|
| Performance Analyst | Sonnet | perfData, cdnData?, hyperDxData? | PerfSection { markdown, scores: { performance }, findings[] } |
| SEO Analyst | Sonnet | seoData, repoData? | SeoSection { markdown, scores: { structuredData, domainSignals }, findings[] } |
| Content Analyst | Sonnet | contentData | ContentSection { markdown, scores: { contentEngine, productSeo, socialProof, crossSell }, findings[] } |
| Business Analyst | Sonnet | researchData, bigqueryData? | BusinessSection { markdown, findings[] } |

Each agent prompt contains:
- Its domain rules only (extracted from the current monolithic prompt)
- Data integrity rules (provenance, sampling caveats, hedging)
- Tone rules (opportunity framing, no superlatives, no emojis)
- Scoring rubric for its categories only
- The raw data as a JSON block

Each agent outputs structured JSON — not free-form markdown. The synthesizer composes.

**Phase B — Report synthesizer** (Opus):

Input: all 4 agent sections + metadata (url, date, platform, language, traffic data)

Prompt (~100 lines) contains:
- Report template (header, sections, tables, footer)
- Opportunity counting rules ({N} actions, {total_page_improvements} pages, {unique_urls} deduplicated)
- "What this requires" framing (scale → nature → deco AI Agents → autopilot close)
- "Strategic context" rules (market-level, no finding rehash)
- Self-review checklist (data provenance, tone, no repetition, site-specificity)

This agent stitches the section markdowns together, writes the holistic sections that need cross-cutting view, calculates the final health score by summing agent scores, and runs self-review.

#### Step 12: actions

```
Input:  DiagnosticReport + RepoData | null
Output: ActionProposal[] {
  type: "pr" | "issue" | "alert" | "manual"
  findingId: string
  title: string
  description: string
  automatable: boolean
  priority: "high" | "medium" | "low"
  // type: "pr"
  files?: { path, diff }[]
  // type: "alert"
  metric?: string
  threshold?: number
}
```

For V1: classifies each finding and `console.log`s the proposals.

Examples:
- "Missing JSON-LD on PDPs" + repo connected → `{ type: "pr", automatable: true }`
- "No review collection" → `{ type: "manual", description: "Integrate review platform" }`
- "TTFB p95 > 2s on /collections/*" + HyperDx connected → `{ type: "alert", metric: "ttfb_p95", threshold: 2000 }`
- "Cache hit rate 34%" + CDN data → `{ type: "issue", description: "Review cache-control headers" }`

For V2: actually execute — open PRs via GitHub API, create issues, configure alerts.

---

## 6. Pipeline Runner

The runner composes steps with caching and conditional source execution. Orchestrator-agnostic — just async functions.

```typescript
// src/workflows/diagnose/runner.ts

interface PipelineConfig {
  url: string;
  orgId: string;
  sources: {
    cdn?: CdnConfig;
    hyperdx?: HyperDxConfig;
    bigquery?: BigQueryConfig;
    repo?: RepoConfig;
  };
}

interface PipelineResult {
  report: DiagnosticReport;
  actions: ActionProposal[];
}

export async function runDiagnosePipeline(
  config: PipelineConfig,
  cache: KVStore,
): Promise<PipelineResult> {
  const { url, sources } = config;
  const lang = url.includes(".br") ? "pt-BR" : "en";

  const getOrRun = <T>(step: string, fn: () => Promise<T>) =>
    cachedRun(cache, step, url, fn);

  // Step 1: Discover
  const discovery = await getOrRun("discover", () => discover(url));

  // Step 2: Select samples (pure, no cache)
  const samples = selectSamples(discovery);

  // Steps 3-6: Parallel
  const [perf, seo, content, research] = await Promise.all([
    getOrRun("analyzePerf", () => analyzePerformance(samples)),
    getOrRun("analyzeSeo", () => analyzeSeo(url, samples)),
    getOrRun("analyzeContent", () => analyzeContent(samples, discovery)),
    getOrRun("research", () => research(url, discovery)),
  ]);

  // Steps 7-10: Proprietary sources (parallel, conditional)
  const [cdn, hyperdx, bigquery, repo] = await Promise.all([
    sources.cdn      ? cachedRun(cache, "sourceCdn", url, () => sourceCdn(sources.cdn!))                : null,
    sources.hyperdx  ? sourceHyperDx(sources.hyperdx)                                                    : null,
    sources.bigquery ? cachedRun(cache, "sourceBigQuery", url, () => sourceBigQuery(sources.bigquery!, url)) : null,
    sources.repo     ? cachedRun(cache, "sourceRepo", url, () => sourceRepo(sources.repo!))              : null,
  ]);

  const bundle: DataBundle = {
    discovery, samples, perf, seo, content, research,
    cdn, hyperdx, bigquery, repo,
  };

  // Step 11: Synthesize (multi-agent, never cached)
  const report = await synthesize(bundle, lang);

  // Step 12: Actions (never cached)
  const actions = await proposeActions(report, repo);

  return { report, actions };
}
```

### Wiring to an orchestrator (later)

The runner above works standalone. When you pick an orchestrator, you wrap each step:

```typescript
// Example: Inngest wiring (NOT part of core — lives in a separate file)
const diagnosePipeline = inngest.createFunction(
  { id: "diagnose", retries: 1 },
  { event: "diagnose.requested" },
  async ({ event, step }) => {
    const config = event.data;
    const discovery = await step.run("discover", () => discover(config.url));
    const samples = await step.run("select-samples", () => selectSamples(discovery));
    // ... same composition, wrapped in step.run for observability + retries
  }
);
```

Or just call `runDiagnosePipeline()` directly from an API endpoint. Or from a cron script. The functions don't care.

---

## 7. Auth Flow (Complete)

### Database tables

```
┌─────────────────────┐     ┌──────────────────────────┐
│ email_domain_mapping │     │ individual_email_mapping  │
├─────────────────────┤     ├──────────────────────────┤
│ domain (PK)         │────→│ email (PK)               │
│ org_id (FK)         │  │  │ org_id (FK)              │
└─────────────────────┘  │  └──────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  org_credentials    │
              ├─────────────────────┤
              │  org_id (PK)        │
              │  creds (JSON TEXT)  │
              └─────────────────────┘
```

### Resolution priority

1. `individual_email_mapping` (exact match on email) — highest priority
2. `email_domain_mapping` (match on email domain) — fallback
3. No match → authenticated but no org → public pipeline only

### End-to-end flows

**Anonymous:**
```
Client connects to /api/mcp?anon
  → No auth check
  → orgId = ""
  → sources = {}
  → Pipeline runs steps 1-6 only
  → Report generated without proprietary data
```

**Authenticated:**
```
Client opens login page
  → Enters email → BetterAuth sends OTP
  → Enters code → BetterAuth creates session (cookie)
  → Client connects to /api/mcp (cookie attached)
  → Server: auth.api.getSession(headers) → user.email
  → Server: resolveOrg(email) → org_id
  → Server: loadOrgCredentials(org_id) → creds JSON
  → Pipeline runs all steps including proprietary sources
  → Report includes CDN data, HyperDx errors, BigQuery analytics, repo analysis
```

---

## 8. What Stays, What Changes

### Stays the same
- Integration clients (browserless, dataforseo, firecrawl, etc.) — refactored into `src/integrations/`
- MCP App UI in `web/` — still renders reports
- R2 storage for screenshots and saved reports
- Report template structure (from vtexday branch)
- Health score rubric (from vtexday branch)
- Data integrity rules (from vtexday branch)

### Changes
- `shared/diagnostics.ts` (500-line monolith prompt) → split into 4 small agent prompts + 1 synthesizer prompt (used by automated pipeline only)
- 14 low-level MCP tools → ~6 step-level MCP tools (low-level tools become internal)
- Tool orchestration moves from prompt to code
- New `src/workflows/diagnose/` directory with pure functions
- New `src/auth/` with BetterAuth + org resolution
- New `src/cache/` with KVStore interface
- Proprietary sources (repo, HyperDX, BigQuery) move to agent layer — not pipeline steps on this server
- CDN data lake stays on this server (proprietary API needs server-side auth)

### New files to create

```
src/workflows/diagnose/types.ts
src/workflows/diagnose/01-discover.ts
src/workflows/diagnose/02-select-samples.ts
src/workflows/diagnose/03-analyze-perf.ts
src/workflows/diagnose/04-analyze-seo.ts
src/workflows/diagnose/05-analyze-content.ts
src/workflows/diagnose/06-research.ts
src/workflows/diagnose/07-source-cdn.ts
src/workflows/diagnose/08-source-hyperdx.ts
src/workflows/diagnose/09-source-bigquery.ts
src/workflows/diagnose/10-source-repo.ts
src/workflows/diagnose/11-synthesize.ts
src/workflows/diagnose/12-actions.ts
src/workflows/diagnose/runner.ts
src/workflows/diagnose/index.ts
src/cache/interface.ts
src/cache/fs.ts
src/cache/cloudflare-kv.ts
src/auth/auth.ts
src/auth/resolve-org.ts
src/auth/db.ts
src/integrations/hyperdx.ts
src/integrations/bigquery.ts
src/integrations/github.ts
src/integrations/cdn-datalake.ts
src/integrations/anthropic.ts
src/prompts/perf-analyst.ts
src/prompts/seo-analyst.ts
src/prompts/content-analyst.ts
src/prompts/business-analyst.ts
src/prompts/synthesizer.ts
```

---

## 9. Key Rules Extracted from Current Prompt

The current monolithic prompt at `shared/diagnostics.ts` (~500 lines on vtexday branch) contains rules that must be split across the specialist agent prompts. A fresh implementation should read that file in full. Here are the critical pieces by destination:

### For ALL agent prompts

**Tone & voice:**
- Direct, precise, professional. No filler, no exclamation marks, no superlatives.
- Frame as opportunity, never failure. "Not detected" instead of "zero" / "none" / "completely absent."
- No emojis anywhere.
- Each finding stated ONCE in its section, never restated elsewhere.

**Data integrity (non-negotiable):**
- Every number traces to a named tool call. If you can't name the tool, remove the number.
- Distinguish observation from inference. Observation = measured. Inference = use "likely", "suggests".
- Sampling always stated explicitly: "Of 3 PDPs sampled, none contained review section."
- Never extrapolate sample as catalog-wide fact.

**Language:**
- `.br` domain → pt-BR. Everything else → English.
- Keep English technical terms (JSON-LD, TTFB, CDN, CWV, SSR) even in pt-BR.

### For Performance Analyst

**Scoring rubric — Performance (0-20):**
- TTFB+Weight (0-10): 0 if >3s or >10MB | 3 if 2-3s or 5-10MB | 6 if 1-2s & 3-5MB | 8 if 600ms-1s & 1.5-3MB | 10 if <600ms & <1.5MB
- Caching (0-10): 0 if no-cache | 3 if homepage only | 6 if most pages low TTL | 10 if proper headers on all types

### For SEO Analyst

**Scoring rubric — Structured Data (0-20):**
0=no JSON-LD | 5=<25% or partial | 10=25-75% with Product | 15=>75% with Product+BreadcrumbList | 20=full coverage all types

**Scoring rubric — Domain Signals (0-10):**
SSL +2 | Sitemap valid +2 | Robots.txt valid +2 | Canonicals correct +2 | No conflicting robots meta +2

### For Content Analyst

**Scoring rubrics:**
- Content Engine (0-15): 0=no editorial | 3=exists, not in sitemaps | 5=in sitemaps <10 posts | 10=10-50 posts some SEO | 15=50+ posts active SEO-optimized
- Product SEO (0-15): 0=all generic | 5=<25% unique | 8=25-50% | 12=50-90% | 15=>90% unique keyword-targeted
- Social Proof (0-10): 0=no reviews | 3=reviews <5 avg | 6=5-50 avg | 10=50+ on most PDPs
- Cross-sell (0-10): 0=none | 3=API detected not rendered | 5=some PDPs | 10=all sampled PDPs

### For Report Synthesizer

**Report template structure** (read from `shared/diagnostics.ts` lines ~279-377 on vtexday):
1. Header: date, URL, platform, monthly visits, category, rankings
2. Health score line with 7-category breakdown
3. Site inventory with footnotes
4. Headline: "{total} improvement opportunities identified on {domain}"
5. Numbered opportunity sections (each with scope table, inline screenshots)
6. Opportunity summary table
7. "What this requires" (6-8 sentences: scale → nature → deco AI Agents → "Run your digital strategy on autopilot")
8. Strategic context (3-4 paragraphs, market-level, no finding rehash)
9. References and methodology
10. Footer: "Report generated by the deco AI diagnostic pipeline."

**Opportunity counting:**
- {N} = number of distinct actions
- {total_page_improvements} = sum of Pages Affected across all findings
- {unique_urls} = deduplicated page count
- Present all three transparently. Ongoing work (content production, review collection) noted separately.

**Benchmark safe list** (pre-vetted, anything else must be verifiably attributed or removed):
- "Every 0.1s mobile speed → +8.4% conversion (retail), +10.1% (travel)" (Deloitte 2020)
- "Product recommendations → 10-30% of e-commerce revenue" (McKinsey)
- "Rich snippets increase CTR by 20-40%" (SEJ/Ahrefs)
- "50+ reviews → 2-3x conversion vs. zero" (Bazaarvoice/Spiegel)
- "Unique descriptions → +30-50% organic traffic per PDP" (Ahrefs)
- "Review request emails: 5-15% response" (industry average)
- "AOV uplift with cross-sell: 8-15%" (Baymard)
- "Blogs → ~55% more visitors" (HubSpot)

---

## 10. Integration Layer Migration

The current codebase has integration logic embedded inside MCP tool definitions (e.g., `api/tools/capture-har.ts` contains both the Zod schema + the browserless puppeteer logic). For the rewrite:

1. **Extract** core integration logic from each `api/tools/*.ts` into `src/integrations/*.ts` as plain async functions
2. **MCP tools become thin wrappers** that call the integration function and format the result
3. **Pipeline steps call the same integration functions** — no duplication

Example:
```
Before:  api/tools/capture-har.ts (MCP tool def + browserless logic mixed)
After:   src/integrations/browserless.ts   → captureHar(url, opts): Promise<HarResult>
         api/tools/capture-har.ts          → MCP wrapper that calls captureHar()
         src/workflows/diagnose/03-analyze-perf.ts → pipeline step that calls captureHar()
```

Existing integration files to extract from:
- `api/tools/fetch-page.ts` → `src/integrations/fetch.ts`
- `api/tools/capture-har.ts` → `src/integrations/browserless.ts` (already partially at `api/lib/browserless.ts`)
- `api/tools/lighthouse.ts` → `src/integrations/browserless.ts`
- `api/tools/render-page.ts` → `src/integrations/browserless.ts`
- `api/tools/screenshot.ts` → `src/integrations/browserless.ts`
- `api/tools/crawl-site.ts` → `src/integrations/firecrawl.ts`
- `api/tools/scrape-page.ts` → `src/integrations/firecrawl.ts`
- `api/tools/audit-seo.ts` → `src/integrations/dataforseo.ts`
- `api/tools/research-serp.ts` → `src/integrations/dataforseo.ts`
- `api/tools/research-keywords.ts` → `src/integrations/dataforseo.ts`
- `api/tools/research-business.ts` → `src/integrations/perplexity.ts`
- `api/tools/research-traffic.ts` → `src/integrations/similarweb.ts`

---

## 11. Error Handling & Progress

### Step failure strategy

- **Steps 1-6 (public)**: If a step fails, abort the pipeline. These are required for a meaningful report.
  - Exception: individual sub-calls within a step can fail gracefully (e.g., editorial probing in discover — if `/blog` 404s, that's data, not an error).
- **Steps 7-10 (proprietary sources)**: If a source fails, log the error and continue with `null`. The synthesizer handles missing sources by omitting those sections and noting "data unavailable."
- **Step 11 (synthesize)**: If an individual specialist agent fails, retry once. If still fails, synthesizer works with available sections.
- **Step 12 (actions)**: If fails, log and return empty array. Report is still valid without action proposals.

### Progress reporting

The pipeline runner emits progress via a callback:

```typescript
type ProgressCallback = (event: {
  step: string;        // "discover" | "analyzePerf" | ...
  status: "running" | "done" | "error" | "skipped";
  message?: string;    // e.g. "Discovered 2,358 pages"
}) => void;

export async function runDiagnosePipeline(
  config: PipelineConfig,
  cache: KVStore,
  onProgress?: ProgressCallback,
): Promise<PipelineResult> { ... }
```

The HTTP layer can wire this to SSE for the UI, or just log it. The pure functions don't know about progress — the runner emits events between step calls.

---

## 12. Future: Sub-Agent Escape Hatch

The pipeline is deterministic-first — cross-validation of false positives (e.g., DataForSEO says "no JSON-LD" but the HTML has it) is handled in code within the step itself. However, some future verification cases may require judgment rather than parsing. For those, a structured sub-agent call inside a step could work:

```typescript
if (noJsonLdDetected) {
  const { isFalsePositive } = await subAgent(
    "The API returned saying PDPs have no JSON-LD. URLs tested: {urls}. Check the actual page source to confirm.",
    sandboxContext,
    { output: z.object({ isFalsePositive: z.boolean() }) }
  );
}
```

This is additive — doesn't require rearchitecting the pipeline. Each step stays a pure function; it just optionally calls an LLM for judgment when code-level checks aren't sufficient. Worth adding when the list of cases that need judgment (not just parsing) grows long enough. Examples that might justify it:
- "Is this product description actually unique or a template with the name swapped?"
- "Does this repo's rendering logic actually emit the structured data at runtime?" (needs code comprehension, not HTML parsing)
- "Is this 404 a real missing page or a bot-protection false block?"

Until then: keep a running list of cases where you wish you had a sub-agent, and build the pattern when the list justifies it.

---

## 13. Implementation Order

### Phase 1: Foundation
1. Set up `src/` directory structure
2. Create `cache/interface.ts` + `cache/memory.ts`
3. Create `workflows/diagnose/types.ts` with all interfaces
4. Implement `01-discover.ts` and `02-select-samples.ts`
5. Write tests for discover + selectSamples

### Phase 2: Analysis steps
6. Implement `03-analyze-perf.ts` (reuse existing captureHar, lighthouse, screenshot tools)
7. Implement `04-analyze-seo.ts` (reuse existing auditSeo, fetchPage)
8. Implement `05-analyze-content.ts` (reuse existing scrapePage, screenshot)
9. Implement `06-research.ts` (reuse existing research tools)
10. Create `runner.ts` with steps 1-6 wired up
11. Test the public pipeline end-to-end

### Phase 3: Synthesis
12. Write the 4 specialist agent prompts (~60 lines each)
13. Write the synthesizer prompt (~100 lines)
14. Implement `11-synthesize.ts`
15. Implement `12-actions.ts` (console.log v1)
16. Test full pipeline with real URLs

### Phase 4: Auth + proprietary sources
17. Set up BetterAuth with OTP + anonymous
18. Create DB schema + migrations
19. Implement org resolution (email → org_id → creds)
20. Implement `07-source-cdn.ts`
21. Implement `08-source-hyperdx.ts`
22. Implement `09-source-bigquery.ts`
23. Implement `10-source-repo.ts`
24. Wire auth into HTTP server in front of MCP runtime

### Phase 5: Production
25. `cache/cloudflare-kv.ts` implementation
26. D1 binding for prod database
27. Pipeline status endpoint (`/api/pipeline/status/:id`)
28. UI updates for login screen + source indicators in report
29. Deploy and test on Workers

---

## 14. Environment Variables

### Required (all environments)

| Variable | Description | Example |
|----------|-------------|---------|
| `BROWSERLESS_TOKEN` | Browserless.io API token (HAR, Lighthouse, screenshots, render) | `...` |
| `FIRECRAWL_API_KEY` | Firecrawl API for crawl_site + scrape_page | `fc-...` |
| `DATAFORSEO_API_KEY` | DataForSEO for audit_seo, research_serp, research_keywords | `...` |
| `S3_ENDPOINT` | R2-compatible S3 endpoint for screenshots + report storage | `https://xxx.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | R2 access key | `...` |
| `S3_SECRET_ACCESS_KEY` | R2 secret key | `...` |
| `ADMIN_SECRET` | Secret for `/purge` endpoint | any random string |

### Optional (all environments)

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSERLESS_ENDPOINT` | Browserless WebSocket URL | `wss://production-sfo.browserless.io` |
| `LIGHTHOUSE_BROWSERLESS_ENDPOINT` | Override browserless endpoint for Lighthouse only | falls back to `BROWSERLESS_ENDPOINT` |
| `LIGHTHOUSE_BROWSERLESS_TOKEN` | Override browserless token for Lighthouse only | falls back to `BROWSERLESS_TOKEN` |
| `S3_REGION` | R2 region | `auto` |
| `S3_BUCKET` | R2 bucket name | `site-diagnostics` |
| `PERPLEXITY_API_KEY` | Perplexity API for research_business | skips business research if missing |
| `APIFY_API_TOKEN` | Apify API for research_traffic (Similarweb) | skips traffic research if missing |
| `ANTHROPIC_API_KEY` | Claude API for automated/batch pipeline synthesis | not needed for MCP interactive mode |

### Local dev only

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Bun server port | `3001` |

### Cloudflare Workers bindings (wrangler.toml, not env vars)

| Binding | Type | Description |
|---------|------|-------------|
| `D1` | D1 Database | BetterAuth tables + org_credentials + email mappings |
| `CACHE` | KV Namespace | Pipeline step cache with per-step TTLs |
| `DIAGNOSE_PIPELINE` | Workflow | Durable pipeline execution for automated/batch runs |

In local dev these are replaced by:
- `D1` → `bun:sqlite` file at `data/auth.sqlite`
- `CACHE` → file-based `.kv/` directory (gitignored)

### Wrangler secrets (prod, set via `wrangler secret put`)

All "Required" and "Optional" env vars above are set as wrangler secrets. They're accessed via `process.env` in the Workers runtime (with `nodejs_compat` flag enabled).
