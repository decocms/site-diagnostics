/**
 * Lists existing public-share tokens stored in R2. Useful for local testing —
 * grab a real token to curl against /d/{token}.
 *
 * Run: bun --env-file=.dev.vars run scripts/list-share-tokens.ts
 */

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
	endpoint: process.env.S3_ENDPOINT,
	region: process.env.S3_REGION ?? "auto",
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
	},
});

const res = await client.send(
	new ListObjectsV2Command({
		Bucket: process.env.S3_BUCKET ?? "site-diagnostics",
		Prefix: "public-shares/",
		MaxKeys: 20,
	}),
);

const tokens = (res.Contents ?? [])
	.map((o) => o.Key)
	.filter((k): k is string => Boolean(k))
	.map((k) => k.replace(/^public-shares\//, "").replace(/\.json$/, ""));

if (tokens.length === 0) {
	console.log("No public-share tokens found in R2.");
	process.exit(0);
}

console.log(`Found ${tokens.length} token(s):`);
for (const t of tokens) console.log(`  ${t}`);
console.log("\nTest with:");
console.log(`  TOKEN=${tokens[0]}`);
console.log(
	"  curl -s http://localhost:8787/d/$TOKEN | head -c 4096 | grep -cE 'og:(title|description|image)'",
);
