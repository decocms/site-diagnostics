#!/usr/bin/env bun

/**
 * Publish the site-diagnostics MCP to the Mesh Admin registry.
 *
 * Usage:
 *   bun scripts/publish.ts [--dry-run]
 *
 * Environment:
 *   MESH_ADMIN_URL  - Override the publish URL
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

interface AppJson {
	scopeName: string;
	name: string;
	friendlyName?: string;
	description?: string;
	icon?: string;
	unlisted?: boolean;
	official?: boolean;
	connection?: {
		type?: string;
		url?: string;
		configSchema?: Record<string, unknown>;
	};
	metadata?: {
		categories?: string[];
		official?: boolean;
		tags?: string[];
		short_description?: string;
		mesh_description?: string;
		mesh_unlisted?: boolean;
	};
	tools?: Array<{ name: string; description?: string }>;
}

const PUBLISH_URL =
	process.env.MESH_ADMIN_URL ??
	"https://studio.decocms.com/org/deco/registry/publish-request";

const ROOT = join(import.meta.dir, "..");
const APP_JSON_PATH = join(ROOT, "app.json");
const dryRun = process.argv.includes("--dry-run");

async function readReadme(): Promise<string | null> {
	const readmePath = join(ROOT, "README.md");
	try {
		await stat(readmePath);
		const content = await readFile(readmePath, "utf-8");
		return content.trim() ? content.slice(0, 50_000) : null;
	} catch {
		return null;
	}
}

async function getLastCommitter() {
	try {
		const result = await $`git log -1 --format=%an|||%ae`.cwd(ROOT).quiet();
		const output = result.stdout.toString().trim();
		const [name, email] = output.split("|||");
		if (name && email) return { name, email };
	} catch {
		// fallback below
	}
	return { name: "github-actions", email: "eng@deco.cx" };
}

async function main() {
	const app = JSON.parse(await readFile(APP_JSON_PATH, "utf-8")) as AppJson;
	const readme = await readReadme();
	const committer = await getLastCommitter();

	const hasRemote =
		app.connection?.type !== "BINDING" && Boolean(app.connection?.url);
	const hasOAuth = Boolean(app.connection?.configSchema);

	const remotes =
		hasRemote && app.connection?.url
			? [
					{
						type: app.connection.type ?? "HTTP",
						url: app.connection.url,
						name: app.name,
						title: app.friendlyName ?? app.name,
						description: app.description,
					},
				]
			: [];

	const meshMeta = {
		verified: app.metadata?.official ?? app.official ?? false,
		friendly_name: app.friendlyName ?? null,
		short_description: app.metadata?.short_description?.slice(0, 160) ?? null,
		owner: app.scopeName,
		has_remote: hasRemote,
		has_oauth: hasOAuth,
		...(app.metadata?.tags?.length ? { tags: app.metadata.tags } : {}),
		...(app.metadata?.categories?.length
			? { categories: [app.metadata.categories[0]] }
			: {}),
		readme: readme ?? app.metadata?.mesh_description ?? null,
		...(app.tools?.length
			? {
					tools: app.tools.map((t) => ({
						name: t.name,
						description: t.description ?? null,
					})),
				}
			: {}),
	};

	const payload = {
		data: {
			id: `${app.scopeName}/${app.name}`,
			title: app.friendlyName ?? app.name,
			description: app.description ?? null,
			is_public: !(app.unlisted ?? app.metadata?.mesh_unlisted ?? false),
			_meta: { "mcp.mesh": meshMeta },
			server: {
				name: app.name,
				title: app.friendlyName ?? app.name,
				description: app.description,
				...(app.icon ? { icons: [{ src: app.icon }] } : {}),
				...(remotes.length ? { remotes } : {}),
			},
		},
		requester: committer,
	};

	console.log(
		`📦 ${app.name} → id=${payload.data.id} | requester=${committer.name} <${committer.email}>`,
	);

	if (dryRun) {
		console.log(JSON.stringify(payload, null, 2));
		console.log("\n⚠️  --dry-run: request not sent");
		return;
	}

	console.log("🚀 Publishing to mesh registry...");

	const res = await fetch(PUBLISH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	const body = await res.text();

	if (res.status === 409) {
		console.log("✅ Already up to date (409)");
	} else if (res.status >= 200 && res.status < 300) {
		console.log(`✅ Published successfully (${res.status})`);
	} else {
		console.error(`❌ Publish failed (${res.status}): ${body}`);
		console.error(`   URL: ${PUBLISH_URL}`);
		console.error(`   Payload: ${JSON.stringify(payload, null, 2)}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});
