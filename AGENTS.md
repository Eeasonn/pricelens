# PriceLens Agent instructions

When a task changes a user-facing page, component, chart, layout, style, token, AgentShell, alert, or interaction, read these files before editing:

1. [`PRODUCT.md`](./PRODUCT.md) for product context, data boundaries, evidence rules, and Agent behavior.
2. [`pricelens/DESIGN.md`](./pricelens/DESIGN.md) for the formal visual system and component rules.
3. [`docs/PRICE-LENS-DESIGN-HANDOFF.md`](./docs/PRICE-LENS-DESIGN-HANDOFF.md) for the execution sequence and completion criteria.

Treat `pricelens/src/theme/tokens.ts` as the runtime token source of truth. Reuse existing shell and component patterns before adding new primitives. For a new route or complex surface, create a matching local decision file under `pricelens/.impeccable/surfaces/` before implementation.

Before handing off a UI change, run from the repository root:

```bash
npm --prefix pricelens run design:check
npm --prefix pricelens run design:lint
npm --prefix pricelens run typecheck
```

Run `npm --prefix pricelens run check` when the change affects application behavior, tests, or the generated offline build. A task is complete only when the applicable checks pass and the handoff checklist is satisfied.
