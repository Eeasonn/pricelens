---
name: PriceLens
description: A restrained, high-density price intelligence workbench for Huawei brand-side decisions.
colors:
  primary: "#171717"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  canvas-soft-2: "#f5f5f5"
  hairline: "#ebebeb"
  hairline-strong: "#a1a1a1"
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#737373"
  link: "#0070f3"
  error: "#ee0000"
  warning: "#f5a623"
  warning-ink: "#805b00"
  warning-soft: "#ffefcf"
  on-primary: "#ffffff"
  select-soft: "#e8f1ff"
  select-soft-ink: "#0053c2"
  select-accent: "#0070f3"
  track-rail: "#edf0f4"
  track-fill: "#dceaff"
  track-handle: "#4f8fe8"
  brand-huawei: "#c7000b"
  brand-apple: "#1d1d1f"
  brand-samsung: "#0000cc"
  brand-honor: "#0099cc"
  brand-vivo: "#2693ca"
  brand-xiaomi: "#ff6900"
typography:
  display-sm:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  body-md:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-sm:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  technical:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
rounded:
  control: 6px
  card: 8px
  modal: 12px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px
components:
  page:
    backgroundColor: "{colors.canvas-soft}"
  menu:
    backgroundColor: "{colors.canvas-soft-2}"
  rule:
    backgroundColor: "{colors.hairline}"
  strong-rule:
    backgroundColor: "{colors.hairline-strong}"
  body-text:
    textColor: "{colors.body}"
  muted-text:
    textColor: "{colors.mute}"
  link:
    textColor: "{colors.link}"
  warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-ink}"
  warning-icon:
    backgroundColor: "{colors.warning}"
  time-track:
    backgroundColor: "{colors.track-rail}"
  time-track-selected:
    backgroundColor: "{colors.track-fill}"
  time-track-handle:
    backgroundColor: "{colors.track-handle}"
  focus-indicator:
    backgroundColor: "{colors.select-accent}"
  ink-text:
    textColor: "{colors.ink}"
  chart-huawei:
    backgroundColor: "{colors.brand-huawei}"
  chart-apple:
    backgroundColor: "{colors.brand-apple}"
  chart-samsung:
    backgroundColor: "{colors.brand-samsung}"
  chart-honor:
    backgroundColor: "{colors.brand-honor}"
  chart-vivo:
    backgroundColor: "{colors.brand-vivo}"
  chart-xiaomi:
    backgroundColor: "{colors.brand-xiaomi}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.card}"
    padding: 24px
  filter-selected:
    backgroundColor: "{colors.select-soft}"
    textColor: "{colors.select-soft-ink}"
    rounded: "{rounded.control}"
---

## Overview

PriceLens is an **Operate** interface: an enterprise price-intelligence workbench for Huawei brand-side teams. Its visual north star is **restrained, high-density, evidence-first analysis**. Users should scan a scope, understand the Huawei product's position, verify the facts, and choose a next action without learning a decorative visual language.

The implementation is Vercel-inspired in its neutral surfaces and restrained chrome. It is not a copy of the Vercel brand or Geist palette. `src/theme/tokens.ts` is the runtime source of truth; this file is the design contract consumed by agents and reviewers.

Huawei products are the narrative and visual subject. Competitors are comparison references. Every prominent number should answer “what should I check or do next?”

## Reference hierarchy

Use the external systems for the job they are good at, and keep PriceLens decisions in this file:

- [Google DESIGN.md](https://github.com/google-labs-code/design.md) is the machine-readable token shape and lint contract.
- [Vercel Geist](https://vercel.com/geist/introduction) is a reference for restrained typography, spacing, and neutral application chrome.
- [Ant Design](https://ant.design/docs/spec/values/) is a reference for enterprise controls, states, and accessibility behavior already present in the stack.
- [IBM Carbon](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards) is a reference for dashboard density, data hierarchy, and chart explanation.
- [Impeccable](https://github.com/pbakaus/impeccable) is a context, critique, and detector workflow. It may flag drift, but it does not override the PriceLens token source or product rules.

When a reference conflicts with this contract, preserve the PriceLens decision and record a deliberate exception in the relevant surface brief.

## Colors

Use the neutral canvas hierarchy for structure: `canvas-soft` for the page, `canvas` for cards and overlays, `canvas-soft-2` for menus and hover interiors, and `hairline` for the default 1px rule. Use `ink` for primary text and the single primary CTA. Use `body` and `mute` for secondary and metadata text.

Blue is reserved for links, selected controls, focus, and favorable comparison semantics. Amber marks offers or attention states. Red marks errors and the “Huawei is more expensive” comparison state. These meanings are reinforced by text, signs, icons, or labels; color never carries status alone.

Brand chart colors are a separate vocabulary. Huawei stays `brand-huawei` and receives the strongest line weight. Apple, Samsung, Honor, Vivo, and Xiaomi keep stable colors across views. A new brand may use the code's stable extension palette only after confirming that it is a chart identity, not a UI semantic color.

The forecast reference card adds one scoped chart palette: `referenceEventPalette` in `tokens.ts` (eight colors). The first three and the fallback reuse the existing semantic colors (`color.link`, `color.warning`, `color.mute`); cannibalization (挤兑) uses `#be123c` from the established extended chart palette (pressure/risk family). Since 2026-11-06, `color.ink` is no longer used as an event color — ink stays reserved for the single primary CTA — and the main chart's `PRODUCT_EVENT_COLOR.cannibalization` keeps the same `#be123c` so both surfaces stay in one color family. This palette is the default and restore-default source for reference-card event **types** only. Custom type colors are a local display configuration of the reference card: they never rewrite the main chart's `PRODUCT_EVENT_COLOR`, never enter model inputs, and never act as UI state colors. Event colors are always accompanied by a text type label; color never carries the type or status alone.

Use no gradient, glow, or AI-specific accent color in the formal product shell. Historical roadshow pages and exploratory proposals are separate surfaces and do not define these tokens.

## Typography

Use the Inter-first system stack for UI, Chinese copy, chart labels, and price values. Use tabular numerals for comparisons and aligned numeric columns. Use Geist Mono only for technical markers such as week IDs, data versions, fingerprints, or batch IDs.

The default hierarchy is 20px section title, 16px body, 14px controls and tables, and 12px metadata. Keep labels short and let whitespace, alignment, and weight establish hierarchy. Do not introduce a second display face or use tracked uppercase for sentences.

Prices are integers with the existing `formatPrice` rules. Currency, sign, and unit remain visible in the text representation; direction is not communicated by color alone.

## Layout

Use the 4px spacing scale. The normal desktop information flow is: 64px page header, shared scope/filter bar, view controls, chart or matrix, then summary/detail/evidence. Keep the filter bar for data scope and the chart controls for local view focus.

The main application is optimized for dense desktop analysis and has a 1440px minimum working width in its established shell. If a table or chart needs more width, scroll the local region and preserve headers and key values. AgentShell has its own responsive states: dock at wide viewports, drawer at medium widths, and full-screen conversation below 1024px. Those states reuse the same shell and context.

Prefer alignment to decoration. Use white cards, 1px rules, short separators, and small elevation. A new card, shadow, or container must clarify grouping or interaction; it must not be added only to make a page feel richer.

## Elevation & Depth

The system is mostly flat. Use the `shadow.l1`, `shadow.l2`, and `shadow.l5` values from `tokens.ts`, which combine a subtle offset with an inset hairline. Cards normally use L1, transient menus and dialogs may use L2 or L5. Avoid large single-layer shadows and floating glass effects.

Motion uses 160ms for feedback, 240ms for mode changes, and 320ms for cross-scene handoff. Honor `prefers-reduced-motion` by keeping the state change and removing travel or staged motion.

## Shapes

Controls, inputs, and chips use 6px radius. Cards use 8px. Dialogs and large overlays use 12px. Pills are reserved for compact tags, badges, and status labels. Do not mix arbitrary 4px, 5px, 10px, or 16px radii into formal components without documenting a component-specific reason.

## Components

### Page shell and filters

`PageHeader`, `FilterBar`, and their controls establish the shared product chrome. Reuse their height, border, focus, and selected-state language. Scope controls answer “what data?”, while chart controls answer “which view of that data?”.

### Cards, tables, and evidence

Cards use the `card` contract. Tables use muted headers, hairline row rules, aligned numeric columns, and local horizontal scrolling when needed. Evidence is visible through source labels, capture time, coverage, fact rows, snapshots, or product links. Missing evidence is stated as “暂无快照” rather than represented by a decorative placeholder.

### Charts

Price lines are the primary layer. Street price is the main series; RRP is a fine reference series. Promotion bands and event annotations are optional layers with explicit controls. Offers are text rights shown through amber icons or popovers and are never drawn as price lines. Missing weeks remain missing; use a dashed bridge only to show continuity without fabricating a point.

Use stable brand colors and a visually stronger Huawei series. In the forecast workbench, the weekly-sales bars (actual fill and forecast outline) use `brand-huawei`, the same chart identity as the Huawei price line — blue stays a UI semantic color (links, selected, favorable) and is never a volume-bar data color. Keep long explanations below the chart in summaries, event rows, tooltips, or detail cards. Provide a textual summary or table alternative for important chart information.

### AgentShell and alerts

AgentShell shares the page tokens and card language. User messages may use a right-aligned ink bubble; Agent messages use conclusion text and structured cards. A standard answer is conclusion, facts, calculation or rule, boundary, and action. Alert cards reuse the warning and error semantics and always show the trigger, threshold, before/after values, data status, and evidence state.

## Do's and Don'ts

- Do import and extend the runtime tokens in `src/theme/tokens.ts`; document any new token before using it.
- Do preserve Huawei-first hierarchy, stable chart colors, explicit data status, and evidence links.
- Do use text labels, signs, icons, or table structure alongside color for status and direction.
- Do keep formal page work in the shared shell; put experiments and recording assets under their historical surfaces.
- Do treat `PRODUCT.md` as product context and `.impeccable/surfaces/*.md` as route-specific decisions.
- Do run the design contract check before typecheck and build; run Impeccable detector and audit when its CLI is available.
- Keep the existing dense analysis model intentional: fixed desktop width and local table scrolling are documented constraints, not accidental overflow.
- Keep formal UI copy evidence-first and avoid causal certainty when the data only supports a correlation or hypothesis.
- Do not add AI-purple, gradients, decorative glow, card-within-card scaffolding, or a second chat visual system.
- Do not use a brand chart color as a UI state color, or a warning color as a generic highlight.
- Do not replace the existing palette with Geist, Ant Design, or Carbon tokens wholesale; use those systems as references for structure, accessibility, and interaction.
- Do not let `/impeccable document` turn historical hardcoded values or roadshow styles into the formal system without human review.
