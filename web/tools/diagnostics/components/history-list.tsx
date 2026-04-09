import { formatDistanceToNow } from "date-fns";
import { Clock, MoreHorizontal, Trash2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

export interface DiagnosticMeta {
	id: string;
	url: string;
	title: string;
	createdAt: string;
	healthScore?: number;
	summary?: string;
	reportPreview?: string;
	status: string;
}

function getScoreColor(score: number): string {
	if (score >= 80) return "text-success";
	if (score >= 50) return "text-warning";
	return "text-destructive";
}

function getScoreRing(score: number): string {
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

function MiniScoreRing({ score }: { score: number }) {
	const radius = 18;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (score / 100) * circumference;

	return (
		<div className="relative inline-flex items-center justify-center shrink-0">
			<svg
				width="44"
				height="44"
				viewBox="0 0 44 44"
				className="-rotate-90"
				aria-label={`Score: ${score}`}
			>
				<circle
					cx="22"
					cy="22"
					r={radius}
					fill="none"
					strokeWidth="3"
					className="stroke-muted"
				/>
				<circle
					cx="22"
					cy="22"
					r={radius}
					fill="none"
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					className={getScoreRing(score)}
				/>
			</svg>
			<span
				className={`absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums leading-none ${getScoreColor(score)}`}
			>
				{score}
			</span>
		</div>
	);
}

interface HistoryListProps {
	diagnostics: DiagnosticMeta[];
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
}

export function HistoryList({
	diagnostics,
	onSelect,
	onDelete,
}: HistoryListProps) {
	if (diagnostics.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-12 text-center">
				<Clock className="size-8 text-muted-foreground/50" />
				<p className="text-sm text-muted-foreground">No diagnostics yet</p>
				<p className="text-xs text-muted-foreground/70">
					Enter a URL above to run your first diagnostic
				</p>
			</div>
		);
	}

	return (
		<div className="@container">
		<div className="grid grid-cols-1 @[480px]:grid-cols-2 @[780px]:grid-cols-3 @[1060px]:grid-cols-4 gap-3">
			{diagnostics.map((d) => (
				<button
					key={d.id}
					type="button"
					onClick={() => onSelect(d.id)}
					className="group relative flex flex-col rounded-lg border-shadow bg-card text-left transition-colors hover:bg-accent/50 overflow-hidden"
					style={{
						transition: `background-color 150ms var(--ease-out-quint)`,
					}}
				>
					{/* Markdown preview snippet */}
					<div className="relative h-40 overflow-hidden px-3.5 pt-3 pointer-events-none opacity-30">
						<div className="report-prose origin-top-left scale-[0.95] w-[105%] text-[0.7rem] leading-[1.45]">
							<Markdown remarkPlugins={[remarkGfm]}>
								{d.reportPreview || d.summary || ""}
							</Markdown>
						</div>
						<div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
					</div>

					{/* Card footer: meta + score */}
					<div className="flex items-center gap-2.5 px-3.5 pb-3.5 pt-2">
						<img
							src={`https://www.google.com/s2/favicons?domain=${getDomain(d.url)}&sz=64`}
							alt=""
							width={20}
							height={20}
							className="size-5 rounded-sm shrink-0 self-start mt-0.5"
						/>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium truncate">
									{d.title || getDomain(d.url)}
								</span>
								{d.status === "running" && (
									<Badge
										variant="secondary"
										className="text-[9px] px-1.5 py-0"
									>
										Running
									</Badge>
								)}
							</div>
							<p className="text-xs text-muted-foreground truncate mt-0.5">
								{getDomain(d.url)}
								{d.createdAt && (
									<>
										{" · "}
										{formatDistanceToNow(new Date(d.createdAt), {
											addSuffix: true,
										})}
									</>
								)}
							</p>
						</div>

						{d.healthScore != null && (
							<MiniScoreRing score={d.healthScore} />
						)}
					</div>

					{/* Delete menu */}
					<div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon-xs"
									className="bg-card/80 backdrop-blur-sm"
									onClick={(e) => e.stopPropagation()}
								>
									<MoreHorizontal className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									variant="destructive"
									onClick={(e) => {
										e.stopPropagation();
										onDelete(d.id);
									}}
								>
									<Trash2 />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</button>
			))}
			</div>
		</div>
	);
}
