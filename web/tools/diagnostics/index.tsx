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
			<form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
				<Input
					type="url"
					placeholder="https://example.com"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					required
					disabled={sending}
					className="flex-1"
				/>
				<Button type="submit" disabled={sending || !url.trim()}>
					{sending ? "Running..." : "Diagnose"}
				</Button>
			</form>
		</div>
	);
}
