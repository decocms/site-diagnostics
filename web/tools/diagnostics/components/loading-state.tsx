import { ArrowLeft, Search } from "lucide-react";

function getDomain(url: string): string {
	try {
		return new URL(
			url.startsWith("http") ? url : `https://${url}`,
		).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

interface LoadingStateProps {
	url: string;
	onBack: () => void;
}

export function LoadingState({ url, onBack }: LoadingStateProps) {
	const domain = getDomain(url);

	return (
		<div className="h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
			{/* Back nav */}
			<button
				type="button"
				onClick={onBack}
				className="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
			>
				<ArrowLeft className="size-3.5" />
				Back
			</button>

			{/* Background skeleton */}
			<div
				className="absolute inset-0 pointer-events-none flex items-center justify-center"
				style={{
					maskImage:
						"radial-gradient(ellipse 70% 50% at 50% 50%, black 0%, transparent 70%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 70% 50% at 50% 50%, black 0%, transparent 70%)",
				}}
			>
				<div className="w-full max-w-[480px] rounded-xl border border-foreground/[0.08] p-8 opacity-30 relative">
					<svg
						aria-hidden="true"
						className="absolute inset-0 pointer-events-none"
						style={{ width: "100%", height: "100%", overflow: "visible" }}
						fill="none"
					>
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
						<rect
							x="0"
							y="0"
							rx="12"
							stroke="#14b8a6"
							strokeOpacity="0.45"
							strokeWidth="1"
							strokeDasharray="10 90"
							pathLength="100"
							style={{
								width: "100%",
								height: "100%",
								animation: "border-dash 4s linear infinite",
							}}
						/>
						<rect
							x="0"
							y="0"
							rx="12"
							stroke="#14b8a6"
							strokeOpacity="0.15"
							strokeWidth="1"
							strokeDasharray="8 92"
							pathLength="100"
							style={{
								width: "100%",
								height: "100%",
								animation: "border-dash-t1 4s linear infinite",
							}}
						/>
					</svg>

					<div className="space-y-6">
						<div className="space-y-2.5">
							<div className="h-3 w-3/5 rounded-full bg-foreground/[0.05]" />
							<div className="h-2.5 w-2/5 rounded-full bg-foreground/[0.04]" />
						</div>
						<div className="space-y-2">
							<div className="h-2 w-full rounded-full bg-foreground/[0.04]" />
							<div className="h-2 w-full rounded-full bg-foreground/[0.04]" />
							<div className="h-2 w-3/4 rounded-full bg-foreground/[0.04]" />
						</div>
						<div className="space-y-2">
							<div className="h-2 w-full rounded-full bg-foreground/[0.04]" />
							<div className="h-2 w-4/5 rounded-full bg-foreground/[0.04]" />
						</div>
					</div>
				</div>
			</div>

			{/* Foreground content */}
			<div className="relative z-10 flex flex-col items-center">
				{/* Teal icon with animated dash ring */}
				<div className="relative flex items-center justify-center size-11 rounded-xl bg-teal-500/10 mb-5">
					<Search className="size-5 text-teal-500" />
					<svg
						aria-hidden="true"
						className="absolute inset-[-4px] pointer-events-none"
						width="52"
						height="52"
						viewBox="0 0 52 52"
						fill="none"
					>
						<rect
							x="1"
							y="1"
							width="50"
							height="50"
							rx="14"
							stroke="#14b8a6"
							strokeOpacity="0.15"
							strokeWidth="1.5"
							pathLength="100"
						/>
						<rect
							x="1"
							y="1"
							width="50"
							height="50"
							rx="14"
							stroke="#14b8a6"
							strokeOpacity="0.6"
							strokeWidth="1.5"
							strokeDasharray="20 80"
							pathLength="100"
							style={{ animation: "border-dash 2.5s linear infinite" }}
						/>
					</svg>
				</div>

				{/* Domain */}
				<div className="flex items-center gap-2.5 mb-3">
					<img
						src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
						alt=""
						width={16}
						height={16}
						className="size-4 rounded-sm shrink-0"
					/>
					<span className="text-sm font-medium tracking-tight">{domain}</span>
				</div>

				<p className="text-sm text-muted-foreground">Analyzing...</p>

				{/* Hint */}
				<p className="mt-16 text-xs text-muted-foreground/40">
					Check the chat for live updates
				</p>
			</div>
		</div>
	);
}
