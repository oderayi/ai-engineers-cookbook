# Capability Map: Skillet v1

_Approved 2026-09-09. Downstream specs, plans, and tasks select work by the module
ids below. Ids are kebab-case, chosen once, never renamed mid-initiative._

**All 8 module specs approved as of 2026-09-11.** Next: Phase 2 (Plan) and
Phase 3 (Tasks) per `spec-driven-development`, in the build order below, then
implementation.

Source of intent: [intent/v1.md](intent/v1.md)

| Module id | Responsibility | Depends on |
|---|---|---|
| `recipe-framework` | The recipe module contract: how a recipe declares metadata, parameters, and env vars; how the backend discovers recipes, loads their source, injects UI parameters, and executes them. Owns the **1-to-1 source guarantee** (the file shown is the file run). | — |
| `app-shell` | OpenAI-desktop look and feel, layout, subtle animation, theming (light/dark), PWA (installable, offline shell). The "premium feel" surface. | — |
| `catalog` | Theme groups, basic→advanced ordering within a group, recipe description / use-cases / examples, browse-everything API + UI (collapsible description, collapsible source, the run form). Free to browse regardless of run limits. | `recipe-framework`, `app-shell` |
| `settings` | Global defaults (model-provider API keys, custom backend URL), per-recipe override + inheritance ("inherited from global" indicator), localStorage persistence. | `recipe-framework` |
| `execution` | The run endpoint, SSE streaming of tokens/steps, BYOK key handling (per-request, used then discarded, never persisted server-side). | `recipe-framework`, `settings` |
| `trial-limits` | Keyless trial on the author's key, IP + signed-cookie rate limiting via Upstash Redis, global daily spend cap with kill-switch, "add your own key / clone locally" nudge. | `execution` |
| `workspace` | Multi-tab recipe UI (RunJS-style), progress tracking in localStorage (per-device), completion marks in the catalog. | `catalog`, `execution` |
| `distribution` | One-command local start via `uv` and via Docker, MIT repo setup, env/config documentation. | `recipe-framework`, `execution` |

## Build order

```
recipe-framework, app-shell
        │
        ├─→ catalog, settings
        │        │
        │        └─→ execution
        │                │
        │                ├─→ trial-limits
        │                └─→ workspace
        │                        │
        └────────────────────────┴─→ distribution
```

`recipe-framework` → `app-shell` → `catalog` / `settings` → `execution` →
`trial-limits` / `workspace` → `distribution`

## Frontend-first note

Per the intent, `app-shell` and `catalog` are built with sample/fixture data
first and iterated on visually before the backend engine is real. The dependency
order still holds — fixtures just let the frontend modules be built and reviewed
ahead of `execution`.

## Spec status

| Module | Spec file | Status |
|---|---|---|
| `recipe-framework` | `SPEC-recipe-framework.md` | **approved** 2026-09-09 |
| `app-shell` | `SPEC-app-shell.md` | **approved** 2026-09-09 |
| `catalog` | `SPEC-catalog.md` | **approved** 2026-09-09 |
| `settings` | `SPEC-settings.md` | **approved** 2026-09-09 |
| `execution` | `SPEC-execution.md` | **approved** 2026-09-11 |
| `trial-limits` | `SPEC-trial-limits.md` | **approved** 2026-09-11 |
| `workspace` | `SPEC-workspace.md` | **approved** 2026-09-11 |
| `distribution` | `SPEC-distribution.md` | **approved** 2026-09-11 |
