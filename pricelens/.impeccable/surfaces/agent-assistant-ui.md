# Agent conversation — assistant-ui

Mode: Operate. Primary target: `src/components/Assistant/AgentThread.tsx`.
Related targets: `src/components/Copilot/AgentPanel.tsx`, `src/components/CopilotStable/AgentPanel.tsx`.

## Goal and authority

Both release channels use one conversation surface built with assistant-ui's external-store runtime and headless Thread, Message, ActionBar and Composer primitives. Reference: https://github.com/assistant-ui/assistant-ui and https://www.assistant-ui.com/docs/runtimes/custom/external-store. Existing PriceLens tokens and product evidence contracts remain authoritative. No backend, data-source or provider-key changes.

This is a conversation refactor within the established PriceLens visual system. The reference supplies conversation mechanics and composition; it does not authorize a new palette, theme, product shell or chat identity. The `--aui-*` properties are a local bridge to `theme/tokens.ts`, not a second token source. No system-wide `DESIGN.md` or design-sidecar refresh is required for these local decisions.

## Structure

Compact header with new conversation, size and close controls; a two-line current scope summary with a native disclosure for the complete query chips; one scrollable conversation; a fixed multiline composer. Empty state offers a small set of relevant questions in one quiet grouped list, vertically centred in the available conversation area. User text is right aligned; assistant conclusions are full-width reading text, followed by the channel's structured facts, rules, boundaries and actions. Execution detail is collapsed after successful completion, but stays open while running or when a tool fails. No duplicate global timelines or colored message rails.

## States and actions

Send and Stop are mutually exclusive. Preserve drafts while running, support IME composition and Shift+Enter. New conversation is visibly disabled during a run. Copy confirms success and reports clipboard failures. Modify-question fills the composer for a new request; it does not pretend to edit historical branches. Retry explicitly queries the current scope. No unsupported upload, feedback, history or branching controls. New turns anchor at the question and answer start; the first turn uses a one-time top scroll because assistant-ui only registers user anchors with index greater than zero. Initialization does not force the empty welcome to the bottom, while a completed non-empty conversation reopens at its latest position. Assistant-ui's smooth top-anchor requests become instant when the user prefers reduced motion. A jump-to-latest control lives in the composer toolbar rather than occluding message content or confirmation actions. Cancelled output remains readable and late requests cannot mutate subsequent runs.

## Trust and accessibility

Keep the two channel engines and result-card adapters separate. Preserve stale-context and response-mismatch action locks, evidence access, preview/confirmation and undo. Streaming result cards are read-only until final response validation. Only a concise live status is announced; the full transcript is not a live region. Controls have accessible names, keyboard focus, and disabled states. Escape closes and returns focus to the opener.

The shared thread renders message text and conversation controls. Channel adapters retain the result scope, `real` / `simulated` / `mixed` status, provenance, deterministic numbers, evidence links and domain actions. A collapsed result-metadata summary keeps the scope readable at a glance, and its native disclosure exposes the complete source and scope text. A provider badge describes how an answer was produced; it does not establish data truth or replace a data-status label. Open actions compare their filter patch with current dashboard state using structural selection semantics rather than formatted labels: changed fields require an inline confirmation before writing, identical scopes navigate without a redundant write, and applied navigation stays undoable. Undo/redo history entries carry a unique transaction ID per application so an older action cannot restore a newer unrelated write, and a repeated action ID in a later message cannot inherit an earlier application. The provider also retains the card-to-transaction mapping so closing and reopening the thread does not discard applied, undone or redo state. Tool-card undo is enabled only while that card owns an applied transaction, and row-level locate buttons expose own product, competitor and week in their accessible names. Price-advantage rows are not implicit buttons. Fallback responses disclose their reason in a compact one-line warning beside the answer, with the local capability boundary available in the same native disclosure; execution summaries use explicit success/failure/cancelled/running counts instead of a success/total fraction. Closing the panel preserves a running request; Stop cancels it. Drawer, full-screen and compact modes constrain focus and make background content inert; desktop dock leaves the dashboard available.

## Responsive and visual behavior

Retain the dock/drawer/full mode model. This surface uses the established 440px dock and 640px drawer, each capped by viewport width; below 1024px the conversation fills the viewport. Full mode centers an 800px conversation column and 768px composer. These are local reading-width decisions, not new application-wide layout tokens. Dock and compact modes render price-advantage results as stacked comparison rows so own/competitor prices, delta, direction and locate actions remain fully readable; drawer and desktop full mode retain the dense table, with a labeled keyboard-scrollable overflow region. Composer starts at one row in every mode and grows with the draft; compact mode replaces desktop keyboard instructions with a concise hint. Key controls and compact filter chips use token-derived 44px touch targets. Long Markdown, URLs and tables wrap or scroll locally. Colors, spacing, type, radius and motion reuse `theme/tokens.ts`; reduced motion disables transitions. The documented blue top edge remains the sole active-panel accent.

## Inherited drift

The retained result-card adapters still contain older inline spacing values outside the formal scale, including 5 / 6 / 7px detail gaps. These values existed before this refactor. Adapter font sizes now use the runtime caption/body tokens, while shared thread CSS normalizes rendered result-card titles and table-cell rhythm. The remaining inline spacing debt is recorded maintenance debt, not sanctioned additions to `DESIGN.md` or examples to copy. This pass does not claim that all adapter styling is tokenized.

## Completion

Run design:check, design:lint, typecheck, full check, build:channels and verify:channels. Exercise both built channels, narrow viewport, keyboard/composition, send/stop, drafts, result locks and evidence. Screenshots and build artifacts are local verification outputs, not new Git assets.
