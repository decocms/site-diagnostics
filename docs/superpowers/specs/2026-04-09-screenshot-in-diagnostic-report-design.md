# Screenshot in Diagnostic Report

**Date:** 2026-04-09
**Status:** Approved

## Overview

Automatically capture a desktop screenshot during every diagnostic run and display it in the report UI between the scorecard and the markdown report body.

## Approach

AI-driven (Option A): the diagnostic prompt already calls the `screenshot` tool in PHASE 2. We extend the save step to persist the returned `imageUrl` as `screenshotUrl` on the `Diagnostic` record, then render it in `ReportView`.

## Changes

### 1. Schema — `api/types/diagnostic.ts`

Add one optional field to `DiagnosticSchema`:

```typescript
screenshotUrl: z.string().optional(),
```

No storage changes needed — `saveDiagnostic()` serializes the full object to JSON already.

### 2. Prompt — `shared/diagnostics.ts`

In the `save_diagnostic` call instructions, add:

> Include `screenshotUrl` from the screenshot tool result (`imageUrl` field) when calling `save_diagnostic`.

The screenshot tool is already called in PHASE 2 (`screenshot(homepage, device: desktop)`). This change just wires the output through to the saved record.

### 3. UI — `web/tools/diagnostics/components/report-view.tsx`

- Add `screenshotUrl?: string` to the local `Diagnostic` interface
- Render between the scorecard and markdown report:
  - Full-width, rounded image with a subtle border
  - Only rendered when `screenshotUrl` is present (older diagnostics without it render nothing)

Layout:

```
[header — favicon, title, url, date]
[scorecard]
[screenshot — full width, rounded, subtle border]  ← new
[markdown report]
```

## Data Flow

```
screenshot tool → { imageUrl: "/api/screenshots/slug-desktop-uuid.png" }
               ↓
AI passes screenshotUrl to save_diagnostic
               ↓
saveDiagnostic() writes full Diagnostic JSON to .data/diagnostics/{id}.json
               ↓
loadDiagnostic() returns Diagnostic including screenshotUrl
               ↓
ReportView renders <img src={screenshotUrl} /> between scorecard and report
```

## Constraints

- Desktop only (`device: "desktop"`)
- Optional field — missing on existing diagnostics, UI degrades gracefully
- Screenshot files served from `/api/screenshots/` (existing route in `main.ts`)
- 5 MB size cap enforced by the screenshot tool
