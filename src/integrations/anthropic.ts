import Anthropic from "@anthropic-ai/sdk";

// ── Client ───────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
	if (!_client) {
		_client = new Anthropic();
	}
	return _client;
}

// ── Types ────────────────────────────────────────────────

export interface MessageOptions {
	model?: string;
	system?: string;
	maxTokens?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 8192;

// ── Public API ───────────────────────────────────────────

/**
 * Send a message to Claude and get a text response (streaming).
 * Uses streaming to avoid SDK timeout limits on large responses.
 */
export async function complete(
	prompt: string,
	opts: MessageOptions = {},
): Promise<string> {
	const client = getClient();
	const stream = client.messages.stream({
		model: opts.model ?? DEFAULT_MODEL,
		max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
		system: opts.system,
		messages: [{ role: "user", content: prompt }],
	});

	const response = await stream.finalMessage();
	const text = response.content
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join("");

	return text;
}

/**
 * Send a message and parse the response as JSON.
 * Extracts JSON from markdown code fences if present.
 */
export async function completeJSON<T>(
	prompt: string,
	opts: MessageOptions = {},
): Promise<T> {
	const raw = await complete(prompt, opts);
	const cleaned = raw
		.replace(/^```(?:json)?\s*\n?/m, "")
		.replace(/\n?```\s*$/m, "");
	return JSON.parse(cleaned) as T;
}
