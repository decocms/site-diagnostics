import type { RepoConfig, RepoData } from "./types.ts";

/**
 * Analyzes a repository for framework detection, dependency freshness,
 * bundle size, anti-patterns, recent commits, and open issue count.
 *
 * STUB: the real implementation will use the GitHub API (shallow file
 * fetches for package.json, manifest files, recent commits/issues).
 * Per the architecture notes in PLAN.md this step may also move to the
 * agent layer (Claude Code reads the filesystem directly) — holding off
 * on full impl until that decision is made.
 */
export async function sourceRepo(_config: RepoConfig): Promise<RepoData> {
	return {
		framework: null,
		packageManager: null,
		deps: [],
		bundleSize: { totalKB: null, byRoute: [] },
		antiPatterns: [],
		recentCommits: [],
		openIssues: 0,
	};
}
