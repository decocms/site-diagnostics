import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import { buildDiagnoseMessage } from "../../shared/diagnostics.ts";
import type { Env } from "../types/env.ts";

export const siteDiagnosticsPrompt = (_env: Env) =>
	createPublicPrompt({
		name: "diagnose",
		title: "Run Site Diagnostics",
		description:
			"Run a comprehensive performance, SEO, and cache diagnostic on a website URL",
		argsSchema: {
			url: z
				.string()
				.describe("The website URL to diagnose (e.g. example.com)"),
		},
		execute: async ({ args }) => {
			const url = args.url ?? "";

			return {
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: buildDiagnoseMessage(url),
						},
					},
				],
			};
		},
	});
