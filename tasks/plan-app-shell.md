# Implementation Plan: `app-shell`

Spec: [docs/SPEC-app-shell.md](../docs/SPEC-app-shell.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Second module built, per the approved build order. `frontend/` does not exist
yet — this plan creates it.

## Overview

Scaffold the Next.js 15 + Tailwind v4 + shadcn frontend, lay down the design
tokens and theming, then build the shell's pieces — sidebar, topbar, PWA,
presentational primitives — as far as possible **in parallel**, since they are
largely independent file sets once the shared foundation exists. Compose them
into the actual `Shell` last, wire up `app/layout.tsx` against fixture data
(no backend), then verify with unit + E2E tests.

## Architecture Decisions

- **Sequential foundation, then a parallel batch, per the user's standing
  preference to parallelize heavily.** Tasks 0–2 (scaffold, shadcn init,
  design tokens) are a single shared surface — package.json, tsconfig,
  tailwind config, globals.css — and must land first, done directly rather
  than farmed out. Once they exist, Tasks 3–7 touch disjoint files with no
  cross-dependency and are dispatched to subagents concurrently. Composition
  (Tasks 8–9) is sequential again because `sidebar.tsx` and `shell.tsx`
  genuinely depend on the parallel batch's output.
- **`lib/cn.ts`, not shadcn's default `lib/utils.ts`.** The spec names it
  explicitly; shadcn's init supports a custom utils alias in
  `components.json`, so this is a one-line config choice, not a rename-after.
- **Fixture-first, no backend.** `app/page.tsx` renders `Shell` with
  `tests/fixtures/nav-tree.ts` and placeholder main content — `catalog` isn't
  built yet, and success criterion 6 requires the shell to work without it.
- **Playwright/axe E2E is a real environment risk, not just a task.** These
  need browser binaries and may not run in this sandbox — flagged in Risks,
  not silently assumed working.

## Task List

### Phase 0: Scaffold (sequential — shared foundation)
- [ ] Task 0: Next.js 15 + TypeScript + Tailwind v4 + bun project scaffold
- [ ] Task 1: shadcn/ui init (`lib/cn.ts` alias, `components.json`)
- [ ] Task 2: Design tokens (`globals.css` `@theme`, light + dark, `lib/tokens.ts`)

### Checkpoint: Foundation
- [ ] `bun run dev` boots, `bun run build` succeeds
- [ ] `bun run typecheck` and `bun run lint` clean
- [ ] Human review before the parallel batch

### Phase 1: Parallel batch — 5 independent tracks
- [ ] Task 3 **[PARALLEL]**: Presentational primitives (collapsible-section,
      empty-state, skeleton, toaster)
- [ ] Task 4 **[PARALLEL]**: Theming (`next-themes`, no-flash script, theme-toggle)
- [ ] Task 5 **[PARALLEL]**: `sidebar-nav.tsx` + `tests/fixtures/nav-tree.ts`
- [ ] Task 6 **[PARALLEL]**: `topbar.tsx` + `mobile-drawer.tsx`
- [ ] Task 7 **[PARALLEL]**: PWA (`manifest.ts`, `sw.ts`, Serwist wiring, icons)

### Checkpoint: Parallel batch merged
- [ ] Each track's own unit tests pass in isolation
- [ ] No file conflicts between tracks (disjoint file sets, verified by diff)
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree
- [ ] Human review before composition

### Phase 2: Composition (sequential — depends on Phase 1)
- [ ] Task 8: `sidebar.tsx` (composes nav + theme-toggle + drawer, collapse state)
- [ ] Task 9: `shell.tsx` (composes Sidebar + Topbar + main slot)

### Phase 3: Wiring (sequential)
- [ ] Task 10: `app/layout.tsx` + `app/page.tsx` against fixture data
- [ ] Task 11: Responsive + keyboard/focus-ring pass (375/768/1280, drawer under `md`)

### Phase 4: E2E & sign-off
- [ ] Task 12: Playwright setup + `pwa-install` / `offline-browse` / `a11y` specs
- [ ] Task 13: Success-criteria sign-off pass

### Checkpoint: Module complete
- [ ] All 7 success criteria in `SPEC-app-shell.md` individually verified
- [ ] Full suite + lint + typecheck + build green
- [ ] Human review before `catalog`/`settings` begin consuming this module

## Parallelization Notes (Phase 1)

| Track | Task | Files | Depends on |
|---|---|---|---|
| A | 3 | `components/primitives/*.tsx` + tests | Tasks 0–2 only |
| B | 4 | `components/shell/theme-toggle.tsx`, theme provider wiring, no-flash script + tests | Tasks 0–2 only |
| C | 5 | `components/shell/sidebar-nav.tsx`, `tests/fixtures/nav-tree.ts` + tests | Tasks 0–2 only |
| D | 6 | `components/shell/topbar.tsx`, `components/shell/mobile-drawer.tsx` + tests | Tasks 0–2 only |
| E | 7 | `app/manifest.ts`, `sw.ts`, `next.config.ts` (Serwist section only), icon assets | Tasks 0–2 only |

No track reads or writes another track's files. Each subagent gets: the
relevant `SPEC-app-shell.md` excerpt, the exact file paths, the tokens from
Task 2, and instructions to write tests first (TDD is a standing project
requirement) and run `bun run test` + `bun run lint` + `bun run typecheck`
itself before reporting back. I review and integrate all five before Phase 2.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Playwright/axe E2E may not run in this sandboxed environment (browser binaries, permissions) | Medium — Task 12 could stall | Attempt `bunx playwright install`; if it fails, write the specs anyway (they're correct and reviewable), document that they're unverified in this environment, and flag it explicitly rather than claiming a false pass |
| Parallel subagents drift from the spec's exact prop names/shapes (e.g. `Shell({ nav, tabs, children })`) | Medium — integration rework in Phase 2 | Each subagent prompt quotes the exact interface from the spec's code samples; I diff each track's public exports against the spec before merging |
| shadcn's default `lib/utils.ts` fights the spec's `lib/cn.ts` | Low | Configure `components.json`'s aliases before any component is generated (Task 1) |
| Tailwind v4's `@theme` syntax or Serwist's Next 15 integration has changed since the spec was written | Low–Medium | Verify against currently-installed package versions during Task 0/2/7, not against memorized API shape |

## Open Questions

Carried from the spec, not blocking:
- Landing page: catalog-first with a dismissible intro banner (resolved by
  `catalog`'s spec — this module just needs a placeholder in `app/page.tsx`
  until `catalog` exists).
- Optional per-group `lucide` icon in the nav — `sidebar-nav.tsx` (Task 5)
  should accept an optional icon in its nav-model prop shape so this doesn't
  require a later contract change, without rendering one until `catalog`
  supplies real data.
- Exact accent/neutral oklch values — Task 2 ships the spec's stated starting
  values; visual tuning is expected later, not a blocker now.
