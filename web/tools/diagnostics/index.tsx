import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMcpApp } from "@/context.tsx";
import type { Diagnostic } from "../../../api/types/diagnostic.ts";
import { buildDiagnoseMessage } from "../../../shared/diagnostics.ts";
import {
	type DiagnosticMeta,
	HistoryList,
} from "./components/history-list.tsx";
import { LoadingState } from "./components/loading-state.tsx";
import { ReportView } from "./components/report-view.tsx";
import { UrlForm } from "./components/url-form.tsx";

type View =
	| { type: "home" }
	| { type: "loading"; url: string }
	| { type: "report"; diagnostic: Diagnostic };

/** Ghost skeleton of a diagnostic report — visual texture behind the hero */
function ReportSkeleton() {
	return (
		<div
			className="w-full max-w-[560px] mx-auto rounded-xl border border-foreground/[0.15] p-8 opacity-65 relative"
			aria-hidden
			style={{
				maskImage: "linear-gradient(to bottom, black 0%, transparent 85%)",
				WebkitMaskImage:
					"linear-gradient(to bottom, black 0%, transparent 85%)",
			}}
		>
			{/* Animated border beam */}
			<svg
				aria-hidden="true"
				className="absolute inset-0 pointer-events-none"
				style={{ width: "100%", height: "100%", overflow: "visible" }}
				fill="none"
			>
				{/* leading fade */}
				<rect
					x="0"
					y="0"
					rx="12"
					stroke="#14b8a6"
					strokeOpacity="0.2"
					strokeWidth="1"
					strokeDasharray="6 94"
					pathLength="100"
					style={{
						width: "100%",
						height: "100%",
						animation: "border-dash-l1 4s linear infinite",
					}}
				/>
				{/* main beam */}
				<rect
					x="0"
					y="0"
					rx="12"
					stroke="#14b8a6"
					strokeOpacity="0.55"
					strokeWidth="1"
					strokeDasharray="10 90"
					pathLength="100"
					style={{
						width: "100%",
						height: "100%",
						animation: "border-dash 4s linear infinite",
					}}
				/>
				{/* trailing fades */}
				<rect
					x="0"
					y="0"
					rx="12"
					stroke="#14b8a6"
					strokeOpacity="0.3"
					strokeWidth="1"
					strokeDasharray="8 92"
					pathLength="100"
					style={{
						width: "100%",
						height: "100%",
						animation: "border-dash-t1 4s linear infinite",
					}}
				/>
				<rect
					x="0"
					y="0"
					rx="12"
					stroke="#14b8a6"
					strokeOpacity="0.12"
					strokeWidth="1"
					strokeDasharray="5 95"
					pathLength="100"
					style={{
						width: "100%",
						height: "100%",
						animation: "border-dash-t2 4s linear infinite",
					}}
				/>
			</svg>

			<div
				className="space-y-8"
				style={{
					maskImage: "linear-gradient(to bottom, black 0%, transparent 40%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, black 0%, transparent 40%)",
				}}
			>
				{/* Title */}
				<div className="space-y-3">
					<div className="h-4 w-2/3 rounded-full bg-foreground/[0.07]" />
					<div className="h-3 w-2/5 rounded-full bg-foreground/[0.05]" />
				</div>

				{/* Paragraph */}
				<div className="space-y-2.5">
					<div className="h-2.5 w-full rounded-full bg-foreground/[0.05]" />
					<div className="h-2.5 w-full rounded-full bg-foreground/[0.05]" />
					<div className="h-2.5 w-3/5 rounded-full bg-foreground/[0.05]" />
				</div>

				{/* Heading */}
				<div className="h-3.5 w-1/3 rounded-full bg-foreground/[0.06]" />

				{/* Paragraph */}
				<div className="space-y-2.5">
					<div className="h-2.5 w-full rounded-full bg-foreground/[0.05]" />
					<div className="h-2.5 w-4/5 rounded-full bg-foreground/[0.05]" />
				</div>

				{/* Table */}
				<div className="space-y-0 rounded-lg border border-foreground/[0.05] overflow-hidden">
					<div className="flex gap-6 px-4 py-3">
						<div className="h-2.5 w-1/5 rounded-full bg-foreground/[0.06]" />
						<div className="h-2.5 w-1/5 rounded-full bg-foreground/[0.06]" />
						<div className="h-2.5 w-1/5 rounded-full bg-foreground/[0.06]" />
					</div>
					{[1, 2].map((i) => (
						<div
							key={i}
							className="flex gap-6 px-4 py-3 border-t border-foreground/[0.04]"
						>
							<div className="h-2 w-1/5 rounded-full bg-foreground/[0.04]" />
							<div className="h-2 w-1/5 rounded-full bg-foreground/[0.04]" />
							<div className="h-2 w-1/5 rounded-full bg-foreground/[0.04]" />
						</div>
					))}
				</div>

				{/* Paragraph */}
				<div className="space-y-2.5">
					<div className="h-2.5 w-full rounded-full bg-foreground/[0.05]" />
					<div className="h-2.5 w-2/3 rounded-full bg-foreground/[0.05]" />
				</div>
			</div>
		</div>
	);
}

export default function DiagnosticsPage() {
	const app = useMcpApp();
	const [view, setView] = useState<View>({ type: "home" });
	const [diagnostics, setDiagnostics] = useState<DiagnosticMeta[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(true);
	const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

	const refreshHistory = useCallback(async () => {
		if (!app) return;
		try {
			const result = await app.callServerTool({
				name: "list_diagnostics",
				arguments: {},
			});
			const text = result.content?.find(
				(c: { type: string }) => c.type === "text",
			);
			if (text && "text" in text) {
				const data = JSON.parse(text.text);
				setDiagnostics(data.diagnostics ?? []);
			}
		} catch (err) {
			console.error("Failed to load diagnostics:", err);
		} finally {
			setLoadingHistory(false);
		}
	}, [app]);

	const loadDiagnostic = useCallback(
		async (id: string) => {
			if (!app) return;
			try {
				const result = await app.callServerTool({
					name: "load_diagnostic",
					arguments: { id },
				});
				const text = result.content?.find(
					(c: { type: string }) => c.type === "text",
				);
				if (text && "text" in text) {
					const diagnostic: Diagnostic = JSON.parse(text.text);
					setView({ type: "report", diagnostic });
				}
			} catch (err) {
				console.error("Failed to load diagnostic:", err);
			}
		},
		[app],
	);

	const deleteDiagnostic = useCallback(
		async (id: string) => {
			if (!app) return;
			try {
				await app.callServerTool({
					name: "delete_diagnostic",
					arguments: { id },
				});
				setDiagnostics((prev) => prev.filter((d) => d.id !== id));
			} catch (err) {
				console.error("Failed to delete diagnostic:", err);
			}
		},
		[app],
	);

	useEffect(() => {
		refreshHistory();
	}, [refreshHistory]);

	useEffect(() => {
		if (view.type !== "loading") {
			if (pollRef.current) clearInterval(pollRef.current);
			return;
		}

		pollRef.current = setInterval(async () => {
			if (!app) return;
			try {
				const result = await app.callServerTool({
					name: "list_diagnostics",
					arguments: {},
				});
				const text = result.content?.find(
					(c: { type: string }) => c.type === "text",
				);
				if (text && "text" in text) {
					const data = JSON.parse(text.text);
					const list: DiagnosticMeta[] = data.diagnostics ?? [];
					setDiagnostics(list);

					if (view.type === "loading") {
						const found = list.find(
							(d) =>
								d.url.includes(
									new URL(
										view.url.startsWith("http")
											? view.url
											: `https://${view.url}`,
									).hostname.replace(/^www\./, ""),
								) && d.status === "complete",
						);
						if (
							found &&
							new Date(found.createdAt).getTime() > Date.now() - 300_000
						) {
							loadDiagnostic(found.id);
						}
					}
				}
			} catch {
				// ignore polling errors
			}
		}, 5000);

		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [app, view, loadDiagnostic]);

	const handleSubmit = useCallback(
		async (url: string) => {
			if (!app) return;

			setView({ type: "loading", url });

			try {
				await app.sendMessage({
					role: "user",
					content: [
						{
							type: "text",
							text: buildDiagnoseMessage(url),
						},
					],
				});
			} catch (err) {
				console.error("Failed to send message:", err);
				setView({ type: "home" });
			}
		},
		[app],
	);

	if (view.type === "report") {
		return (
			<ReportView
				diagnostic={view.diagnostic}
				onBack={() => {
					refreshHistory();
					setView({ type: "home" });
				}}
			/>
		);
	}

	if (view.type === "loading") {
		return (
			<LoadingState
				url={view.url}
				onBack={() => {
					refreshHistory();
					setView({ type: "home" });
				}}
			/>
		);
	}

	const hasHistory = diagnostics.length > 0;
	const showContent = hasHistory;

	return (
		<div className="h-dvh overflow-y-auto">
			{/* Hero section with skeleton background */}
			<div className="relative overflow-hidden">
				{/* Skeleton background — sits behind everything */}
				<div className="absolute inset-0 pointer-events-none">
					<div className="pt-24 pb-16">
						<ReportSkeleton />
					</div>
				</div>

				{/* Hero content — on top */}
				<div
					className="relative z-10 flex flex-col items-center px-5 w-full max-w-lg mx-auto text-center"
					style={{
						paddingTop: showContent ? "160px" : "calc(50dvh - 140px)",
						paddingBottom: showContent ? "2.5rem" : "0",
					}}
				>
					<div className="flex flex-col items-center gap-3 mb-8">
						<div className="flex items-center justify-center size-10 rounded-xl bg-teal-500/10 mb-1">
							<Search className="size-5 text-teal-500" />
						</div>
						<h1 className="text-2xl font-semibold tracking-tight leading-snug">
							Paste your site.
							<br />
							<span className="opacity-75">See what you're missing.</span>
						</h1>
						<p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
							We analyze your storefront across 7 dimensions and surface every
							opportunity your team hasn't gotten to yet.
						</p>
					</div>

					<div className="w-full max-w-sm">
						<UrlForm
							onSubmit={handleSubmit}
							disabled={false}
						/>
					</div>

					{loadingHistory && !hasHistory && (
						<span className="mt-6 w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					)}
				</div>
			</div>

			{/* Content */}
			{hasHistory && (
				<div className="px-5 pb-8">
					<div className="mb-3">
						<p className="text-xs font-medium text-muted-foreground">
							Recent Diagnostics
						</p>
					</div>
					{loadingHistory ? (
						<div className="flex items-center justify-center py-8">
							<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
						</div>
					) : (
						<HistoryList
							diagnostics={diagnostics}
							onSelect={loadDiagnostic}
							onDelete={deleteDiagnostic}
						/>
					)}
				</div>
			)}
		</div>
	);
}
