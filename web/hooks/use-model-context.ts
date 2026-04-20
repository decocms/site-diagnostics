import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "../../api/types/diagnostic.ts";
import type { DiagnosticMeta } from "../tools/diagnostics/components/history-list.tsx";

type View =
	| { type: "home" }
	| { type: "loading"; url: string }
	| { type: "report"; diagnostic: Diagnostic };

const MAX_REPORT_PREVIEW = 2000;

export function useModelContext(
	app: App | null,
	view: View,
	diagnostics: DiagnosticMeta[],
	debounceMs = 500,
) {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!app) return;

		if (timerRef.current) clearTimeout(timerRef.current);

		timerRef.current = setTimeout(() => {
			const text = buildContextText(view, diagnostics);
			app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {});
		}, debounceMs);

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [app, view, diagnostics, debounceMs]);

	// Clear context on unmount
	useEffect(() => {
		return () => {
			if (app) {
				app.updateModelContext({ content: [] }).catch(() => {});
			}
		};
	}, [app]);
}

function buildContextText(view: View, diagnostics: DiagnosticMeta[]): string {
	const lines: string[] = [];

	lines.push("## Site Diagnostics Tool");

	if (view.type === "home") {
		lines.push("- View: Home");
		if (diagnostics.length > 0) {
			lines.push(`- Recent diagnostics: ${diagnostics.length}`);
			const sites = diagnostics
				.slice(0, 5)
				.map((d) => {
					const score =
						d.healthScore != null ? ` (score: ${d.healthScore})` : "";
					return `  - ${d.title || d.url}${score}`;
				})
				.join("\n");
			lines.push(`- Sites analyzed:\n${sites}`);
		} else {
			lines.push("- No diagnostics run yet");
		}
		return lines.join("\n");
	}

	if (view.type === "loading") {
		lines.push("- View: Analyzing");
		lines.push(`- URL being analyzed: ${view.url}`);
		return lines.join("\n");
	}

	// report view
	const { diagnostic } = view;
	lines.push("- View: Report");
	lines.push(`- Site: ${diagnostic.title} (${diagnostic.url})`);
	lines.push(`- Diagnostic ID: ${diagnostic.id}`);
	if (diagnostic.healthScore != null) {
		lines.push(`- Health Score: ${diagnostic.healthScore}/100`);
	}
	lines.push(`- Analyzed: ${diagnostic.createdAt}`);
	if (diagnostic.summary) {
		lines.push(`- Summary: ${diagnostic.summary}`);
	}

	const report =
		diagnostic.report.length > MAX_REPORT_PREVIEW
			? `${diagnostic.report.slice(0, MAX_REPORT_PREVIEW)}\n… (truncated)`
			: diagnostic.report;
	lines.push(`\n### Report\n${report}`);

	return lines.join("\n");
}
