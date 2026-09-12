# Implementation Plan: `catalog`

Spec: [docs/SPEC-catalog.md](../docs/SPEC-catalog.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Fourth module built, per the approved build order. Depends on
`recipe-framework` (done, `backend/`) and `app-shell` (done, `frontend/`
shell/tokens). `settings` (done) is a peer dependency in the other direction:
this module's run form embeds `settings`' already-built `RecipeOverrides`
component verbatim.

## Overview

Everything a learner sees before pressing Run: the sidebar nav tree, the `/`
catalog index, and the `/r/[slug]` recipe page (description, worked examples,
byte-for-byte source viewer, and a run form generated entirely from the
recipe's published JSON Schema — never hand-coded). Built bottom-up: the wire
models and fixtures first (zero DOM, fully unit-testable), then the pure
logic (nav-tree building, JSON-Schema-to-form compilation), then the API
client wired to the now-real `recipe-framework` backend, then UI in two more
parallel batches, then the run form (the most involved single piece), then
page-level composition and E2E.

## Architecture Decisions

- **Two small `recipe-framework` amendments are required before any frontend
  work, both additive, both done directly (not delegated) since they touch
  an already-shipped, fully-tested backend module:**
  1. **CORS.** `backend/src/skillet/api/app.py` has no CORS middleware at
     all — `settings` was the first module in this codebase to reach
     `localStorage`, but `catalog` is the *first* to make a real network
     call to this backend from a browser origin (`localhost:3000` →
     `localhost:8000` in dev). Without `CORSMiddleware`, every fetch fails
     silently at the browser, not at the API. Added as a small, configurable
     (env var, default `http://localhost:3000`) addition — not a response
     contract change, so it doesn't need the "ask first" gate that a
     contract change would.
  2. **Group metadata is missing from the wire contract.** `discovery.py`
     already sorts recipes by `(group.order, recipe.order)` and has each
     recipe's full `GroupManifest` (`id, title, order, icon`) in hand while
     building `RecipeSummary`/`RecipeDetail` — but `api/schemas.py` only
     serializes `group: str` (the bare id). The sidebar nav tree needs a
     group **title** (and optional **icon**) to render at all — `app-shell`'s
     `NavGroup` type (already shipped) has had a `title`/`icon` slot waiting
     for this since Task 5 of that module. Fix: add `groupTitle: str` and
     `groupIcon: str | None` to both `RecipeSummary` and `RecipeDetail`
     (group *order* is already implicit in list order, no field needed for
     that). This is exactly the kind of change `SPEC-catalog.md`'s existing
     "Cross-module contract (`recipe-framework` amendment)" section already
     anticipated for `inputSchema`/`sourceFiles`/`env`/etc. — it was just
     incomplete. Both specs get a short addendum documenting this.
  - Also found while reading the backend: `SPEC-catalog.md`'s own Code Style
    sample `RecipeDetail` zod object is **missing `examples`** entirely,
    even though Confirmed Decision 7 and the whole Testing Strategy talk
    about it at length, and the backend's real `RecipeDetail` includes it.
    Treated as a spec typo, not a design question — `lib/api/models.ts`
    includes it; noted in `SPEC-catalog.md`.
- **The backend base URL is a fixed env var for this module, not
  `settings.customBackendUrl`.** `SPEC-execution.md` explicitly owns a
  `useBackendBaseUrl()` hook that resolves `settings.customBackendUrl ||
  NEXT_PUBLIC_BACKEND_URL` — but `execution` is built *after* `catalog` in
  the approved order, so `catalog` cannot import a hook that doesn't exist
  yet (the same forward-dependency shape `settings` hit with catalog's
  `EnvVar`, solved the same way: don't guess at an interface, use what's
  actually available). `catalog`'s own read-only fetches (`GET /recipes`,
  `/recipes/{slug}`, `/recipes/{slug}/source`) use `NEXT_PUBLIC_BACKEND_URL`
  directly (default `http://localhost:8000` in dev, matching
  `SPEC-distribution.md`'s Docker Compose env var name) with no
  `settings`-blob coupling. `execution`, built later, is free to either
  reuse this or fully own its richer version — this module's own success
  criteria don't depend on the override working.
- **`react-query`'s `QueryClient` lives in a small client-component
  provider** (`app/providers.tsx` or similar), mounted once in
  `app/layout.tsx` alongside the existing `ThemeProvider`/`TooltipProvider` —
  `layout.tsx` itself stays a server component.
- **`app/layout.tsx` becomes async** and replaces its current
  `tests/fixtures/nav-tree.ts` import (an app-shell-only placeholder, always
  intended to be replaced — see that file's own comment) with a real fetch +
  `buildNavModel()` call, falling back to an empty `NavModel` (not a crash,
  not the old fixture) if the backend is unreachable — browsing must degrade
  gracefully per the spec's own "never gated" boundary, and an empty sidebar
  is a valid, first-class empty state, not an error page.
- **No new dependency for the file-upload control.** `list[UploadedFile]`
  fields get a plain native `<input type="file" multiple>` plus manual
  drag-and-drop handlers rather than pulling in `react-dropzone` — the
  boundary section explicitly asks-first before adding a dependency for
  bundle size, and a native input covers the acceptance criteria (accept/
  maxFiles hints, required validation) without one.
- **The Run button is a plain, always-enabled-when-valid submit button for
  this module**, per the spec's own scope line ("its limited/offline states
  are driven by `trial-limits`/connectivity, not by catalog logic" — success
  criterion 5). `onSubmit` hands `{ params, recipeSlug }` upward through a
  prop; `RecipeView` (this module) has nowhere real to send it yet since
  `execution` doesn't exist, so it no-ops with a `// TODO(execution)`
  comment rather than inventing a fake submit handler.
- **`RecipeView` stays exactly where `SPEC-catalog.md`'s Project Structure
  puts it** (`app/r/[slug]/recipe-view.tsx`), not moved to
  `components/catalog/`. Next.js's file-based routing only treats
  `page.tsx`/`layout.tsx`/`route.tsx` specially — any other colocated file is
  an ordinary importable module, so `workspace` mounting
  `<RecipeView slug={…} />` from a different route needs no relocation.
  `RecipeView` is a `"use client"` component that takes `slug` and fetches
  its own `RecipeDetail` via the `useRecipe` react-query hook (Task 3) —
  not a server-fetched prop — so `workspace` can mount/unmount it as tab
  content without a server round trip per mount.
- **Catalog's own fixtures, not real recipe content.** There is no
  `backend/recipes/` (production content) directory yet — authoring actual
  teaching recipes is ongoing content work outside all 8 capability-map
  modules, per the intent doc's own binding-constraint framing. This module
  ships its own `tests/fixtures/catalog/` (3-4 sample `RecipeDetail`s across
  2 groups) for unit/component tests, and uses the backend's *existing*
  `backend/tests/fixtures/recipes/demo/` set (already used by
  `recipe-framework`'s own tests) for the one real, manually-verified
  integration pass against a live backend (this module's Task 12
  equivalent).

## Task List

### Phase 0: `recipe-framework` amendment (sequential, done directly)
- [ ] Task 0: CORS middleware + `groupTitle`/`groupIcon` on `RecipeSummary`/`RecipeDetail`

### Checkpoint: Amendment merged
- [ ] Backend's own test suite still green; both spec files updated
- [ ] Human review before frontend work begins

### Phase 1: Foundation (sequential — fixtures depend on the model shapes)
- [ ] Task 1: `lib/api/models.ts` (zod wire models)
- [ ] Task 2: `tests/fixtures/catalog/` (sample recipe details + source bundles)

### Checkpoint: Foundation
- [ ] `bun run typecheck` clean; fixtures validate against the zod models
- [ ] Human review before the parallel batch

### Phase 2: Parallel batch — 3 independent pure-logic tracks
- [ ] Task 3 **[PARALLEL]**: `lib/api/recipes.ts` + react-query hooks (`useRecipes`, `useRecipe`, `useSource`)
- [ ] Task 4 **[PARALLEL]**: `lib/catalog/nav-model.ts` (`RecipeSummary[]` → `NavModel`)
- [ ] Task 5 **[PARALLEL]**: `lib/catalog/schema-form.ts` (`compileForm`: JSON Schema → fields + zod validator)

### Checkpoint: Parallel batch 1 merged
- [ ] Each track's own tests pass in isolation; no file conflicts
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree
- [ ] Human review before wiring the real nav data into the shell

### Phase 3: Provider wiring + real nav data (sequential)
- [ ] Task 6: `app/providers.tsx` (react-query `QueryClient`) + `app/layout.tsx` fetches real nav data

### Checkpoint: Shell now backed by real (or gracefully-empty) data
- [ ] `bun run dev` renders the shell against a live backend and against no backend, both correctly
- [ ] Human review before the index-page parallel batch

### Phase 4: Parallel batch — 2 independent index-page tracks
- [ ] Task 7 **[PARALLEL]**: `intro-banner.tsx` (dismissible, `useLocalStorageBoolean`)
- [ ] Task 8 **[PARALLEL]**: `recipe-filter.tsx` (controlled text filter)

### Checkpoint: Parallel batch 2 merged
- [ ] Each track's tests pass; no conflicts; full suite clean

### Phase 5: Catalog index (sequential — composes Tasks 4, 7, 8)
- [ ] Task 9: `catalog-index.tsx` + `app/page.tsx` (replaces `app-shell`'s placeholder `EmptyState`)

### Checkpoint: Index complete
- [ ] `bun run test`, `typecheck`, `lint` clean
- [ ] Human review before the recipe-page-regions parallel batch

### Phase 6: Parallel batch — 3 independent recipe-page regions
- [ ] Task 10 **[PARALLEL]**: `description-panel.tsx`
- [ ] Task 11 **[PARALLEL]**: `examples-panel.tsx`
- [ ] Task 12 **[PARALLEL]**: `source-viewer.tsx`

### Checkpoint: Parallel batch 3 merged
- [ ] Each track's tests pass; no conflicts; full suite clean
- [ ] Human review before the run form

### Phase 7: Run form (mostly sequential — internal dependency chain)
- [ ] Task 13 **[PARALLEL — 2 tracks]**: field components (`fields/`)
- [ ] Task 14: `run-form.tsx` (composes Task 5 + Task 13 + `settings`' `RecipeOverrides` + Run button)

### Checkpoint: Run form complete
- [ ] Table-driven schema→form tests pass; `bun run test`, `typecheck`, `lint` clean

### Phase 8: Recipe page composition + routing (sequential)
- [ ] Task 15: `app/r/[slug]/recipe-view.tsx` + `app/r/[slug]/page.tsx`

### Checkpoint: Recipe page complete
- [ ] `bun run build` succeeds; manual check against a live backend (demo fixtures)

### Phase 9: E2E + sign-off (sequential)
- [ ] Task 16: Playwright specs (`browse-catalog`, `recipe-page`, `run-form-validation`) + axe pass
- [ ] Task 17: Success-criteria sign-off pass

### Checkpoint: Module complete
- [ ] All 7 success criteria in `SPEC-catalog.md` individually verified
- [ ] Full suite + lint + typecheck + build + E2E green
- [ ] Human review before `execution` begins consuming this module's run form / recipe page

## Parallelization Notes

| Batch | Track | Files | Depends on |
|---|---|---|---|
| 1 | A (Task 3) | `lib/api/recipes.ts`, `hooks/use-recipes.ts` (or colocated) + tests | Task 1 only |
| 1 | B (Task 4) | `lib/catalog/nav-model.ts` + test | Task 1 only |
| 1 | C (Task 5) | `lib/catalog/schema-form.ts` + table-driven test | Nothing catalog-specific (pure JSON Schema → zod) |
| 2 | A (Task 7) | `components/catalog/intro-banner.tsx` + test | Task 0 only (uses `useLocalStorageBoolean`, already built) |
| 2 | B (Task 8) | `components/catalog/recipe-filter.tsx` + test | Nothing (controlled component) |
| 3 | A (Task 10) | `description-panel.tsx` + test | Task 1 (types), Task 2 (fixtures) |
| 3 | B (Task 11) | `examples-panel.tsx` + test | Task 1, Task 2 |
| 3 | C (Task 12) | `source-viewer.tsx` + test | Task 1, Task 2 |
| 4 | A (Task 13) | `fields/text-field.tsx`, `number-field.tsx`, `slider-field.tsx`, `textarea-field.tsx` + tests | Task 5's `FieldDescriptor` type only |
| 4 | B (Task 13) | `fields/select-field.tsx`, `switch-field.tsx`, `file-dropzone-field.tsx` + tests | Task 5's `FieldDescriptor` type only |

No track reads or writes another track's files. Each subagent gets the
relevant `SPEC-catalog.md` excerpt, the exact file paths and prop
interfaces (including the confirmed backend field names from
`backend/src/skillet/api/schemas.py` and `app-shell`'s existing
`NavModel`/`NavGroup`/`NavRecipe` types, so nothing is guessed), and
instructions to write tests first and run `bun run test` + `lint` +
`typecheck` itself before reporting back. I review and integrate before
moving to the next phase.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| CORS/group-metadata amendment drifts from what the frontend actually needs | High — blocks every later task | Done first, directly, with the backend's own test suite as the gate, before any frontend task starts |
| `compileForm`'s JSON-Schema→field mapping misses a real Pydantic v2 `model_json_schema()` shape (e.g. `anyOf` for `Optional[X]`, `$defs` refs) | High — the run form is the module's centerpiece | Table-driven tests built directly against `model_json_schema()` output from real Pydantic models (not hand-written JSON), including an `Optional[str] = None` case, before trusting any hand-written JSON Schema fixture |
| `RecipeOverrides`' actual prop shape has drifted since `settings` shipped | Medium | Task 14 imports the real component and its exported `RecipeOverridesProps` directly — a compile error surfaces drift immediately, no guessing |
| Shiki's build-time grammar loading conflicts with `next build --webpack` (this project's established build mode, forced by Serwist in `app-shell`) | Medium | Verified during Task 12; shiki has a webpack-compatible bundle mode documented for exactly this case |
| A subagent building a recipe-page region reaches for a network call instead of the `RecipeDetail` prop it's handed | Low | Every region task's prop interface takes fully-resolved data, never a slug — explicit in each subagent's instructions |

## Open Questions

Carried from the spec, not blocking for these tasks:
- Filter scope (substring only vs. also difficulty/group) — spec leans
  substring only; Task 8 ships that, extensible later.
- Deep-linking to a source line — spec leans "later"; not attempted here.
- Group icons — spec leans "yes, optional"; Task 0's `groupIcon` field and
  Task 4's nav model both support it as optional from the start.

## Success-criteria sign-off (Task 17)

Every numbered Success Criterion in `SPEC-catalog.md`, mapped to what
verifies it. Module complete: full unit suite green (see per-criterion
counts below), 18/18 Playwright E2E tests stable across 3 consecutive
runs, `bun run {typecheck,lint,build}` all clean. Two genuine,
independently-reproduced bugs were found and fixed while building this
module's own verification (not just features shipped) — a required-field
empty-string validation gap and a WCAG AA color-contrast failure in the
shared `--primary` design token — both flagged in their own commits and
cross-referenced below.

| # | Criterion | Verified by |
|---|---|---|
| 1 | The entire catalog + a recipe page render from fixtures with no backend process running | `tests/catalog/catalog-index.test.tsx` and `tests/catalog/recipe-view.test.tsx` mock the data-fetching hooks entirely — no real network in either. `app/layout.tsx`'s own graceful degradation (an unreachable backend falls back to `{ groups: [] }`, never throws) additionally means even the *real* app never crashes without a backend, verified directly in Task 6 |
| 2 | For every fixture recipe, the run form is produced solely from `input_schema`, and client validation matches the schema constraints (verified by the table-driven tests) | `tests/catalog/schema-form.test.ts` — 32 tests, every fixture built from **real** `model_json_schema()` output (never hand-guessed), including the two real bugs this table-driven approach caught: the `textarea`/`list[str]` string-vs-array mismatch (fixed during Task 14) and required fields silently accepting `""` (fixed during Task 16, off a real browser E2E failure — the jsdom-only table-driven tests alone did not catch this one). `tests/catalog/run-form.test.tsx`'s "Task 2's fixture set covers every FieldDescriptor control type at least once" test additionally guards against the control-type coverage silently narrowing |
| 3 | The source viewer's per-file content byte-matches the `SourceBundle` fixture (and, in integration, the backend's `/source` response) | `tests/catalog/source-viewer.test.tsx` — byte-for-byte `textContent` equality against real, unmocked shiki output for the fixture case. In integration: `e2e/browse-catalog.spec.ts` asserts real source content from the actual backend response (`class Params(BaseParams)` from the real `echo` recipe's `recipe.py`), and Task 15's manual verification cross-checked the full file |
| 4 | Browsing, filtering, expanding description/source, and reading work with the network disabled after one online visit | **Partially verified, honestly** — the same `navigator.serviceWorker.controller`-never-resolves limitation `app-shell`'s own `offline-browse.spec.ts` already thoroughly documented applies identically here (this sandboxed Playwright/Chromium combination never routes a fetch through the SW's own handler, so its cross-origin `NetworkFirst` caching can't be hard-verified in this environment). `e2e/recipe-page.spec.ts`'s offline test reports the outcome as a best-effort annotation, same pattern as that precedent, rather than a false-passing or false-failing hard assertion. The *mechanism* (Serwist's default cross-origin runtime-caching rule, wired into `sw.ts` since `app-shell`) is in place and would provide this in a real browser |
| 5 | The Run button is enabled only when the form is valid; its limited/offline states are driven by `trial-limits`/connectivity, not by catalog logic | `tests/catalog/run-form.test.tsx` (unit) + `e2e/run-form-validation.spec.ts` (real backend, real `Field(..., min_length=1)` constraint) — the E2E version of this exact check is what caught the required-empty-string bug. `RunForm` itself has no rate-limit/offline-specific logic anywhere in it — structurally, `trial-limits`/`execution` are the only modules that could layer that in later |
| 6 | axe scan of the recipe page: zero serious/critical; every collapsible region operable by keyboard; "Try this example" pre-fills and focuses the form | `e2e/recipe-page.spec.ts`'s axe scan (zero violations — this test is what caught the real `--primary` contrast bug, fixed in its own commit) + `e2e/browse-catalog.spec.ts`'s real Tab/Enter/Space keyboard test for the description toggle (not just a click, added specifically to verify this criterion's literal wording rather than inferring it). "Try this example" pre-fills AND focuses: verified by `tests/catalog/recipe-view.test.tsx`'s unit test only — **honestly not covered by E2E**, since neither E2E-fixture recipe (`echo`, `echo-with-helper` — `recipe-framework`'s own minimal smoke-test fixtures) declares a `[[recipe.example]]` block, and extending those fixtures for this frontend module's E2E coverage was judged out of scope |
| 7 | `workspace` can render `<RecipeView slug=… />` as tab content without modifying `components/catalog/` | Structural, by construction: `RecipeView`'s props (`{ slug, onStatusChange?, className? }`) are self-contained and it fetches its own data client-side — true today, but (same carried-forward caveat as every other module's own sign-off for a not-yet-built consumer) only really provable once `workspace` exists and actually does it |

**Action items surfaced by this table, carried forward:**
- Criterion 4's offline verification is best-effort in this sandbox, same as `app-shell`'s own precedent — nothing new to fix, just to keep documenting honestly as later modules build on this.
- Criterion 6's "Try this example" E2E gap should close naturally once real recipe content with `[[recipe.example]]` blocks exists (content authoring, ongoing work outside all 8 modules) — no code change needed, just real fixtures to test against.
- Criterion 7 will only be truly confirmed once `workspace` is built and actually mounts `<RecipeView>`.
