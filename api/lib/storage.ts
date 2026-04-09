import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Diagnostic, DiagnosticMeta } from "../types/diagnostic.ts";

// ---------------------------------------------------------------------------
// Local filesystem storage for diagnostics
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dir, "../../.data");
const DIAGNOSTICS_DIR = join(DATA_DIR, "diagnostics");
const INDEX_PATH = join(DIAGNOSTICS_DIR, "_index.json");

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJson(path: string, data: unknown): void {
	const dir = join(path, "..");
	ensureDir(dir);
	writeFileSync(path, JSON.stringify(data, null, "\t"));
}

// ---------------------------------------------------------------------------
// Diagnostic CRUD
// ---------------------------------------------------------------------------

export function saveDiagnostic(diagnostic: Diagnostic): string {
	ensureDir(DIAGNOSTICS_DIR);

	// Write full diagnostic
	writeJson(join(DIAGNOSTICS_DIR, `${diagnostic.id}.json`), diagnostic);

	// Update index
	const index = readJson<DiagnosticMeta[]>(INDEX_PATH) ?? [];
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
	writeJson(INDEX_PATH, updated);

	return diagnostic.id;
}

export function loadDiagnostic(id: string): Diagnostic | null {
	return readJson<Diagnostic>(join(DIAGNOSTICS_DIR, `${id}.json`));
}

export function listDiagnostics(): DiagnosticMeta[] {
	return readJson<DiagnosticMeta[]>(INDEX_PATH) ?? [];
}

export function deleteDiagnostic(id: string): void {
	const filePath = join(DIAGNOSTICS_DIR, `${id}.json`);
	if (existsSync(filePath)) unlinkSync(filePath);

	const index = readJson<DiagnosticMeta[]>(INDEX_PATH) ?? [];
	const updated = index.filter((m) => m.id !== id);
	writeJson(INDEX_PATH, updated);
}
