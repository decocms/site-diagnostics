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
// Screenshot upload
// ---------------------------------------------------------------------------

export async function uploadScreenshot(
	buf: Buffer,
	filename: string,
): Promise<string> {
	const key = `screenshots/${filename}`;
	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: key,
			Body: buf,
			ContentType: "image/png",
		}),
	);
	const publicUrl = process.env.S3_PUBLIC_URL;
	if (!publicUrl) throw new Error("S3_PUBLIC_URL env var is not set");
	return `${publicUrl.replace(/\/$/, "")}/${key}`;
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
