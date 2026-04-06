const BASE_URL = "https://api.perplexity.ai";

function getApiKey(): string {
	const key = process.env.PERPLEXITY_API_KEY;
	if (!key)
		throw new Error("PERPLEXITY_API_KEY environment variable is required");
	return key;
}

function getHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		"Content-Type": "application/json",
	};
}

// ── Types ─────────────────────────────────────────────────

export interface PerplexityResult {
	answer: string;
	citations: string[];
}

// ── Ask ───────────────────────────────────────────────────

export async function perplexityAsk(
	systemPrompt: string,
	userQuery: string,
): Promise<PerplexityResult> {
	const response = await fetch(`${BASE_URL}/chat/completions`, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({
			model: "sonar",
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userQuery },
			],
		}),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Perplexity API error (${response.status}): ${error}`);
	}

	const data = await response.json();
	const choice = data.choices?.[0];

	return {
		answer: choice?.message?.content ?? "",
		citations: data.citations ?? [],
	};
}
