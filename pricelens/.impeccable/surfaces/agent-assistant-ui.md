# Agent conversation — assistant-ui

Mode: Operate. Primary target: `src/components/Assistant/AgentThread.tsx`.
Related targets: `src/components/Copilot/AgentPanel.tsx`, `src/components/CopilotStable/AgentPanel.tsx`.

## Goal and authority

Both release channels use one conversation surface built with assistant-ui's external-store runtime and headless Thread, Message, ActionBar and Composer primitives. Reference: https://github.com/assistant-ui/assistant-ui and https://www.assistant-ui.com/docs/runtimes/custom/external-store. Existing PriceLens tokens and product evidence contracts remain authoritative. No backend, data-source or provider-key changes.

This is a conversation refactor within the established PriceLens visual system. The reference supplies conversation mechanics and composition; it does not authorize a new palette, theme, product shell or chat identity. The `--aui-*` properties are a local bridge to `theme/tokens.ts`, not a second token source. No system-wide `DESIGN.md` or design-sidecar refresh is required for these local decisions.

## Structure

Compact header with new conversation, size and close controls; visible current query scope; one scrollable conversation; a fixed multiline composer. Empty state offers a small set of relevant questions. User text is right aligned; assistant conclusions are full-width reading text, followed by the channel's structured facts, rules, boundaries and actions. Execution detail is collapsed after completion. No duplicate global timelines or colored message rails.

## States and actions

Send and Stop are mutually exclusive. Preserve drafts while running, support IME composition and Shift+Enter. New conversation is visibly disabled during a run. Copy confirms success and reports clipboard failures. Modify-question fills the composer for a new request; it does not pretend to edit historical branches. Retry explicitly queries the current scope. No unsupported upload, feedback, history or branching controls. The thread follows new output only while the reader is at the bottom; a jump-to-latest control restores following. Cancelled output remains readable and late requests cannot mutate subsequent runs.

## Trust and accessibility

Keep the two channel engines and result-card adapters separate. Preserve stale-context and response-mismatch action locks, evidence access, preview/confirmation and undo. Streaming result cards are read-only until final response validation. Only a concise live status is announced; the full transcript is not a live region. Controls have accessible names, keyboard focus, and disabled states. Escape closes and returns focus to the opener.

The shared thread renders message text and conversation controls. Channel adapters retain the result scope, `real` / `simulated` / `mixed` status, provenance, deterministic numbers, evidence links and domain actions. A provider badge describes how an answer was produced; it does not establish data truth or replace a data-status label. Closing the panel preserves a running request; Stop cancels it. Drawer, full-screen and compact modes constrain focus and make background content inert; desktop dock leaves the dashboard available.

## Responsive and visual behavior

Retain the dock/drawer/full mode model. This surface uses the established 440px dock and 640px drawer, each capped by viewport width; below 1024px the conversation fills the viewport. Full mode centers an 800px conversation column and 768px composer. These are local reading-width decisions, not new application-wide layout tokens. Long Markdown, URLs and tables wrap or scroll locally. Colors, spacing, type, radius and motion reuse `theme/tokens.ts`; reduced motion disables transitions. The documented blue top edge remains the sole active-panel accent.

## Inherited drift

The retained result-card adapters still contain older values outside the formal scale, including stable-channel 10 / 10.5 / 11px metadata and a 9px card gap, 13px card titles in both channels, and 7px detail gaps. These values existed before this refactor. They remain recorded maintenance debt, not sanctioned additions to `DESIGN.md` or examples to copy into the shared thread. This documentation pass does not normalize the existing business cards or claim that all adapter styling is tokenized.

## Completion

Run design:check, design:lint, typecheck, full check, build:channels and verify:channels. Exercise both built channels, narrow viewport, keyboard/composition, send/stop, drafts, result locks and evidence. Screenshots and build artifacts are local verification outputs, not new Git assets.
