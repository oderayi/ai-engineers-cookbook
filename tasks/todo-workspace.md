# Tasks: `workspace`

Plan: [tasks/plan-workspace.md](plan-workspace.md). Spec: [docs/SPEC-workspace.md](../docs/SPEC-workspace.md).

---

## Phase 1: The `catalog`/`execution` amendment (sequential)

### Task 1: Wire `<RunOutput>`'s status upward

**Description:** `<RecipeView>`'s `onStatusChange` prop exists and is typed but is never invoked (documented as out-of-scope, left for `workspace`, in `execution`'s own Task 14). Make it real.

**Acceptance criteria:**
- [ ] `RunOutput` (`frontend/components/execution/run-output.tsx`) gains an optional `onStatusChange?: (status: RunStatus) => void` prop; a `useEffect` calls it whenever `useRecipeRun`'s `status` changes (including on mount, with the initial `"idle"` — document whether the initial call happens or only on subsequent transitions, matching whichever the spec's own "idle → running → done | error" phrasing implies, and write a test that pins down the choice either way)
- [ ] `recipe-view.tsx` forwards its own existing `onStatusChange` prop straight through to `<RunOutput onStatusChange={onStatusChange} />` — no transformation, no adapter
- [ ] `execution`'s full test suite (backend unaffected; frontend 550 tests) and `catalog`'s full test suite both still pass, unmodified in behavior (assertion counts may grow, not shrink or change meaning)
- [ ] New tests: `RunOutput`'s `onStatusChange` fires on each real transition (idle→running→done, idle→running→error, running→idle on cancel) using the same mocked-`postRun` pattern as `use-recipe-run.test.tsx`; `recipe-view.tsx`'s existing "accepts an unused onStatusChange prop" test is renamed/rewritten to prove it's now actually used

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test execution/run-output catalog/recipe-view`
- [ ] `bun run typecheck && bun run lint`
- [ ] Full suite: `bun run test` — no regressions

**Dependencies:** None (both consumed modules are already complete)

**Files likely touched:**
- `frontend/components/execution/run-output.tsx`
- `frontend/app/r/[slug]/recipe-view.tsx`
- `frontend/tests/execution/run-output.test.tsx`
- `frontend/tests/catalog/recipe-view.test.tsx`

**Estimated scope:** Small: 3-4 files

---

## Checkpoint: Amendment complete
- [ ] Full frontend suite green; typecheck/lint clean
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 2

---

## Phase 2: Persisted state — parallel batch

### Task 2 [PARALLEL — Track A]: `lib/workspace/{schema,defaults,migrations}.ts`

**Description:** The versioned, Zod-validated `localStorage` blob and its migration path, mirroring `settings`' own `resolve.ts`/`storage.ts`/`migrations.ts` pattern.

**Acceptance criteria:**
- [ ] `workspaceV1Schema` matches the spec's own Code Style sample exactly: `version`, `tabs: {id, slug}[]`, `activeTabId: string | null`, `progress: Record<slug, {viewedAt, completedAt}>`
- [ ] `emptyWorkspace(): WorkspaceV1` — the all-defaults value
- [ ] `migrate(raw: unknown): WorkspaceV1` — an unversioned/legacy blob upgrades to `CURRENT_VERSION`; a blob newer than `CURRENT_VERSION` is discarded for `emptyWorkspace()`; malformed JSON/wrong shape is discarded for defaults (never throws into the caller); unknown extra top-level keys are stripped, not silently persisted forward (a real test proves this, not just schema `.strict()`/passthrough assumptions)
- [ ] `STORAGE_KEY = "skillet.workspace"`

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test workspace/migrations`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/workspace/schema.ts`
- `frontend/lib/workspace/defaults.ts`
- `frontend/lib/workspace/migrations.ts`
- `frontend/tests/workspace/migrations.test.ts`

**Estimated scope:** Small: 2-3 files

---

### Task 3 [PARALLEL — Track B]: `lib/workspace/tabs-reducer.ts`

**Description:** The pure in-memory tabs reducer, per the spec's own Code Style sample.

**Acceptance criteria:**
- [ ] `OPEN_TAB` appends a new tab with a fresh `crypto.randomUUID()` id (even for a slug already open — duplicate tabs allowed) and activates it
- [ ] `CLOSE_TAB` on the active tab activates its right neighbor, falling back to its left neighbor, falling back to `null` when it was the last tab; on an inactive tab, `activeTabId` is unchanged
- [ ] `ACTIVATE_TAB` on an unknown id is a no-op (returns the same state reference, or an equal one — document which)
- [ ] `RESTORE` replaces state wholesale
- [ ] ≥ 95% line coverage on this file (the spec's own bar — load-bearing logic)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test workspace/tabs-reducer`
- [ ] `bun run test:coverage` — `tabs-reducer.ts` ≥ 95%
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/workspace/tabs-reducer.ts`
- `frontend/tests/workspace/tabs-reducer.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 4 [PARALLEL — Track C]: `lib/workspace/progress.ts`

**Description:** Pure functions over the progress ledger slice, per the spec's own Code Style sample.

**Acceptance criteria:**
- [ ] `markViewed(progress, slug, now?)` — sets `viewedAt` once; idempotent on repeat calls (never overwrites an existing non-null `viewedAt`)
- [ ] `markCompleted(progress, slug, now?)` — sets/overwrites `completedAt` on every call; never disturbs `viewedAt` (sets it only if it was previously null, matching the sample's `existing?.viewedAt ?? now`)
- [ ] `toNavBadges(progress) -> Record<slug, {viewed: boolean; completed: boolean}>` — the exact shape `catalog`'s (amended) `nav-tree.tsx` prop expects, cross-checked against that file's real prop type once Task 1's amendment (or a stub matching it) exists
- [ ] ≥ 95% line coverage on this file

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test workspace/progress`
- [ ] `bun run test:coverage` — `progress.ts` ≥ 95%
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/workspace/progress.ts`
- `frontend/tests/workspace/progress.test.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Persisted state (after Tasks 2-4)
- [ ] Each track's tests pass; no conflicts; coverage bars met
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 3

---

## Phase 3: Hooks (sequential)

### Task 5: `hooks/use-tabs.ts`

**Description:** Composes `tabs-reducer.ts` with `settings`' `useLocalStorage`, persisting only `{tabs, activeTabId}`.

**Acceptance criteria:**
- [ ] `useTabs(): [TabsState, { openTab, closeTab, activateTab }]` (or equivalent — document your exact returned action shape)
- [ ] Dispatches `RESTORE` exactly once after the initial `localStorage` read resolves (mirrors `useLocalStorage`'s own SSR-safe hydration pattern — read that hook's real implementation before assuming how to hook into it)
- [ ] Every subsequent `{tabs, activeTabId}` change is persisted — never run state, form values, or anything else
- [ ] Imports `settings`' real `hooks/use-local-storage.ts` — does not fork a second copy

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test hooks/use-tabs`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 2, 3

**Files likely touched:**
- `frontend/hooks/use-tabs.ts`
- `frontend/tests/hooks/use-tabs.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 6: `hooks/use-progress.ts`

**Description:** Composes `progress.ts` with `useLocalStorage`, exposing the progress ledger and its mutators.

**Acceptance criteria:**
- [ ] `useProgress(): [ProgressMap, { markViewed(slug), markCompleted(slug) }]`
- [ ] Persists `progress` into the SAME `skillet.workspace` blob `use-tabs.ts` writes (one blob, two hooks reading/writing disjoint slices of it — document how write races between the two hooks are avoided, e.g. both going through one shared `useLocalStorage` instance/key with a functional updater, not two independent `localStorage.setItem` calls that could clobber each other)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test hooks/use-progress`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 2, 4, 5 (the shared-blob write-race concern needs `use-tabs.ts` to exist first to actually resolve, not just be designed against in the abstract)

**Files likely touched:**
- `frontend/hooks/use-progress.ts`
- `frontend/tests/hooks/use-progress.test.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Hooks complete (after Tasks 5-6)
- [ ] Both hooks' tests pass; typecheck/lint clean
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 4

---

## Phase 4: Components — parallel batch

### Task 7 [PARALLEL — Track A]: `components/workspace/{tab-strip,tab-strip-item}.tsx`

**Description:** The tab strip: list of tabs, "+" button, per-tab status dot, close button, active-tab highlight, title truncation.

**Acceptance criteria:**
- [ ] `TabStripItem`: title (truncated for a long recipe title — real CSS truncation, verified via a test asserting the truncation class/style is applied, not just that long text doesn't crash), a status dot (`idle`/`running`/`done`/`error`, 4 visually distinct states — color/icon per `lucide-react`'s `Loader2`/`Check`/`CircleAlert` per the spec's own tech-stack note), a close (`X`) button, active-tab styling
- [ ] `TabStrip`: renders one `TabStripItem` per open tab (from `useTabs`) plus a `+` control; clicking a tab activates it; clicking `X` closes it (calling the close path that also cancels the run — wired in `tab-panels.tsx`, Task 8, so `TabStrip` itself only needs to expose the close intent via a callback prop, not own the cancellation logic)
- [ ] A background tab's status dot updates even while inactive (a real test: mock two tabs, change tab B's status while tab A is active, assert B's dot reflects the change)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test workspace/tab-strip`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 5 (uses `useTabs`)

**Files likely touched:**
- `frontend/components/workspace/tab-strip.tsx`
- `frontend/components/workspace/tab-strip-item.tsx`
- `frontend/tests/workspace/tab-strip.test.tsx`

**Estimated scope:** Medium: 3-4 files

---

### Task 8 [PARALLEL — Track B]: `components/workspace/{tab-panels,empty-workspace}.tsx`

**Description:** The tab-panel host (mounts every open tab's `<RecipeView>`, always, toggling `hidden`) and the zero-tabs empty state.

**Acceptance criteria:**
- [ ] `TabPanels`: renders one `<RecipeView ref={...} slug={tab.slug} onStatusChange={...} />` per open tab from `useTabs`, ALL mounted at once, `hidden={tab.id !== activeTabId}` (never a conditional `{active && <RecipeView/>}`) — a test explicitly proves the inactive tab's `<RecipeView>` is still in the DOM (present, just hidden), not absent
- [ ] Holds a `Map<tabId, RecipeViewHandle>` ref registry; closing a tab calls that tab's `cancelRun()` (via the map) exactly once, THEN removes it from tab state — a `running`-status tab's close calls `cancelRun()`; an `idle`/`done`/`error` tab's close does not (assert via a spy, not just "didn't crash")
- [ ] `onStatusChange` per tab also feeds `useProgress`'s `markCompleted`/nothing-on-error logic (per the spec: `result` → `markCompleted`, `error` → no mark) — wire this here, in the one place that already receives per-tab status transitions
- [ ] `EmptyWorkspace`: rendered when zero tabs are open, with a link into the catalog index (per Open Question 3's resolution)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test workspace/tab-panels`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 5, 6 (uses `useTabs` + `useProgress`), Task 1 (needs the real, firing `onStatusChange`)

**Files likely touched:**
- `frontend/components/workspace/tab-panels.tsx`
- `frontend/components/workspace/empty-workspace.tsx`
- `frontend/tests/workspace/tab-panels.test.tsx`

**Estimated scope:** Medium: 3-4 files

---

## Checkpoint: Components complete (after Tasks 7-8)
- [ ] Each track's tests pass; no conflicts; `bun run typecheck && bun run lint`
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 5

---

## Phase 5: Cross-module composition (sequential)

### Task 9: Wire into `app/layout.tsx` + `nav-tree.tsx`'s `progress` prop

**Description:** The real composition point — mount `<TabStrip>`/`<TabPanels>` into `app-shell`'s slots, and thread `useProgress`'s `toNavBadges()` output into the existing `nav-tree(...)` call.

**Acceptance criteria:**
- [ ] `app/layout.tsx`: `<TabStrip>` fills the topbar slot, `<TabPanels>` (or `<EmptyWorkspace>` when zero tabs) fills the main slot — additive edit only, `components/shell/` itself untouched
- [ ] `nav-tree.tsx` (catalog) gains an optional `progress?: Record<slug, {viewed, completed}>` prop, rendering a small badge/checkmark per recipe node when an entry is present; absent data renders no badge (today's behavior, unchanged) — this IS the second half of the approved cross-module amendment, done here since `workspace` is the module that actually computes the data
- [ ] `catalog`'s own existing nav-tree tests still pass unmodified; new tests cover the badge rendering itself

**Verification:**
- [ ] `bun run typecheck && bun run lint`
- [ ] `bun run test` — full suite green
- [ ] `bun run build` succeeds

**Dependencies:** Tasks 7, 8

**Files likely touched:**
- `frontend/app/layout.tsx`
- `frontend/components/catalog/nav-tree.tsx`
- `frontend/tests/catalog/nav-tree.test.ts` (extended)

**Estimated scope:** Medium: 3-4 files

---

### Task 10: Playwright E2E

**Description:** The two scenarios only a real browser convincingly proves.

**Acceptance criteria:**
- [ ] `tab-lifecycle.spec.ts`: open two tabs (including a duplicate recipe), switch between them, close one, reload the page — asserts the same tabs/order/active tab are restored, and no tab attempts to resume a run
- [ ] `background-run.spec.ts`: start a real run in tab A (against `execution`'s real E2E backend, reusing the existing dual-webServer infra), switch to tab B, wait, switch back to A — assert A's output continued streaming/reached its terminal state while inactive, and that A's tab dot reflected the transition while B was active

**Verification:**
- [ ] `cd frontend && bun run test:e2e` — both new specs pass, stable across 3 consecutive runs
- [ ] Full E2E suite green (no regressions)

**Dependencies:** Task 9

**Files likely touched:**
- `frontend/e2e/workspace/tab-lifecycle.spec.ts`
- `frontend/e2e/workspace/background-run.spec.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Integration complete (after Tasks 9-10)
- [ ] `bun run build` succeeds; E2E stable across 3 consecutive runs
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 6

---

## Phase 6: Sign-off

### Task 11: Success-criteria sign-off pass

**Description:** Map each of `SPEC-workspace.md`'s 8 numbered Success Criteria to the test(s) that verify it, matching the precedent from every prior module.

**Acceptance criteria:**
- [ ] A sign-off table (appended to `tasks/plan-workspace.md`) lists all 8 criteria against their verification, honestly noting any partial/carried-forward criterion
- [ ] `cd frontend && bun run {build,lint,typecheck,test,test:e2e}` all green

**Verification:**
- [ ] Full command suite above, run once at the end

**Dependencies:** Tasks 1-10

**Files likely touched:**
- `tasks/plan-workspace.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 11)
- [ ] All 8 success criteria individually verified
- [ ] Full suite + lint + typecheck + build + E2E green
- [ ] Per the standing "just proceed" instruction, `workspace` is complete; `distribution` may now begin consuming it (alongside `trial-limits`), per the approved build order
