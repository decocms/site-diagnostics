import type { Finding } from "./11-synthesize.ts";

// ── Types ────────────────────────────────────────────────

export interface ActionProposal {
	type: "pr" | "issue" | "alert" | "manual";
	findingId: string;
	title: string;
	description: string;
	automatable: boolean;
	priority: "high" | "medium" | "low";
}

// ── Classification Rules ─────────────────────────────────

const AUTOMATABLE_PATTERNS: Record<
	string,
	{ type: ActionProposal["type"]; automatable: boolean }
> = {
	"json-ld": { type: "pr", automatable: true },
	"structured-data": { type: "pr", automatable: true },
	"meta-description": { type: "pr", automatable: true },
	"meta-title": { type: "pr", automatable: true },
	canonical: { type: "pr", automatable: true },
	"image-alt": { type: "pr", automatable: true },
	cache: { type: "issue", automatable: false },
	ttfb: { type: "alert", automatable: false },
	"page-weight": { type: "issue", automatable: false },
	review: { type: "manual", automatable: false },
	"cross-sell": { type: "issue", automatable: false },
	editorial: { type: "manual", automatable: false },
	content: { type: "manual", automatable: false },
	sitemap: { type: "issue", automatable: true },
	robots: { type: "issue", automatable: true },
	ssl: { type: "issue", automatable: true },
};

function classifyFinding(
	finding: Finding,
): Pick<ActionProposal, "type" | "automatable"> {
	const id = finding.id.toLowerCase();
	for (const [pattern, classification] of Object.entries(
		AUTOMATABLE_PATTERNS,
	)) {
		if (id.includes(pattern)) {
			return classification;
		}
	}
	// Default: issue, not automatable
	return { type: "issue", automatable: false };
}

// ── Main Entry Point ─────────────────────────────────────

/**
 * Classify findings into actionable proposals.
 * V1: deterministic classification based on finding IDs.
 * No LLM needed — just pattern matching on finding types.
 */
export function proposeActions(findings: Finding[]): ActionProposal[] {
	return findings.map((finding) => {
		const { type, automatable } = classifyFinding(finding);
		return {
			type,
			findingId: finding.id,
			title: finding.title,
			description: finding.evidence,
			automatable,
			priority: finding.severity,
		};
	});
}
