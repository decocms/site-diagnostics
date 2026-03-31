import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useMcpApp } from "@/context.tsx";
import { buildDiagnoseMessage } from "../../../shared/diagnostics.ts";

export default function DiagnosticsPage() {
	const app = useMcpApp();
	const [url, setUrl] = useState("");
	const [sending, setSending] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!app || !url.trim()) return;

		setSending(true);
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
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<div className="flex flex-col items-center gap-6 w-full max-w-md">
				<div className="flex flex-col items-center gap-1 text-center">
					<h1 className="text-2xl font-bold tracking-tight">Site Diagnostics</h1>
					<p className="text-sm text-muted-foreground">Performance &amp; SEO analysis</p>
				</div>

				<div className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 p-px rounded-xl w-full">
					<form
						onSubmit={handleSubmit}
						className="bg-background rounded-xl p-6 flex flex-col gap-3"
					>
						<Input
							type="url"
							placeholder="https://example.com"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							required
							disabled={sending}
							className="w-full"
						/>
						<Button
							type="submit"
							disabled={sending || !url.trim()}
							className="w-full text-white"
							style={{
								background: sending || !url.trim()
									? undefined
									: "linear-gradient(to right, #34d399, #22d3ee, #a855f7)",
							}}
						>
							{sending ? "Running..." : "Diagnose"}
						</Button>
					</form>
				</div>

				<p className="text-xs text-muted-foreground">
					Lighthouse · HAR · Screenshots · SEO
				</p>
			</div>
		</div>
	);
}
