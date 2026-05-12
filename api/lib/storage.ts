import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import type { Diagnostic, DiagnosticMeta } from "../types/diagnostic.ts";

// ---------------------------------------------------------------------------
// S3-compatible storage for diagnostics (Cloudflare R2)
// ---------------------------------------------------------------------------

function getClient(): S3Client {
	return new S3Client({
		endpoint: process.env.S3_ENDPOINT,
		region: process.env.S3_REGION ?? "auto",
		credentials: {
			accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
		},
	});
}

function getBucket(): string {
	return process.env.S3_BUCKET ?? "site-diagnostics";
}

function diagnosticKey(orgId: string, id: string): string {
	return `diagnostics/${orgId}/${id}.json`;
}

function indexKey(orgId: string): string {
	return `diagnostics/${orgId}/_index.json`;
}

async function getJson<T>(key: string): Promise<T | null> {
	try {
		const res = await getClient().send(
			new GetObjectCommand({ Bucket: getBucket(), Key: key }),
		);
		const body = await res.Body?.transformToString("utf-8");
		return body ? (JSON.parse(body) as T) : null;
	} catch (err: unknown) {
		if (
			err instanceof Error &&
			(err.name === "NoSuchKey" || err.name === "NotFound")
		) {
			return null;
		}
		throw err;
	}
}

async function putJson(key: string, data: unknown): Promise<void> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: key,
			Body: JSON.stringify(data, null, "\t"),
			ContentType: "application/json",
		}),
	);
}

// ---------------------------------------------------------------------------
// Screenshot storage
// ---------------------------------------------------------------------------

export async function uploadScreenshot(
	buf: Buffer,
	filename: string,
): Promise<void> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: `screenshots/${filename}`,
			Body: buf,
			ContentType: "image/png",
		}),
	);
}

export async function getScreenshot(
	filename: string,
): Promise<ReadableStream | null> {
	try {
		const res = await getClient().send(
			new GetObjectCommand({
				Bucket: getBucket(),
				Key: `screenshots/${filename}`,
			}),
		);
		return (res.Body?.transformToWebStream() as ReadableStream) ?? null;
	} catch (err: unknown) {
		if (
			err instanceof Error &&
			(err.name === "NoSuchKey" || err.name === "NotFound")
		) {
			return null;
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Diagnostic CRUD
// ---------------------------------------------------------------------------

export async function saveDiagnostic(
	diagnostic: Diagnostic,
	orgId: string,
): Promise<string> {
	await putJson(diagnosticKey(orgId, diagnostic.id), diagnostic);

	const idxKey = indexKey(orgId);
	const index = (await getJson<DiagnosticMeta[]>(idxKey)) ?? [];
	const updated = index.filter((m) => m.id !== diagnostic.id);
	updated.unshift({
		id: diagnostic.id,
		url: diagnostic.url,
		title: diagnostic.title,
		createdAt: diagnostic.createdAt,
		healthScore: diagnostic.healthScore,
		summary: diagnostic.summary,
		reportPreview: diagnostic.report?.slice(0, 600),
		status: diagnostic.status ?? "complete",
	});
	await putJson(idxKey, updated);

	return diagnostic.id;
}

export async function loadDiagnostic(
	id: string,
	orgId: string,
): Promise<Diagnostic | null> {
	return getJson<Diagnostic>(diagnosticKey(orgId, id));
}

export async function listDiagnostics(
	orgId: string,
): Promise<DiagnosticMeta[]> {
	return (await getJson<DiagnosticMeta[]>(indexKey(orgId))) ?? [];
}

export async function deleteDiagnostic(
	id: string,
	orgId: string,
): Promise<void> {
	await getClient().send(
		new DeleteObjectCommand({
			Bucket: getBucket(),
			Key: diagnosticKey(orgId, id),
		}),
	);

	const idxKey = indexKey(orgId);
	const index = (await getJson<DiagnosticMeta[]>(idxKey)) ?? [];
	const updated = index.filter((m) => m.id !== id);
	await putJson(idxKey, updated);
}

// ---------------------------------------------------------------------------
// Public share tokens
// ---------------------------------------------------------------------------
// Token -> { orgId, diagnosticId, expiresAt } mapping kept outside the org
// scope because the token itself is the access grant.

export interface PublicShare {
	token: string;
	orgId: string;
	diagnosticId: string;
	createdAt: string;
	/** ISO string; when absent the share never expires. */
	expiresAt?: string;
}

function publicShareKey(token: string): string {
	return `public-shares/${token}.json`;
}

export async function savePublicShare(share: PublicShare): Promise<void> {
	await putJson(publicShareKey(share.token), share);
}

export async function loadPublicShare(
	token: string,
): Promise<PublicShare | null> {
	const share = await getJson<PublicShare>(publicShareKey(token));
	if (!share) return null;
	if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
		// Best-effort cleanup of expired shares.
		await deletePublicShare(token).catch(() => {});
		return null;
	}
	return share;
}

// ---------------------------------------------------------------------------
// OG image cache (per-token, R2-backed)
// ---------------------------------------------------------------------------
// Per-diagnostic OG cards are rendered on first request and cached here so
// subsequent crawler hits are O(1) and don't re-fetch the favicon or run
// resvg again.

export async function saveOgImage(
	token: string,
	png: Uint8Array,
): Promise<void> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: `og-images/${token}.png`,
			Body: png,
			ContentType: "image/png",
			CacheControl: "public, max-age=31536000, immutable",
		}),
	);
}

export async function loadOgImage(
	token: string,
): Promise<ReadableStream | null> {
	try {
		const res = await getClient().send(
			new GetObjectCommand({
				Bucket: getBucket(),
				Key: `og-images/${token}.png`,
			}),
		);
		return (res.Body?.transformToWebStream() as ReadableStream) ?? null;
	} catch (err: unknown) {
		if (
			err instanceof Error &&
			(err.name === "NoSuchKey" || err.name === "NotFound")
		) {
			return null;
		}
		throw err;
	}
}

export async function deletePublicShare(token: string): Promise<void> {
	await getClient().send(
		new DeleteObjectCommand({
			Bucket: getBucket(),
			Key: publicShareKey(token),
		}),
	);
}
