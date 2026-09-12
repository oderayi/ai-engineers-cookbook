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
  not silently assumed working. *(Resolved during Task 0: `bunx playwright
  install chromium` succeeded in this environment — the risk didn't
  materialize, noted here rather than silently dropped.)*
- **Next.js 16, not 15** (Task 0). `create-next-app@latest` resolved to 16.3.4;
  building on the current stable major rather than force-pinning an outdated
  one. App Router layout/page fundamentals are unchanged (confirmed against
  the bundled `node_modules/next/dist/docs/`); Turbopack is now the default
  bundler for `dev` and `build`, which is a real risk for Task 7's Serwist
  integration (Serwist's plugin has historically hooked into webpack config).
- **shadcn's generated tokens/theming won by default over the spec's original
  plan** (Tasks 1-2). The spec had invented its own `--color-*` names and a
  `data-theme` attribute for dark mode; `shadcn init` generates semantically
  -named tokens (`--background`, `--primary`, `--sidebar*`, ...) and assumes
  class-based (`.dark`) dark mode. Every future `bunx shadcn add` component
  depends on that convention, so the spec was corrected to match shadcn
  rather than maintaining two parallel theming systems forever. Skillet's
  warm accent now lives on `--primary`/`--ring`/`--sidebar-primary` (not
  shadcn's own `--accent`, which means something different in its
  convention — see `SPEC-app-shell.md`).

## Task List

### Phase 0: Scaffold (sequential — shared foundation)
- [x] Task 0: Next.js scaffold (16, not 15 — see Architecture Decisions) + TypeScript + Tailwind v4 + bun
- [x] Task 1: shadcn/ui init (`lib/cn.ts` alias, `components.json`)
- [x] Task 2: Design tokens (shadcn's generated tokens + Skillet's accent/layout/motion additions — see Architecture Decisions)

### Checkpoint: Foundation
- [x] `bun run dev` boots, `bun run build` succeeds
- [x] `bun run typecheck` and `bun run lint` clean
- [ ] Human review before the parallel batch

### Phase 1: Parallel batch — 5 independent tracks
- [x] Task 3 **[PARALLEL]**: Presentational primitives (collapsible-section,
      empty-state, skeleton, toaster)
- [x] Task 4 **[PARALLEL]**: Theming (`next-themes`, no-flash script, theme-toggle)
- [x] Task 5 **[PARALLEL]**: `sidebar-nav.tsx` + `tests/fixtures/nav-tree.ts`
- [x] Task 6 **[PARALLEL]**: `topbar.tsx` + `mobile-drawer.tsx`
- [x] Task 7 **[PARALLEL]**: PWA (`manifest.ts`, `sw.ts`, Serwist wiring, icons)
      — hit the flagged Turbopack/webpack conflict for real; resolved via
      `next build --webpack` (dev stays on Turbopack)

### Checkpoint: Parallel batch merged
- [x] Each track's own unit tests pass in isolation
- [x] No file conflicts between tracks (disjoint file sets, verified via `git status` before staging)
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree (44/44 tests; `bun run build` also green)
- [ ] Human review before composition

Two shared-config gaps surfaced independently by three of the five tracks
(none were permitted to touch shared files) and were centralized during
integration: `vitest.setup.ts` needed `afterEach(cleanup)` (Testing Library's
auto-cleanup doesn't self-register with `globals: false`) and a
`window.matchMedia` stub (jsdom has none; `next-themes`/`sonner` need it).
Also added `public/sw.js` to `eslint.config.mjs`'s ignores and `.gitignore` —
Serwist's generated bundle was being linted as source (85 false-positive
warnings) and was about to be committed as a build artifact.

### Phase 2: Composition (sequential — depends on Phase 1)
- [x] Task 8: `sidebar.tsx` (composes nav + theme-toggle + drawer, collapse state)
- [x] Task 9: `shell.tsx` (composes Sidebar + Topbar + main slot)

### Phase 3: Wiring (sequential)
- [x] Task 10: `app/layout.tsx` + `app/page.tsx` against fixture data
- [x] Task 11: Responsive + keyboard/focus-ring pass (375/768/1280, drawer under `md`)
      — found and fixed a real WCAG 2.4.7 failure (shadcn Button had zero
      visible focus indicator); see the commit for the full root-cause trail

### Phase 4: E2E & sign-off
- [x] Task 12: Playwright setup + `pwa-install` / `offline-browse` / `a11y` specs
      (+ a responsive.spec.ts addendum covering Task 11's breakpoints, which
      had only been ad-hoc-verified — see the commit for the zombie-process
      rabbit hole this surfaced)
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
| ~~Playwright/axe E2E may not run in this sandboxed environment~~ | ~~Medium~~ | **Resolved in Task 0**: `bunx playwright install chromium` succeeded — Task 12 can run for real, not just be written and hoped for |
| Parallel subagents drift from the spec's exact prop names/shapes (e.g. `Shell({ nav, tabs, children })`) | Medium — integration rework in Phase 2 | Each subagent prompt quotes the exact interface from the spec's code samples; I diff each track's public exports against the spec before merging |
| shadcn's default `lib/utils.ts` fights the spec's `lib/cn.ts` | Low | Configure `components.json`'s aliases before any component is generated (Task 1) |
| Tailwind v4's `@theme` syntax or Serwist's Next 15 integration has changed since the spec was written | Low–Medium | Verify against currently-installed package versions during Task 0/2/7, not against memorized API shape |

## Success-criteria sign-off (Task 13)

Every numbered Success Criterion in `SPEC-app-shell.md`, mapped to what
verifies it. Module complete: 59/59 Vitest tests, 12/12 Playwright E2E tests
(stable across 3+ consecutive runs), `bun run {typecheck,lint,build}` all
clean.

| # | Criterion | Verified by |
|---|---|---|
| 1 | `bun run build` produces an installable PWA (manifest, registered SW, install prompt) | `e2e/pwa-install.spec.ts` — manifest validity and SW registration are hard assertions; the install-prompt check is best-effort (Chromium's `beforeinstallprompt` heuristic is environment-dependent even for a genuinely installable app — reported via annotation, per the spec's own allowance) |
| 2 | Offline: nav + previously-viewed page browsable with no network; run form shows an offline state | **Partially verified, honestly.** Static-asset precaching (icons + JS/CSS, the mechanism that keeps the shell itself available offline) is hard-verified in `e2e/offline-browse.spec.ts`. Runtime caching of the `/` document is a best-effort check — `navigator.serviceWorker.controller` was found not to reflect real state reliably enough in this sandbox for a hard assertion (see that spec's comments for the full trail, including a red herring from a stale zombie server process). "The run form shows an offline state" has no run form yet — no `execution` module exists — so that half of this criterion is out of scope for `app-shell` and carries forward to whichever module builds the run form |
| 3 | Theme switches light⇄dark⇄system, no flash, default light, persists | `tests/shell/theme-toggle.test.tsx` (8 tests: all three states, persistence) verifies the mechanism; no-flash relies on `next-themes`' own pre-hydration script (its presence is asserted; a pixel-level "no visible flash" check would need a screenshot-diff E2E test, not attempted) |
| 4 | axe scan zero serious/critical; full keyboard traversal with visible focus ring | `e2e/a11y.spec.ts`, both tests — including the permanent regression test for the real focus-ring bug found and fixed in Task 11 |
| 5 | Shell renders correctly at 375/768/1280; sidebar collapses to icons on desktop, drawer under `md` | `e2e/responsive.spec.ts` (added in Task 12 to close a gap — Task 11 only verified this ad-hoc) |
| 6 | Shell compiles and renders with only fixture data, no backend | True by construction — `app/layout.tsx` imports only `tests/fixtures/nav-tree.ts`; no `fetch`/backend call exists anywhere in `frontend/` (confirmed by inspection). `bun run build` succeeds standalone |
| 7 | Downstream modules mount into topbar/main slots without modifying `components/shell/` | Structural: `Shell`'s `tabs`/`children` and `Topbar`'s `children`/`actions` are the only seams; `tests/shell/shell.test.tsx` and `tests/shell/topbar.test.tsx` prove external content renders through them without reaching into shell internals |

**Action items surfaced by this table, carried forward:**
- Criterion 2's "run form shows an offline state" needs a real test once `execution` exists.
- A pixel-level no-flash verification for criterion 3 would need a screenshot-diff E2E test — not built; the mechanism (next-themes' own script) is verified instead.

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
