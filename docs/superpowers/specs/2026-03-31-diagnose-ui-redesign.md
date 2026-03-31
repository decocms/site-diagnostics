# Diagnose Tool UI Redesign

## Goal

Upgrade the diagnose tool page from a bare input+button to a polished, colorful centered layout using a green-cyan-purple gradient accent. No animations. Keep the minimal centered approach.

## Current State

`web/tools/diagnostics/index.tsx` renders a centered flex container with an `Input` and `Button` inline. No title, no card, no color beyond defaults.

## Design

### Layout (top to bottom, all centered)

1. **Title**: "Site Diagnostics" — bold, large text
2. **Subtitle**: "Performance & SEO analysis" — muted, smaller text
3. **Card**: container with a gradient border (green → cyan → purple)
   - Full-width `Input` (type url, placeholder "https://example.com")
   - Full-width `Button` below the input with gradient background (same green → cyan → purple), white text
4. **Capability tags**: muted small text below card — "Lighthouse · HAR · Screenshots · SEO"

### Gradient

Tailwind classes: `from-emerald-400 via-cyan-400 to-purple-500`

### Gradient Border Technique

Wrap the card content in two nested divs:
- Outer div: `bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 p-px rounded-xl` (the gradient acts as a 1px border)
- Inner div: `bg-background rounded-xl p-6` (the card fill, matches page background)

### Gradient Button

The "Diagnose" button gets a custom gradient background using the same palette. Use inline style or a utility class to override the default button variant. White text.

### Dark Mode

Works automatically — `bg-background` adapts via existing CSS variables. The gradient pops more on dark backgrounds.

### Capability Tags

A row of muted text items separated by `·` characters. Use `text-muted-foreground text-sm`. These are static, not interactive.

### Loading State

Same as current: button text changes to "Running...", input and button disabled.

## Files Changed

- `web/tools/diagnostics/index.tsx` — rewrite the JSX to add title, subtitle, gradient card, gradient button, capability tags

## Out of Scope

- Animations, transitions, hover effects beyond Tailwind defaults
- New components or files
- Changes to shared logic, API, or other tools
