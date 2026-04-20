const BASE_URL = "https://api.perplexity.ai";

function getApiKey(): string {
	const key = process.env.PERPLEXITY_API_KEY;
	if (!key)
		throw new Error("PERPLEXITY_API_KEY environment variable is required");
	return key;
}

// ── Types ─────────────────────────────────────────────────

export interface PerplexityResult {
	answer: string;
	citations: string[];
}

export interface BusinessResearchResult {
	companyName: string;
	summary: string;
	marketPosition?: string;
	competitors: string[];
	recentNews: string[];
	trafficEstimate?: string;
	businessContext?: string;
	citations: string[];
}

// ── Raw API ──────────────────────────────────────────────

export async function perplexityAsk(
	systemPrompt: string,
	userQuery: string,
): Promise<PerplexityResult> {
	const response = await fetch(`${BASE_URL}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getApiKey()}`,
			"Content-Type": "application/json",
		},
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

// ── Business Research ─────────────────────────────────────

const SYSTEM_PROMPT =
	"You are a business intelligence analyst. Provide detailed, factual information " +
	"about companies and their market position. Focus on: company overview, market share, " +
	"key competitors, recent strategic moves, DTC vs wholesale mix, traffic estimates, " +
	"and revenue/funding data when publicly available. Be specific with numbers and sources.";

export async function researchBusiness(
	companyName: string,
	domain: string,
	category?: string,
): Promise<BusinessResearchResult> {
	const categoryCtx = category ? ` in the ${category} space` : "";
	const query =
		`Tell me about ${companyName} (${domain})${categoryCtx}. Include:\n` +
		"1. Company overview and market position\n" +
		"2. Main competitors (list their names)\n" +
		"3. Recent news, strategic moves, or earnings highlights\n" +
		"4. Estimated monthly website traffic if available\n" +
		"5. Key business context (DTC vs wholesale, growth trends, marketing strategy)";

	const result = await perplexityAsk(SYSTEM_PROMPT, query);
	const lines = result.answer.split("\n").filter((l) => l.trim());

	const competitors: string[] = [];
	const recentNews: string[] = [];
	let marketPosition = "";
	let trafficEstimate = "";
	let businessContext = "";

	for (const line of lines) {
		const lower = line.toLowerCase();
		if (
			lower.includes("competitor") ||
			lower.includes("rival") ||
			lower.includes("compete")
		) {
			const brands = line.match(
				/(?:Nike|Adidas|Asics|New Balance|Puma|Mizuno|Hoka|Under Armour|Skechers|Farm|Reserva|Animale|Zara|H&M|Renner|C&A|Riachuelo|Arezzo|Vivara|Pandora|Tiffany|Cartier|Havaianas|Ipanema|Rider|Kenner)\b/gi,
			);
			if (brands) competitors.push(...brands);
		}
		if (
			lower.includes("traffic") ||
			lower.includes("visits") ||
			lower.includes("visitors")
		) {
			trafficEstimate = line.trim();
		}
		if (
			lower.includes("market") ||
			lower.includes("position") ||
			lower.includes("leader") ||
			lower.includes("share")
		) {
			marketPosition = line.trim();
		}
		if (
			lower.includes("news") ||
			lower.includes("recent") ||
			lower.includes("announced") ||
			lower.includes("launched") ||
			lower.includes("quarter") ||
			lower.includes("earnings")
		) {
			recentNews.push(line.trim());
		}
		if (
			lower.includes("dtc") ||
			lower.includes("direct-to-consumer") ||
			lower.includes("wholesale") ||
			lower.includes("strategy") ||
			lower.includes("growth")
		) {
			businessContext += `${line.trim()} `;
		}
	}

	return {
		companyName,
		summary: result.answer,
		marketPosition: marketPosition || undefined,
		competitors: [...new Set(competitors)],
		recentNews: recentNews.slice(0, 5),
		trafficEstimate: trafficEstimate || undefined,
		businessContext: businessContext.trim() || undefined,
		citations: result.citations,
	};
}
