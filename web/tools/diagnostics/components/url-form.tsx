import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { useState } from "react";

interface UrlFormProps {
	onSubmit: (url: string) => void;
	disabled?: boolean;
}

export function UrlForm({ onSubmit, disabled }: UrlFormProps) {
	const [url, setUrl] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const raw = url.trim();
		if (!raw || disabled) return;
		const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
		onSubmit(normalized);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-2.5 w-full">
			<div className="relative group">
				<Globe className="absolute left-4 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground/60 transition-colors group-focus-within:text-foreground/70" />
				<input
					type="text"
					placeholder="your-store.com"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					required
					disabled={disabled}
					className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-all duration-200 focus:ring-2 focus:ring-ring/20 focus:border-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed"
				/>
			</div>
			<button
				type="submit"
				disabled={disabled || !url.trim()}
				className="group/btn relative w-full h-11 rounded-xl bg-foreground text-background text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
			>
				{disabled ? (
					<>
						<Loader2 className="size-4 animate-spin" />
						Analyzing...
					</>
				) : (
					<>
						Run Diagnostics
						<ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
					</>
				)}
			</button>
		</form>
	);
}
