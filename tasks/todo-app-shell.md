# Tasks: `app-shell`

Plan: [tasks/plan-app-shell.md](plan-app-shell.md). Spec: [docs/SPEC-app-shell.md](../docs/SPEC-app-shell.md).

---

## Phase 0: Scaffold (sequential)

### Task 0: [DONE] Next.js 15 + TypeScript + Tailwind v4 + bun scaffold

**Description:** Create `frontend/` — a Next.js 15 App Router project,
TypeScript, Tailwind v4, bun as the package manager/runtime, Vitest +
Testing Library configured for jsdom, Playwright installed for E2E.

**Acceptance criteria:**
- [x] `frontend/package.json` scripts: `dev`, `build`, `start`, `lint`,
      `typecheck`, `test`, `test:e2e` matching `SPEC-app-shell.md`'s Commands
- [x] `bun install` succeeds; `bun run dev` boots a default page;
      `bun run build` succeeds
- [x] Vitest configured with jsdom + `@testing-library/react`; a trivial
      smoke test passes via `bun run test`
- [x] Playwright config present (`bunx playwright install` attempted — note
      the result, don't block scaffold completion on it)

**Verification:**
- [x] `cd frontend && bun install && bun run build`
- [x] `cd frontend && bun run test` (smoke test)
- [x] `cd frontend && bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`
- `frontend/app/layout.tsx`, `app/page.tsx` (default, replaced in Task 10)
- `frontend/vitest.config.ts`, `frontend/playwright.config.ts`

**Estimated scope:** Large (generated scaffold, not hand-authored line-by-line)

---

### Task 1: [DONE] shadcn/ui init with `lib/cn.ts`

**Description:** Initialize shadcn/ui, configuring its utils alias so the
generated helper lands at `lib/cn.ts` (per the spec) rather than the default
`lib/utils.ts`. Generate the first couple of primitives the shell will need
(`button`, `tooltip`) as a smoke test of the pipeline.

**Acceptance criteria:**
- [x] `components.json` present with the `cn` alias pointed at `lib/cn.ts`
- [x] `lib/cn.ts` exports `cn()` (clsx + tailwind-merge)
- [x] `bunx shadcn@latest add button tooltip` succeeds and lands components
      under `components/ui/`

**Verification:**
- [x] `bun run typecheck` after generation
- [x] Manual check: import `cn` from `@/lib/cn` in a scratch component, confirm
      it resolves

**Dependencies:** Task 0

**Files likely touched:**
- `frontend/components.json`
- `frontend/lib/cn.ts`
- `frontend/components/ui/button.tsx`, `tooltip.tsx`

**Estimated scope:** Small: 1-2 files (plus generated shadcn output)

---

### Task 2: [DONE] Design tokens

**Description:** The token system from `SPEC-app-shell.md`'s Code Style
section — CSS custom properties in `globals.css` under `@theme`, a dark
override block, and a typed `lib/tokens.ts` for referencing them from TS where
needed (e.g. computing a class conditionally).

**Acceptance criteria — revised during implementation** (shadcn init's
generated tokens took precedence over the originally-drafted `--color-*`
names; see `SPEC-app-shell.md`'s Code Style section, amended in the same
commit):
- [x] shadcn's generated `--background`/`--foreground`/`--card`/`--border`/
      `--muted`/`--sidebar*`/`--radius` etc. kept as-is (not reinvented)
- [x] Skillet's warm accent layered onto `--primary`/`--primary-foreground`/
      `--ring`/`--sidebar-primary`/`--sidebar-ring` (deliberately not
      shadcn's own `--accent`, a naming collision — see the spec)
- [x] `--radius` set to `0.5rem` (spec: 6-8px)
- [x] Skillet-only additions with no shadcn equivalent: `--sidebar-w`,
      `--space-gutter`, `--content-max`, `--ease-out`, `--dur-fast`, `--dur`
- [x] Dark mode stays **class-based** (`.dark` on `<html>`), matching
      shadcn's generated CSS and every future `shadcn add` component —
      not the originally-planned `data-theme` attribute
- [x] `lib/tokens.ts` exports a typed object of the layout/motion token names
      that aren't wired into a Tailwind utility class

**Verification:**
- [x] `bun run build` succeeds with the new CSS
- [x] Manual check: toggle the `.dark` class on `<html>` in devtools, confirm
      the accent and neutrals flip

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/app/globals.css`
- `frontend/lib/tokens.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Foundation (after Tasks 0–2)
- [x] `bun run dev` boots, `bun run build` succeeds
- [x] `bun run typecheck` and `bun run lint` clean
- [ ] **Human review before the parallel batch**

---

## Phase 1: Parallel batch — 5 independent tracks

*Dispatched to subagents concurrently. Each touches a disjoint file set and
depends only on Tasks 0–2. Write tests first (TDD).*

### Task 3 [DONE][PARALLEL — Track A]: Presentational primitives

**Description:** Four small, purely presentational components: a collapsible
section (used by the sidebar/recipe page later), an empty state, a loading
skeleton, and a toast host.

**Acceptance criteria:**
- [x] `CollapsibleSection`: open/close toggle, correct ARIA
      (`aria-expanded`, `aria-controls`), keyboard-operable (Enter/Space)
- [x] `EmptyState`: renders an icon/message/optional action slot
- [x] `Skeleton`: renders a pulsing placeholder block, width/height as props
- [x] `Toaster`: hosts toast notifications (thin wrapper is fine — this is
      infrastructure other modules will call into, not a full toast system)
- [x] Each has a Vitest + Testing Library test for its stated behavior

**Verification:**
- [x] Tests pass: `cd frontend && bun run test primitives`
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/components/primitives/{collapsible-section,empty-state,skeleton,toaster}.tsx`
- `frontend/tests/primitives/*.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

### Task 4 [DONE][PARALLEL — Track B]: Theming

**Description:** `next-themes` wiring (provider + hook usage), the no-flash
inline script pattern, and `theme-toggle.tsx` — light/dark/system, default
light, persisted to `localStorage`.

**Acceptance criteria:**
- [x] A `ThemeProvider` wrapper component using `next-themes` with
      `attribute="class"` (matches shadcn's generated `.dark`-class CSS —
      **not** `data-theme`, a correction made in Tasks 1-2, see
      `SPEC-app-shell.md`) is ready to mount in `app/layout.tsx` (actual
      mounting is Task 10)
- [x] An inline script (or `next-themes`' own no-flash mechanism) sets the
      `.dark` class before first paint — a test asserts the script/mechanism
      is present in the rendered HTML
- [x] `theme-toggle.tsx`: cycles light → dark → system (or a 2-state toggle +
      "use system" — pick one, document it in the component), updates the
      `.dark` class on `<html>`, persists the choice
- [x] Default theme (no stored preference) is **light**, not system —
      per the spec's Confirmed Decision 7

**Verification:**
- [x] Tests pass: `cd frontend && bun run test theme`
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/components/shell/theme-toggle.tsx`
- `frontend/components/shell/theme-provider.tsx` (or equivalent)
- `frontend/tests/shell/theme-toggle.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 5 [DONE][PARALLEL — Track C]: `sidebar-nav.tsx` + nav fixture

**Description:** The data-free nav tree renderer — accepts a nav model
(groups + recipes, with an optional icon and an optional progress badge slot
per the `workspace` cross-module contract already agreed in `catalog`'s spec)
and renders it. No data fetching, no business logic.

**Acceptance criteria:**
- [x] `sidebar-nav.tsx` accepts a typed `NavModel` prop (groups → recipes,
      each recipe with slug/title/difficulty; group with optional `icon`;
      recipe with an optional `progress` badge) and renders it faithfully
- [x] `tests/fixtures/nav-tree.ts` exports a realistic sample `NavModel` (2–3
      groups, 2–4 recipes each) for use here and by Task 10/11
- [x] Renders difficulty as a visual badge; renders nothing extra when
      `icon`/`progress` are absent (matches `catalog`'s "absent data renders
      no badge" contract)
- [x] Keyboard-navigable (each recipe link is a real focusable element)

**Verification:**
- [x] Tests pass: `cd frontend && bun run test sidebar-nav`
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/components/shell/sidebar-nav.tsx`
- `frontend/tests/fixtures/nav-tree.ts`
- `frontend/tests/shell/sidebar-nav.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 6 [DONE][PARALLEL — Track D]: `topbar.tsx` + `mobile-drawer.tsx`

**Description:** The top bar (a slot on the left for `workspace`'s tab strip,
fixed actions on the right) and the mobile drawer that the sidebar becomes
under `md`.

**Acceptance criteria:**
- [x] `topbar.tsx` renders `children` (the slot) on the left; a fixed-actions
      region on the right (can be empty/placeholder for now — no other module
      exists yet to fill it)
- [x] `mobile-drawer.tsx` opens/closes (button + overlay), traps focus while
      open, closes on Escape and on overlay click
- [x] Both keyboard-operable with visible focus rings

**Verification:**
- [x] Tests pass: `cd frontend && bun run test topbar mobile-drawer`
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/components/shell/topbar.tsx`
- `frontend/components/shell/mobile-drawer.tsx`
- `frontend/tests/shell/{topbar,mobile-drawer}.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 7 [DONE][PARALLEL — Track E]: PWA (manifest, service worker, Serwist)

**Description:** `app/manifest.ts` (Next metadata route), `sw.ts` (Serwist
service worker source) with an offline-browse caching strategy, the Serwist
plugin wired into `next.config.ts`, and a minimal icon set.

**Acceptance criteria:**
- [x] `app/manifest.ts` produces a valid Web App Manifest (name, icons,
      `display: "standalone"`, theme/background colors from the tokens)
- [x] `sw.ts` precaches the app shell and defines a runtime caching strategy
      for same-origin GET requests (stale-while-revalidate or similar) —
      exact catalog/recipe-source caching integration comes later when
      `catalog` exists; this task lays the Serwist mechanism, not the final
      cache rules
- [x] `next.config.ts` wires `@serwist/next`'s plugin
- [x] `bun run build` produces a service worker output file

**Verification:**
- [x] `bun run build` succeeds and emits a service worker
- [x] Manual check: inspect the build output for the generated `sw.js`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/app/manifest.ts`
- `frontend/sw.ts`
- `frontend/next.config.ts`
- `frontend/public/icons/*` (placeholder icon set)

**Estimated scope:** Small: 1-2 files (plus icon assets)

---

## Checkpoint: Parallel batch merged (after Tasks 3–7)
- [x] Each track's own tests pass in isolation
- [x] No file conflicts between tracks (disjoint file sets — confirmed via `git status` before staging)
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree (44/44 tests, `bun run build` also verified green)
- [ ] **Human review before composition**

---

## Phase 2: Composition (sequential)

### Task 8: `sidebar.tsx`

**Description:** Composes `sidebar-nav.tsx` (Task 5) + `theme-toggle.tsx`
(Task 4) + `mobile-drawer.tsx` (Task 6) into the full sidebar: collapse-to-icons
state (persisted), a subtle background tint, and the footer housing the theme
toggle.

**Acceptance criteria:**
- [ ] Collapse toggle switches between full nav and icon-only, persists the
      choice across reload (localStorage — a simple boolean is fine, no
      Zod/versioning needed for this alone)
- [ ] Footer contains the theme toggle
- [ ] Under `md`, renders via `mobile-drawer.tsx` instead of the persistent rail

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test sidebar.test`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 4, 5, 6

**Files likely touched:**
- `frontend/components/shell/sidebar.tsx`
- `frontend/tests/shell/sidebar.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

### Task 9: `shell.tsx`

**Description:** The grid composition from the spec's code sample — sidebar
on the left, topbar + scrollable main on the right, content max-width applied
in main.

**Acceptance criteria:**
- [ ] Matches the spec's `Shell({ nav, tabs, children })` signature
- [ ] Renders `nav` into `Sidebar`, `tabs` into `Topbar`, `children` into the
      max-width-constrained main slot
- [ ] Grid collapses to a single column under `md` (sidebar becomes the drawer)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test shell.test`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 8

**Files likely touched:**
- `frontend/components/shell/shell.tsx`
- `frontend/tests/shell/shell.test.tsx`

**Estimated scope:** Small: 1-2 files

---

## Phase 3: Wiring (sequential)

### Task 10: `app/layout.tsx` + `app/page.tsx` against fixtures

**Description:** Wire everything together: `ThemeProvider` + no-flash script
in the root layout, `Shell` mounted with the `nav-tree.ts` fixture and a
placeholder main-content page (since `catalog` doesn't exist yet) in `page.tsx`.

**Acceptance criteria:**
- [ ] The app renders end-to-end with `bun run dev` — sidebar, topbar,
      placeholder content, theme toggle all visible and interactive
- [ ] No backend call anywhere in this path (success criterion 6)
- [ ] Theme choice persists across a manual reload with no visible flash

**Verification:**
- [ ] Manual check: `bun run dev`, click through sidebar collapse, theme
      toggle, mobile drawer at a narrow viewport
- [ ] `bun run build && bun run start` also works (production build path)

**Dependencies:** Task 9, Task 7 (PWA manifest linked from layout `<head>`)

**Files likely touched:**
- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 11: Responsive + keyboard/focus-ring pass

**Description:** Systematic check (and any needed fixes) against the spec's
explicit breakpoints and keyboard/focus requirements, since Phase 1's tracks
were built somewhat in isolation from each other.

**Acceptance criteria:**
- [ ] Shell renders correctly at 375 / 768 / 1280 px (manual or
      Testing-Library viewport-mocked snapshot)
- [ ] Sidebar is the persistent rail ≥ `md`, the drawer < `md`
- [ ] Full keyboard traversal sidebar → topbar → main reaches every
      interactive element with a visible focus ring

**Verification:**
- [ ] Manual check across the three breakpoints (resize devtools or
      Playwright viewport, if Task 12 is done first — order is flexible)
- [ ] Manual keyboard-only pass (Tab/Shift+Tab/Enter/Escape)

**Dependencies:** Task 10

**Files likely touched:** Whatever the pass reveals — expected to be small
fixes in existing Phase 1/2 files, not new ones.

**Estimated scope:** Small: 1-2 files

---

## Phase 4: E2E & sign-off

### Task 12: Playwright E2E — install, offline, a11y

**Description:** The three E2E specs the spec calls for. Playwright's
chromium binary is confirmed installed in this environment (Task 0), so
these should actually run rather than just be written and hoped for.

**Acceptance criteria:**
- [ ] `pwa-install.spec.ts`: manifest valid, service worker registers,
      `beforeinstallprompt` fires (or documents why it can't be asserted in a
      headless/sandboxed run)
- [ ] `offline-browse.spec.ts`: load online once, go offline, navigate cached
      nav + a previously-viewed page, confirm it works; a run-form area (once
      it exists) would show an offline state — for `app-shell` alone, assert
      the shell itself degrades gracefully offline
- [ ] `a11y.spec.ts`: axe scan on the shell, zero serious/critical violations

**Verification:**
- [ ] `bun run test:e2e` — or an explicit note on what couldn't run and why

**Dependencies:** Task 11

**Files likely touched:**
- `frontend/e2e/{pwa-install,offline-browse,a11y}.spec.ts`

**Estimated scope:** Medium: 3-5 files

---

### Task 13: Success-criteria sign-off pass

**Description:** Map each of `SPEC-app-shell.md`'s 7 numbered Success
Criteria to the test(s) or manual verification that covers it, honestly
noting any that are only manually verified (e.g. if Playwright couldn't run).

**Acceptance criteria:**
- [ ] A sign-off table (in `tasks/plan-app-shell.md`, matching
      `recipe-framework`'s precedent) lists all 7 criteria against their
      verification
- [ ] `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test` all
      green

**Verification:**
- [ ] Full command suite above, run once at the end

**Dependencies:** Tasks 0–12

**Files likely touched:**
- `tasks/plan-app-shell.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 13)
- [ ] All 7 success criteria individually verified (or honestly flagged as
      manual-only where the sandbox couldn't run Playwright)
- [ ] Full suite + lint + typecheck + build green
- [ ] **Human review before `catalog`/`settings` begin consuming this module**
