import { z } from "zod";

export const DiagnosticSchema = z.object({
	id: z.string(),
	url: z.string(),
	title: z.string(),
	createdAt: z.string(),
	healthScore: z.coerce.number().min(0).max(100).optional(),
	summary: z.string().optional(),
	report: z.string(),
	status: z.enum(["running", "complete", "error"]).default("complete"),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export interface DiagnosticMeta {
	id: string;
	url: string;
	title: string;
	createdAt: string;
	healthScore?: number;
	summary?: string;
	reportPreview?: string;
	status: string;
}
