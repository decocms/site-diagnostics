import { Activity, FileSearch, Gauge, Search, Shield } from "lucide-react";
import { useEffect, useState } from "react";

const PHASES = [
	{
		icon: Search,
		label: "Discovering site structure...",
		detail: "Crawling pages & analyzing business context",
	},
	{
		icon: FileSearch,
		label: "Quick SEO scan...",
		detail: "Checking meta tags, headers & platform",
	},
	{
		icon: Gauge,
		label: "Deep technical analysis...",
		detail: "Lighthouse, HAR capture & performance audit",
	},
	{
		icon: Shield,
		label: "Content deep dive...",
		detail: "Structured data, reviews & recommendations",
	},
	{
		icon: Activity,
		label: "Generating report...",
		detail: "Synthesizing findings & recommendations",
	},
];

interface LoadingStateProps {
	url: string;
}

export function LoadingState({ url }: LoadingStateProps) {
	const [phaseIndex, setPhaseIndex] = useState(0);

	useEffect(() => {
		const timings = [8000, 6000, 40000, 20000, 15000];
		let timeout: ReturnType<typeof setTimeout>;

		const advance = (idx: number) => {
			if (idx >= PHASES.length - 1) return;
			timeout = setTimeout(() => {
				setPhaseIndex(idx + 1);
				advance(idx + 1);
			}, timings[idx]);
		};

		advance(0);
		return () => clearTimeout(timeout);
	}, []);

	const phase = PHASES[phaseIndex];
	const Icon = phase.icon;

	return (
		<div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto text-center">
			<div className="relative">
				<div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
					<Icon className="size-7 text-primary animate-pulse" />
				</div>
				<div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
					<span className="size-2 rounded-full bg-primary animate-pulse" />
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium">{phase.label}</p>
				<p className="text-xs text-muted-foreground">{phase.detail}</p>
			</div>

			<div className="w-full flex flex-col gap-2">
				<div className="flex gap-1">
					{PHASES.map((phase, i) => (
						<div
							key={phase.label}
							className={`h-1 flex-1 rounded-full ${i <= phaseIndex ? "bg-primary" : "bg-muted"}`}
							style={{
								transition: `background-color 400ms var(--ease-out-expo)`,
							}}
						/>
					))}
				</div>
				<p className="text-xs text-muted-foreground truncate">{url}</p>
			</div>

			<p className="text-xs text-muted-foreground">
				Check the chat for live progress updates
			</p>
		</div>
	);
}
