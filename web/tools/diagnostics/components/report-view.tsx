import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

interface Diagnostic {
	id: string;
	url: string;
	title: string;
	createdAt: string;
	healthScore?: number;
	summary?: string;
	report: string;
	status: string;
}

function getScoreColor(score: number): string {
	if (score >= 80) return "text-success";
	if (score >= 50) return "text-warning";
	return "text-destructive";
}

function getScoreRingClass(score: number): string {
	if (score >= 80) return "stroke-success";
	if (score >= 50) return "stroke-warning";
	return "stroke-destructive";
}

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** Clean score ring — no colored background, no verdict label */
function ScoreCard({ score, summary }: { score: number; summary?: string }) {
	const radius = 40;
	const circumference = 2 * Math.PI * radius;
	const [drawn, setDrawn] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setDrawn(true), 120);
		return () => clearTimeout(t);
	}, []);

	const offset = drawn
		? circumference - (score / 100) * circumference
		: circumference;

	return (
		<div className="rounded-xl border border-border p-5 mb-8">
			<div className="flex items-center gap-5">
				{/* Score ring */}
				<div className="relative inline-flex items-center justify-center shrink-0">
					<svg
						width="96"
						height="96"
						viewBox="0 0 96 96"
						className="-rotate-90"
						role="img"
						aria-label={`Health score: ${score} out of 100`}
					>
						<circle
							cx="48"
							cy="48"
							r={radius}
							fill="none"
							strokeWidth="5"
							className="stroke-foreground/[0.07]"
						/>
						<circle
							cx="48"
							cy="48"
							r={radius}
							fill="none"
							strokeWidth="5"
							strokeLinecap="round"
							strokeDasharray={circumference}
							strokeDashoffset={offset}
							className={getScoreRingClass(score)}
							style={{
								transition:
									"stroke-dashoffset 1.1s cubic-bezier(0.19, 1, 0.22, 1)",
							}}
						/>
					</svg>
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span
							className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${getScoreColor(score)}`}
						>
							{score}
						</span>
						<span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mt-0.5">
							/100
						</span>
					</div>
				</div>

				{/* Summary — no verdict label */}
				{summary && (
					<p className="text-sm text-muted-foreground leading-relaxed flex-1">
						{summary}
					</p>
				)}
			</div>
		</div>
	);
}


interface ReportViewProps {
	diagnostic: Diagnostic;
	onBack: () => void;
}

export function ReportView({ diagnostic, onBack }: ReportViewProps) {
	const [copied, setCopied] = useState(false);
	const [tooltip, setTooltip] = useState<{
		text: string;
		x: number;
		y: number;
	} | null>(null);
	const proseRef = useRef<HTMLDivElement>(null);
	const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		const el = proseRef.current;
		if (!el) return;

		function handleClick(e: MouseEvent) {
			const link = (e.target as HTMLElement).closest(
				"a[data-footnote-ref], a[data-footnote-backref]",
			);
			if (!link) return;
			e.preventDefault();
			const href = link.getAttribute("href");
			if (!href?.startsWith("#")) return;
			const target = el?.querySelector(href);
			if (target) {
				target.scrollIntoView({ behavior: "smooth", block: "center" });
				target.classList.add("footnote-highlight");
				setTimeout(() => target.classList.remove("footnote-highlight"), 1500);
			}
		}

		function handleMouseEnter(e: MouseEvent) {
			const link = (e.target as HTMLElement).closest(
				"a[data-footnote-ref]",
			) as HTMLAnchorElement | null;
			if (!link) return;
			const href = link.getAttribute("href");
			if (!href?.startsWith("#")) return;
			const footnoteLi = el?.querySelector(href);
			if (!footnoteLi) return;

			const clone = footnoteLi.cloneNode(true) as HTMLElement;
			for (const backref of Array.from(
				clone.querySelectorAll("a[data-footnote-backref]"),
			)) {
				backref.remove();
			}
			const text = clone.textContent?.trim() || "";
			if (!text) return;

			if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);

			const rect = link.getBoundingClientRect();
			const containerRect = el!.getBoundingClientRect();
			setTooltip({
				text: text.length > 280 ? `${text.slice(0, 277)}...` : text,
				x: rect.left - containerRect.left + rect.width / 2,
				y: rect.top - containerRect.top,
			});
		}

		function handleMouseLeave(e: MouseEvent) {
			const link = (e.target as HTMLElement).closest("a[data-footnote-ref]");
			if (!link) return;
			tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), 150);
		}

		el.addEventListener("click", handleClick);
		el.addEventListener("mouseenter", handleMouseEnter, true);
		el.addEventListener("mouseleave", handleMouseLeave, true);
		return () => {
			el.removeEventListener("click", handleClick);
			el.removeEventListener("mouseenter", handleMouseEnter, true);
			el.removeEventListener("mouseleave", handleMouseLeave, true);
			if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
		};
	}, []);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(diagnostic.report);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [diagnostic.report]);

	const domain = getDomain(diagnostic.url);
	const date = new Date(diagnostic.createdAt).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return (
		<ScrollArea className="h-full">
			<div
				ref={proseRef}
				className="report-prose relative px-5 py-7 mx-auto max-w-[720px]"
			>
				{/* ── Report header — everything in one block ─────────── */}
				<div className="mb-8 not-prose">
					{/* Top row: Back left, Copy right */}
					<div className="flex items-center justify-between mb-6">
						<button
							type="button"
							onClick={onBack}
							className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
						>
							<ArrowLeft className="size-3.5" />
							Back
						</button>

						<button
							type="button"
							onClick={handleCopy}
							className="report-action-btn"
						>
							{copied ? (
								<Check className="size-3.5" />
							) : (
								<Copy className="size-3.5" />
							)}
							{copied ? "Copied!" : "Copy"}
						</button>
					</div>

					{/* Site identity */}
					<div className="flex items-center gap-4">
						<img
							src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
							alt=""
							width={44}
							height={44}
							className="size-11 rounded-xl shrink-0 border border-border/50"
						/>
						<div className="flex-1 min-w-0">
							{/* Use <div> not <h1> — CSS hides first h1 in prose for dedup */}
							<div className="text-2xl font-bold tracking-tight leading-snug mb-1.5">
								{diagnostic.title || domain}
							</div>
							<a
								href={diagnostic.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 group"
							>
								<span className="truncate max-w-[340px]">{diagnostic.url}</span>
								<ExternalLink className="size-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
							</a>
							<p className="text-xs text-muted-foreground/50 mt-1">{date}</p>
						</div>
					</div>
				</div>

				{/* ── Score card — clean, no tinted bg, no verdict label ── */}
				{(diagnostic.healthScore != null || diagnostic.summary) && (
					<ScoreCard
						score={diagnostic.healthScore ?? 0}
						summary={diagnostic.summary}
					/>
				)}

				{/* ── Markdown report ─────────────────────────────────── */}
				<Markdown remarkPlugins={[remarkGfm]}>{diagnostic.report}</Markdown>

				{/* Footnote hover tooltip */}
				{tooltip && (
					<div
						className="footnote-tooltip"
						style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
						onMouseEnter={() => {
							if (tooltipTimeoutRef.current)
								clearTimeout(tooltipTimeoutRef.current);
						}}
						onMouseLeave={() => setTooltip(null)}
					>
						{tooltip.text}
					</div>
				)}
			</div>
		</ScrollArea>
	);
}
