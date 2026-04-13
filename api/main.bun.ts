import { createApp } from "./app.ts";

const app = createApp();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

Bun.serve({
	idleTimeout: 0,
	hostname: "0.0.0.0",
	port: PORT,
	fetch: app.fetch,
});

const slug = process.env.WORKTREE_SLUG;
const baseUrl = slug ? `http://${slug}.localhost` : `http://localhost:${PORT}`;

console.log("");
console.log(`\x1b[35mMCP App\x1b[0m: ${baseUrl}/api/mcp`);
console.log("");
