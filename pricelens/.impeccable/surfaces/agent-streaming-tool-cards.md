# Agent streaming and tool cards

## Goal

Keep the stable PriceLens Agent shell evidence first while making long or remote runs visibly progressive. The surface covers the existing dock, drawer, and full modes; it does not change page routing.

## Information hierarchy

1. The short stage/status line is announced through `aria-live="polite"` and remains readable before the first answer character.
2. Incremental narrative text and partial deterministic cards appear in the assistant message stream as they arrive.
3. Tool calls use compact white cards with hairlines, tool/status labels, input and output summaries, failure reasons, retry, and filter preview actions.
4. Final result headers separate `事实来源：本地确定性引擎` from the remote narrative/provider badge. Remote price, SKU, scope, steps, citations, and coverage never replace the local baseline.

## State semantics

`queued`, `running`, `success`, `failed`, and `waiting_for_approval` are textual states. Fallbacks identify the reason; simulated forecast cards say `演示数据`. Fingerprint mismatch is `stale_context`, never a completed result. Stop invalidates the run sequence so late events cannot mutate the stream.

## Motion and scroll

Use existing neutral tokens, 160/240/320ms timing, and no gradients, glow, AI purple, or pulse. Respect `prefers-reduced-motion` by keeping state text and removing travel/stagger. New turns anchor at the question and answer start, with a one-time top scroll for the first turn because assistant-ui does not register a user anchor at index zero. Preserve the reader's position afterward; do not force completed long answers to the bottom.

## Evidence and actions

Filter writes remain preview-first and use the shared `buildCards` / `withAutoOn` / `clampMains` semantics. Apply failures stay inline in the card. Undo/redo remains available. SKU chips show model, `romram`, and SKU together so a selected configuration is auditable.
