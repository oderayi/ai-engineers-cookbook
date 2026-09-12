# Tasks: `catalog`

Plan: [tasks/plan-catalog.md](plan-catalog.md). Spec: [docs/SPEC-catalog.md](../docs/SPEC-catalog.md).

---

## Phase 0: `recipe-framework` amendment (sequential, done directly — not delegated)

### Task 0: CORS middleware + group metadata on the wire contract

**Description:** Two small, additive backend changes `catalog` needs before
any frontend task can start: (1) CORS middleware, since this is the first
module to call the backend from a browser origin; (2) expose each recipe's
group `title`/`icon` (already resolved server-side via `discovery.py`,
never serialized) so the sidebar nav tree has something to render.

**Acceptance criteria:**
- [x] `backend/src/skillet/api/app.py`: `CORSMiddleware` added, allowed
      origins from an env var (e.g. `SKILLET_CORS_ORIGINS`, comma-separated),
      defaulting to `http://localhost:3000` when unset
- [x] `RecipeSummary` and `RecipeDetail` (`api/schemas.py`) gain
      `group_title: str` / `group_icon: str | None` (wire: `groupTitle`,
      `groupIcon`), populated from `DiscoveredRecipe.group.title` / `.icon`
      in `api/recipes.py`'s two endpoint functions
- [x] `SPEC-recipe-framework.md` and `SPEC-catalog.md` each get a short
      "amendment" note (matching the existing precedent in `SPEC-catalog.md`
      for `inputSchema`/`sourceFiles`/`env`/`examples`/`readmeMarkdown`)
- [x] No existing `recipe-framework` success criterion regresses

**Verification:**
- [x] Backend tests pass: `cd backend && uv run pytest` (123/123)
- [x] `cd backend && uv run ruff check .`
- [x] Manual: no ASGI server (uvicorn/`fastapi[standard]`) is installed in
      this backend yet (that's `distribution`'s job) — CORS is verified
      instead via `TestClient`/httpx against the real ASGI app in
      `test_api_app.py`, which genuinely exercises `CORSMiddleware`, not a
      mock

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/api/app.py`
- `backend/src/skillet/api/schemas.py`
- `backend/src/skillet/api/recipes.py`
- `backend/tests/...` (new/updated tests for both changes)
- `docs/SPEC-recipe-framework.md`, `docs/SPEC-catalog.md`

**Estimated scope:** Small: 3-5 files

---

## Phase 1: Foundation (sequential)

### Task 1: `lib/api/models.ts` — zod wire models

**Description:** The zod schemas mirroring the backend's exact camelCase
wire contract (`backend/src/skillet/api/schemas.py`), including `examples`
(missing from `SPEC-catalog.md`'s own Code Style sample — a spec typo,
corrected here) and the new `groupTitle`/`groupIcon` fields from Task 0.

**Acceptance criteria:**
- [x] `EnvVar`, `Example`, `SourceFileRef`, `RecipeSummary`, `RecipeDetail`,
      `SourceFileWithContent`, `SourceBundle` all defined, field-for-field
      matching the backend's `CamelModel` output
- [x] `RecipeDetail.env` is typed so it's assignable to `settings`'
      `RecipeOverridesProps["recipe"]["env"]` (`RecipeEnvDecl[]`) with no
      cast — add the same kind of compile-time-only assertion `settings`
      used in `tests/settings/recipe-overrides.test.tsx`
- [x] `difficulty` is `z.enum(["basic", "intermediate", "advanced"])`
- [x] A minimal and a fully-populated fixture object each parse via
      `RecipeDetail.parse(...)` with no errors

**Verification:**
- [x] Tests pass: `cd frontend && bun run test api/models` (13/13)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 0 (needs the real field names/shapes to mirror)

**Files likely touched:**
- `frontend/lib/api/models.ts`
- `frontend/tests/api/models.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 2: `tests/fixtures/catalog/` — sample recipe data

**Description:** 3-4 sample `RecipeDetail` fixtures across 2 groups
(varying difficulty, at least one with a `readmeMarkdown`, at least one with
zero `env` entries, at least one with multiple `examples`), each with a
matching `SourceBundle` fixture, plus the derived `RecipeSummary[]` list.
This is the data every later task tests against — get realistic variety in
now rather than adding it piecemeal later.

**Acceptance criteria:**
- [x] Every fixture `RecipeDetail`/`SourceBundle` parses via Task 1's zod
      schemas with no errors (a test enforces this, so a future edit to a
      fixture that drifts from the schema fails loudly)
- [x] At least one recipe has a `list[UploadedFile]`-shaped field in its
      `inputSchema` (for Task 5/13's file-dropzone control) and at least one
      has an `enum` field (for the select control) and a constrained
      `int`/`number` field (for slider/number)
- [x] `RecipeSummary[]` fixture list is in the same sorted order
      `discover()` would produce (group order, then recipe order) — not
      alphabetical or insertion order by coincidence

**Verification:**
- [x] Tests pass: `cd frontend && bun run test fixtures/catalog` (9/9)
- [x] `bun run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/tests/fixtures/catalog/recipes.ts`
- `frontend/tests/fixtures/catalog/source-bundles.ts`
- `frontend/tests/fixtures/catalog/summaries.ts`
- `frontend/tests/fixtures/catalog/index.test.ts` (schema-validity guard)

**Estimated scope:** Medium: 3-5 files

---

## Phase 2: Parallel batch — 3 independent pure-logic tracks

### Task 3 [PARALLEL — Track A]: API client + react-query hooks

**Description:** `listRecipes()`, `getRecipe(slug)`, `getSource(slug)`
against `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:8000`), each
parsing the response through Task 1's zod schemas (never trusting raw
`fetch` JSON), plus `useRecipes()`/`useRecipe(slug)`/`useSource(slug)`
react-query wrappers.

**Acceptance criteria:**
- [x] Every function throws a clear, typed error (not a raw zod error) on a
      malformed response, a non-2xx status, or a network failure — callers
      (react-query) get a catchable error, not a crash
- [x] `getRecipe`/`getSource` on a 404 surface a distinguishable
      "not found" case (so `app/r/[slug]/page.tsx` can call Next's
      `notFound()`) — a single `RecipeApiError` class with a `status`
      property (`0` for network failure, else the real HTTP status);
      `error.status === 404` is the distinguishing check
- [x] react-query hooks use sane `staleTime` (this data doesn't change
      during a session) and a stable `queryKey` shape — `staleTime: Infinity`
      (static reference data, no mutation endpoint exists)
- [x] Fetch calls are mocked in tests (no real network) — asserting the right
      URL, method, and parse-then-throw behavior on bad data

**Verification:**
- [x] Tests pass: `cd frontend && bun run test api/recipes` (13/13) +
      `hooks/use-recipes` (9/9)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/lib/api/recipes.ts`
- `frontend/hooks/use-recipes.ts` (or split per hook — your call)
- `frontend/tests/api/recipes.test.ts`
- `frontend/tests/hooks/use-recipes.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

### Task 4 [PARALLEL — Track B]: `lib/catalog/nav-model.ts`

**Description:** `buildNavModel(recipes: RecipeSummary[]): NavModel` —
groups consecutive same-`group` entries (the list already arrives
pre-sorted by `(group.order, recipe.order)` per `discovery.py`), producing
exactly `app-shell`'s existing `NavModel`/`NavGroup`/`NavRecipe` shape
(`frontend/components/shell/sidebar-nav.tsx` — import the types, don't
redefine them).

**Acceptance criteria:**
- [x] Groups appear in the order their recipes first appear in the input
      list (no re-sorting — the backend already sorted it)
- [x] Each `NavGroup.title`/`.icon` comes from the first recipe's
      `groupTitle`/`groupIcon` seen for that group id
- [x] An unrecognized/missing icon **omits the `icon` key entirely** (not
      `icon: undefined`) — matches `NavGroup.icon`'s existing "absent
      renders no icon slot" contract; deviation from this task's literal
      "degrades to `icon: undefined`" wording, documented as a deliberate
      choice for `"icon" in group`-style consumers
- [x] `NavRecipe.progress` is never present on any output `NavRecipe` (key
      omitted, same reasoning as `icon`) — `catalog` never knows about
      progress; that's `workspace`'s prop to add later
- [x] An empty `recipes` array produces `{ groups: [] }`, not an error
- [x] Same-`group`-id recipes always merge into one `NavGroup` even if
      (hypothetically) non-contiguous in the input — a defensive `Map`-keyed
      implementation chosen over trusting the backend's sort contract, at no
      extra cost

**Verification:**
- [x] Tests pass: `cd frontend && bun run test catalog/nav-model` (8/8)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/lib/catalog/nav-model.ts`
- `frontend/tests/catalog/nav-model.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 5 [PARALLEL — Track C]: `lib/catalog/schema-form.ts`

**Description:** `compileForm(inputSchema): { fields, validator }` — the
module's most important piece test-wise. Maps a Pydantic-v2-generated JSON
Schema to an ordered `FieldDescriptor[]` plus a `zod` validator, exactly per
the spec's Code Style sample.

**Acceptance criteria:**
- [x] Table-driven tests built against **real** `model_json_schema()` output
      (13 distinct schemas generated via `uv run python` against the
      backend's actual `Params`/`UploadedFile`, never hand-typed) — string,
      constrained int, `Literal`/enum, bool, `Optional[str] = None`,
      `list[UploadedFile]` with accept/max_files, plus a plain `list[str]`
      added in a follow-up fix (see below)
- [x] Field order matches the schema's declared property order
- [x] The generated zod validator accepts every valid case and rejects
      every invalid case in the table
- [x] An empty/no-properties schema compiles to `{ fields: [], validator }`
      where the validator accepts `{}`

**Real findings that shaped the implementation** (see `schema-form.ts`'s
header comment for the full writeup): an `Optional[X]` field with NO
explicit `= None` default is still `anyOf`-wrapped but ALSO lands in the
schema's top-level `required` array (Pydantic v2 doesn't implicitly default
an `Optional`) — "unwrap `anyOf` → not required" has to win over the
`required` array, not just skip it as redundant; `json_schema_extra`'s
`accept`/`max_files` keys land flat and snake_case on the property, never
camelCased. A follow-up fix (done directly after this task's own report
flagged the gap) added `list[str]` → `"textarea"` (one item per line,
reusing an already-unreachable control rather than inventing a new one) —
this codebase's own `embeddings-101` fixture has exactly this field shape
and would otherwise have silently gotten a wrong `"text"` mapping.

**Verification:**
- [x] Tests pass: `cd frontend && bun run test catalog/schema-form` (30/30)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** None (pure JSON Schema → zod; no catalog-specific types needed)

**Files likely touched:**
- `frontend/lib/catalog/schema-form.ts`
- `frontend/tests/catalog/schema-form.test.ts`

**Estimated scope:** Medium: 3-5 files (the test file will be the largest file in the module)

---

## Checkpoint: Parallel batch 1 merged (after Tasks 3-5)
- [x] Each track's own tests pass in isolation
- [x] No file conflicts (disjoint file sets)
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged
      tree (34 files, 270/270 tests)
- [ ] **Human review before wiring real nav data into the shell**

---

## Phase 3: Provider wiring + real nav data (sequential)

### Task 6: react-query provider + real nav data in the shell

**Description:** Mount a `QueryClientProvider`; replace `app/layout.tsx`'s
`tests/fixtures/nav-tree.ts` import with a real `listRecipes()` call → Task
4's `buildNavModel()`.

**Acceptance criteria:**
- [ ] `app/providers.tsx` (or similar): a `"use client"` wrapper owning the
      `QueryClient` instance (one per request on the server, one per app
      load on the client — the standard Next.js App Router react-query
      pattern, not a module-level singleton that would leak across requests)
- [ ] `app/layout.tsx` becomes `async`, calls `listRecipes()` server-side,
      passes `buildNavModel(recipes)` to `<Shell nav={...}>`
- [ ] Backend unreachable (network error, non-2xx): falls back to
      `{ groups: [] }`, never throws into the root layout (an empty sidebar
      is a valid state; a crashed root layout is not)
- [ ] `tests/fixtures/nav-tree.ts` (the app-shell placeholder) is deleted —
      it was always meant to be temporary; anything in it still worth
      keeping as a *catalog* fixture belongs in Task 2's fixtures instead,
      not left behind as a second, now-orphaned nav fixture

**Verification:**
- [ ] `bun run typecheck && bun run lint`
- [ ] `bun run test` (existing `app-shell` shell/sidebar tests still pass,
      adjusted for the new data source where they touched the old fixture)
- [ ] Manual: `bun run dev` against a running backend (`uv run fastapi dev`
      pointed at `backend/tests/fixtures/recipes`) shows the real demo
      recipes in the sidebar; stopping the backend and reloading shows an
      empty-but-not-broken sidebar

**Dependencies:** Tasks 3, 4

**Files likely touched:**
- `frontend/app/providers.tsx`
- `frontend/app/layout.tsx`
- `frontend/tests/fixtures/nav-tree.ts` (deleted)
- Any `app-shell` test that imported the deleted fixture

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Shell now backed by real (or gracefully-empty) data
- [ ] `bun run dev` renders correctly both against a live backend and with none running
- [ ] **Human review before the index-page parallel batch**

---

## Phase 4: Parallel batch — 2 independent index-page tracks

### Task 7 [PARALLEL — Track A]: `intro-banner.tsx`

**Description:** The dismissible one-line intro banner on `/` (resolves
`app-shell`'s open question 2 — no separate marketing hero for v1).

**Acceptance criteria:**
- [ ] Dismissal persists via `useLocalStorageBoolean` (already built,
      `frontend/hooks/use-local-storage-boolean.ts`) — reuse it, don't fork
      a new localStorage flag hook
- [ ] Dismissed state survives a reload; a fresh browser (no stored value)
      shows the banner
- [ ] A close button is keyboard-operable and has an accessible label

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/intro-banner`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 0 only (no catalog-specific data needed)

**Files likely touched:**
- `frontend/components/catalog/intro-banner.tsx`
- `frontend/tests/catalog/intro-banner.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 8 [PARALLEL — Track B]: `recipe-filter.tsx`

**Description:** A controlled text filter over recipe titles/summaries
(substring match only, per the spec's leaning on Open Question 3).

**Acceptance criteria:**
- [ ] Fully controlled (`value`/`onChange`) — filtering logic itself lives
      in `catalog-index.tsx` (Task 9), this component is just the input
- [ ] Debounced or not is your call, but document the choice; either way
      `onChange` must not be lossy (every keystroke's final value is
      eventually delivered)
- [ ] Clearing the input (a visible "clear" affordance or just deleting the
      text) restores the full list

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/recipe-filter`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/components/catalog/recipe-filter.tsx`
- `frontend/tests/catalog/recipe-filter.test.tsx`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Parallel batch 2 merged (after Tasks 7-8)
- [ ] Each track's tests pass; no conflicts; `bun run typecheck`, `lint`, `test` clean

---

## Phase 5: Catalog index (sequential)

### Task 9: `catalog-index.tsx` + `app/page.tsx`

**Description:** The `/` catalog index: groups with their recipe lists (via
Task 4's nav model or a richer summary-based grouping — your call which of
the two feeds this page, document it), the intro banner, and the filter,
replacing `app-shell`'s placeholder `EmptyState` at `app/page.tsx`.

**Acceptance criteria:**
- [ ] Renders groups + recipes fetched via Task 3's `useRecipes()` hook
- [ ] Typing in the filter narrows both this page's list — an empty result
      shows the existing `EmptyState` primitive (`components/primitives/
      empty-state.tsx`), not a blank page
- [ ] Zero recipes (empty backend/fixtures) renders a sensible empty state,
      not an error
- [ ] Each recipe entry links to `/r/[slug]`
- [ ] Difficulty badges render per recipe, matching the sidebar's own badge
      styling (`sidebar-nav.tsx`) for visual consistency

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/catalog-index`
- [ ] `bun run typecheck && bun run lint`
- [ ] Manual: `bun run dev`, `/` shows the demo fixture recipes grouped and
      filterable

**Dependencies:** Tasks 4, 7, 8

**Files likely touched:**
- `frontend/components/catalog/catalog-index.tsx`
- `frontend/app/page.tsx`
- `frontend/tests/catalog/catalog-index.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Index complete
- [ ] `bun run test`, `typecheck`, `lint` clean
- [ ] **Human review before the recipe-page-regions parallel batch**

---

## Phase 6: Parallel batch — 3 independent recipe-page regions

*Each takes a fully-resolved `RecipeDetail` (Task 2's fixtures) as a prop —
never a slug, never fetches on its own. Wired together into the actual page
in Phase 8.*

### Task 10 [PARALLEL — Track A]: `description-panel.tsx`

**Description:** Collapsible region rendering `summary` + `use_cases` +
optional `readmeMarkdown` (GFM via `react-markdown` + `remark-gfm`).

**Acceptance criteria:**
- [ ] Uses `components/primitives/collapsible-section.tsx` (already built in
      `app-shell`) rather than a new collapsible implementation
- [ ] `readmeMarkdown: null` hides the README sub-section entirely (not an
      empty box)
- [ ] GFM features (tables, strikethrough, task lists) render correctly from
      a fixture README containing at least one of each
- [ ] Rendered markdown never executes raw HTML from the source (React
      Markdown's default safe behavior — don't override it)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/description-panel`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 1, 2

**Files likely touched:**
- `frontend/components/catalog/description-panel.tsx`
- `frontend/tests/catalog/description-panel.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 11 [PARALLEL — Track B]: `examples-panel.tsx`

**Description:** One card per `recipe.example` (`title, summary, expect,
params`) with a "Try this example" button.

**Acceptance criteria:**
- [ ] `expect` renders as prose text — no output is fetched, run, or stored
      (per Confirmed Decision 7)
- [ ] "Try this example" calls an `onTryExample(params: Record<string,
      unknown>) => void` prop with that example's `params` — it does not
      reach into the run form itself (composition happens in Task 14/15)
- [ ] Zero examples renders nothing (no empty "Examples" heading with
      nothing under it)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/examples-panel`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 1, 2

**Files likely touched:**
- `frontend/components/catalog/examples-panel.tsx`
- `frontend/tests/catalog/examples-panel.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 12 [PARALLEL — Track C]: `source-viewer.tsx`

**Description:** Multi-file tabs, `shiki`-highlighted, read-only, with a
copy button, over a `SourceBundle`.

**Acceptance criteria:**
- [ ] Every file in the bundle gets a tab; content byte-matches the
      fixture's `text` field exactly (verified by string equality against
      the rendered text content, not just "looks similar")
- [ ] Copy button copies the *raw* file text (not the highlighted HTML) to
      the clipboard — mock `navigator.clipboard.writeText` in the test
- [ ] Nothing in the viewer is editable (no `contentEditable`, no textarea
      standing in for a code block)
- [ ] Tabs are keyboard-operable (arrow keys or Tab, per the ARIA tabs
      pattern) — verified, not assumed
- [ ] `shiki`'s grammar loading works under `next build --webpack` (this
      project's forced build mode since `app-shell`'s Serwist integration) —
      confirmed via a real `bun run build`, not just `bun run dev`

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/source-viewer`
- [ ] `bun run typecheck && bun run lint`
- [ ] `bun run build` succeeds with `shiki` in the bundle

**Dependencies:** Tasks 1, 2

**Files likely touched:**
- `frontend/components/catalog/source-viewer.tsx`
- `frontend/tests/catalog/source-viewer.test.tsx`

**Estimated scope:** Medium: 3-5 files (shiki setup/config may need its own small file)

---

## Checkpoint: Parallel batch 3 merged (after Tasks 10-12)
- [ ] Each track's tests pass; no conflicts; `bun run typecheck`, `lint`, `test`, `build` clean
- [ ] **Human review before the run form**

---

## Phase 7: Run form

### Task 13 [PARALLEL — 2 tracks]: field components

**Description:** One component per `FieldDescriptor.control` value, each
wired to `react-hook-form`'s `register`/`Controller` as appropriate for its
input type.

**Track A:** `text-field.tsx`, `textarea-field.tsx`, `number-field.tsx`, `slider-field.tsx`
**Track B:** `select-field.tsx`, `switch-field.tsx`, `file-dropzone-field.tsx`

**Acceptance criteria:**
- [ ] Each renders its `label`/`help` text and a validation message when its
      own `react-hook-form` field error is present
- [ ] `select-field.tsx` renders `options` as the available choices
- [ ] `slider-field.tsx`/`number-field.tsx` respect `min`/`max`/`step`
- [ ] `file-dropzone-field.tsx`: native `<input type="file" multiple>` +
      manual drag-and-drop handlers (no new dependency, per the plan's
      architecture decision); respects `accept`/`maxFiles`; shows a
      validation message when `maxFiles` is exceeded
- [ ] All are otherwise presentational — no direct `localStorage`/network access

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/fields`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 5 (the `FieldDescriptor` type)

**Files likely touched:**
- `frontend/components/catalog/run-form/fields/*.tsx` (7 files, split across 2 tracks)
- `frontend/tests/catalog/fields/*.test.tsx`

**Estimated scope:** Medium: 3-5 files per track

---

### Task 14: `run-form.tsx`

**Description:** Composes Task 5's `compileForm`, Task 13's field
components, `settings`' `<RecipeOverrides recipe={recipe} />`, and the Run
button, exactly per the spec's Code Style sample.

**Acceptance criteria:**
- [ ] `RunForm({ recipe }: { recipe: RecipeDetail })` — matches the spec
      sample's signature exactly
- [ ] `useForm` is wired with `zodResolver(validator)` from Task 5's compiled
      validator
- [ ] `<RecipeOverrides recipe={recipe} />` is imported directly from
      `@/components/settings/recipe-overrides` and passed `recipe` verbatim
      (no adapter, no field remapping — this is the whole point of the
      structural-compatibility work done in `settings` and Task 1)
- [ ] Run button is disabled until the form is valid; `onSubmit` receives
      `{ params, recipeSlug }` — for now, hands it to an `onSubmit` prop
      (default: a `// TODO(execution)` no-op) rather than doing anything
      itself
- [ ] Exposes a way for a parent (`recipe-view.tsx`, Task 15) to pre-fill the
      form from an example's `params` (Task 11's "Try this example") — e.g.
      an imperative handle or a controlled `defaultValues`-reset prop; your
      call on the exact mechanism, document it

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test catalog/run-form`
- [ ] `bun run typecheck && bun run lint`
- [ ] Manual: the table-driven fixture recipes from Task 2 each render a
      working form (every control type appears at least once across them)

**Dependencies:** Tasks 5, 13, and `settings`' `RecipeOverrides` (already built)

**Files likely touched:**
- `frontend/components/catalog/run-form/run-form.tsx`
- `frontend/tests/catalog/run-form.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Run form complete
- [ ] Table-driven schema→form tests pass; `bun run test`, `typecheck`, `lint` clean
- [ ] **Human review before page-level composition**

---

## Phase 8: Recipe page composition + routing (sequential)

### Task 15: `app/r/[slug]/recipe-view.tsx` + `app/r/[slug]/page.tsx`

**Description:** The actual recipe page: fetches (client-side, via Task 3's
`useRecipe(slug)`) and composes Tasks 10-12 + 14 into the collapsible
regions, wires "Try this example" through to the run form, and stays
reusable as `<RecipeView slug={…} />` per `workspace`'s cross-module
contract (additive stub for `onStatusChange`/`cancelRun` — `execution`
doesn't exist yet, so both are documented no-ops for now, not fabricated
behavior).

**Acceptance criteria:**
- [ ] `page.tsx` is a thin server component: `export default function
      Page({ params }) { return <RecipeView slug={params.slug} />; }`
- [ ] `RecipeView` is `"use client"`, fetches via `useRecipe(slug)`, shows a
      loading state (reuse `components/primitives/skeleton.tsx`) and calls
      Next's `notFound()` on a confirmed 404 (not on every error — a
      network blip shouldn't render a 404 page)
- [ ] `forwardRef` + `useImperativeHandle` exposing `{ cancelRun(): void }`
      (a documented no-op until `execution` exists) and an optional
      `onStatusChange?: (status: RecipeRunStatus) => void` prop (unused for
      now), per the `workspace` amendment — added now so `workspace` doesn't
      need to modify this file later, per that amendment's own framing
- [ ] Clicking "Try this example" in `examples-panel.tsx` pre-fills and
      focuses the run form (success criterion 6's explicit requirement)
- [ ] Browsing is never blocked by run-related state — description, source,
      and examples are always viewable regardless of the run form's state

**Verification:**
- [ ] `bun run typecheck && bun run lint`
- [ ] `bun run test` (integration-level test composing the whole page against
      a Task 2 fixture)
- [ ] `bun run build` succeeds
- [ ] Manual: against a live backend serving `backend/tests/fixtures/recipes`
      (verify no stale process on port 8000/3000 first, per the app-shell
      Task 12 lesson), visit `/r/10-echo` (or whatever the demo slug is),
      expand every region, click "Try this example," confirm the form
      pre-fills

**Dependencies:** Tasks 10, 11, 12, 14

**Files likely touched:**
- `frontend/app/r/[slug]/page.tsx`
- `frontend/app/r/[slug]/recipe-view.tsx`
- `frontend/tests/catalog/recipe-view.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Recipe page complete
- [ ] `bun run build` succeeds; manual check against a live backend passes
- [ ] **Human review before E2E**

---

## Phase 9: E2E + sign-off (sequential)

### Task 16: Playwright E2E + axe pass

**Description:** `browse-catalog.spec.ts`, `recipe-page.spec.ts`,
`run-form-validation.spec.ts`, plus an axe scan of the recipe page, matching
`app-shell`'s established E2E conventions (`e2e/a11y.spec.ts` pattern, CDP
lessons from that module carried forward).

**Acceptance criteria:**
- [ ] `browse-catalog.spec.ts`: index → open a group → open a recipe →
      expand every region
- [ ] `recipe-page.spec.ts`: "Try this example" pre-fills the form
      (success criterion 6); offline (after one online visit) still shows
      the previously-fetched page (success criterion 4) — reuse
      `app-shell`'s offline-testing approach (`page.route(...).abort()`, not
      `context.setOffline()`, per that module's documented CDP limitation)
- [ ] `run-form-validation.spec.ts`: invalid input keeps Run disabled/shows
      errors; valid input enables Run
- [ ] axe scan: zero serious/critical on the recipe page; every collapsible
      region operable by keyboard

**Verification:**
- [ ] `cd frontend && bun run test:e2e` — all specs pass, stable across 3
      consecutive runs (per the app-shell precedent for flake-checking)

**Dependencies:** Task 15

**Files likely touched:**
- `frontend/e2e/browse-catalog.spec.ts`
- `frontend/e2e/recipe-page.spec.ts`
- `frontend/e2e/run-form-validation.spec.ts`

**Estimated scope:** Medium: 3-5 files

---

### Task 17: Success-criteria sign-off pass

**Description:** Map each of `SPEC-catalog.md`'s 7 numbered Success
Criteria to the test(s) that verify it, matching the `recipe-framework` /
`app-shell` / `settings` precedent.

**Acceptance criteria:**
- [ ] A sign-off table (appended to `tasks/plan-catalog.md`) lists all 7
      criteria against their verification, honestly noting any partial/
      carried-forward criterion (e.g. criterion 7's "workspace can render
      `<RecipeView>`" is structurally true by construction here but only
      really provable once `workspace` exists and does it)
- [ ] `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test`,
      `bun run test:e2e` all green

**Verification:**
- [ ] Full command suite above, run once at the end

**Dependencies:** Tasks 0-16

**Files likely touched:**
- `tasks/plan-catalog.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 17)
- [ ] All 7 success criteria individually verified
- [ ] Full suite + lint + typecheck + build + E2E green
- [ ] **Human review before `execution` begins consuming this module's run form / recipe page**
