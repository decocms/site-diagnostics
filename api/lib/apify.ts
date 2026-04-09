const BASE_URL = "https://api.apify.com/v2";

function getApiToken(): string {
	const token = process.env.APIFY_API_TOKEN;
	if (!token)
		throw new Error("APIFY_API_TOKEN environment variable is required");
	return token;
}

/**
 * Runs an Apify actor synchronously and returns the dataset items.
 * Uses the run-sync-get-dataset-items endpoint which waits for completion.
 */
export async function runActor<TInput, TOutput>(
	actorId: string,
	input: TInput,
	timeoutSecs = 120,
): Promise<TOutput[]> {
	const token = getApiToken();
	// Actor IDs use ~ in the REST API (e.g. "radeance~similarweb-scraper")
	const id = actorId.replace("/", "~");

	const res = await fetch(
		`${BASE_URL}/acts/${id}/run-sync-get-dataset-items?token=${token}&timeoutSecs=${timeoutSecs}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Apify actor ${actorId} failed (${res.status}): ${text}`);
	}

	return res.json() as Promise<TOutput[]>;
}
