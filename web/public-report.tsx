import type { Diagnostic } from "../api/types/diagnostic.ts";
import { ReportView } from "./tools/diagnostics/components/report-view.tsx";

interface PublicReportProps {
	diagnostic: Diagnostic;
}

export function PublicReport({ diagnostic }: PublicReportProps) {
	return (
		<div className="h-dvh">
			<ReportView diagnostic={diagnostic} />
		</div>
	);
}
