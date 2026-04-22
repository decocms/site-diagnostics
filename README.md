# Site Diagnostics

Blackbox performance and SEO diagnostics for storefronts and high-traffic websites, built as an MCP App on deco.

## Quick Start

```bash
bun install
bun run dev
```

## Project Structure

```
├── api/                        # MCP server (Bun)
│   ├── main.ts                 # Server entry point with middleware
│   ├── tools/                  # MCP tool definitions
│   │   ├── index.ts            # Tool registry
│   │   ├── diagnose.ts         # Diagnose tool (launches UI)
│   │   ├── fetch-page.ts       # HTTP fetch (no browser)
│   │   ├── capture-har.ts      # HAR capture (browser)
│   │   ├── lighthouse.ts       # Lighthouse audit
│   │   ├── render-page.ts      # Browser render + DOM
│   │   └── screenshot.ts       # Page screenshot
│   ├── prompts/
│   │   └── site-diagnostics.ts # /diagnose prompt
│   └── resources/
│       └── diagnose.ts         # MCP App resource (serves HTML)
├── shared/                     # Shared code (API + Web)
│   └── diagnostics.ts          # Shared diagnostics prompt text
├── web/                        # React UI (MCP App)
│   ├── tools/diagnostics/      # Diagnostics tool UI
│   ├── components/ui/          # shadcn/ui components
│   └── router.tsx              # Tool page router
├── app.json                    # Deco mesh config
└── package.json
```

## Development

```bash
bun run dev          # API server + web build (watch mode)
bun run dev:api      # API server only (port 3001)
bun run dev:web      # Web build only (watch mode)
bun run build        # Production build
bun run check        # TypeScript type checking
bun run ci:check     # Biome lint + format check
```

## Connecting a Client

The MCP server is exposed over SSE at `/api/mcp`.

- **Production**: `https://site-diagnostics.decocms.com/api/mcp`
- **Local dev**: `http://localhost:3001/api/mcp`

Query params select the access mode:

- no param — public tools only, anonymous (zero friction)
- `?anon` — explicit anonymous session
- `?proprietary` — authenticated session; required for tools that need user credentials. Unauthenticated requests get a `401` with a `WWW-Authenticate` header pointing at the OAuth metadata, which MCP clients use to run the interactive OTP + OAuth flow (email code via Resend, consent screen, bearer token).

### Claude Code

```bash
# public tools, no auth
claude mcp add --transport sse site-diagnostics https://site-diagnostics.decocms.com/api/mcp

# authenticated (triggers interactive OAuth flow on first use)
claude mcp add --transport sse site-diagnostics "https://site-diagnostics.decocms.com/api/mcp?proprietary"
```

### Claude Desktop / other MCP hosts

Point the host at the same URL with SSE transport. Hosts that support OAuth discovery (Claude Desktop, Claude Code, MCP Inspector) will auto-handle the login flow when the `?proprietary` endpoint returns `401`.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Server**: [@decocms/runtime](https://github.com/decocms/runtime) MCP server
- **UI**: React 19 + [TanStack Router](https://tanstack.com/router) + [shadcn/ui](https://ui.shadcn.com)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) v4
- **MCP Apps**: [@modelcontextprotocol/ext-apps](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) SDK
- **Build**: [Vite](https://vitejs.dev) + [vite-plugin-singlefile](https://github.com/nickreese/vite-plugin-singlefile)
