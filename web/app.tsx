import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Diagnostic } from "../api/types/diagnostic.ts";
import { McpProvider } from "./context.tsx";
import { PublicReport } from "./public-report.tsx";
import { AppRouter } from "./router.tsx";
import "./globals.css";

declare global {
	interface Window {
		__PUBLIC_DIAGNOSTIC__?: Diagnostic;
	}
}

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Missing root element");
}

const publicDiagnostic = window.__PUBLIC_DIAGNOSTIC__;
const root = createRoot(rootElement);

if (publicDiagnostic) {
	root.render(
		<StrictMode>
			<PublicReport diagnostic={publicDiagnostic} />
		</StrictMode>,
	);
} else {
	root.render(
		<StrictMode>
			<McpProvider>
				<AppRouter />
			</McpProvider>
		</StrictMode>,
	);
}
