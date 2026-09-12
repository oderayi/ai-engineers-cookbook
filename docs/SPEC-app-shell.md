# Spec: app-shell

Module id: `app-shell` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-09**.

## Objective

The application frame and its craft: layout, visual language, theming, motion,
and PWA installability. Every other frontend module renders *inside* this shell.

- **What:** a Next.js App Router shell — persistent left sidebar, a top bar, and a
  main content slot — with a documented design-token system, light/dark theming,
  restrained motion, and PWA install + offline-browse support.
- **Why:** reach depends on retention, and retention depends on the app feeling
  premium and uncluttered rather than AI-generated. "Come back to learn more" is
  a design goal, not just a content one.
- **User:** the learner. Also every downstream frontend module, which consumes
  the shell's slots and tokens.
- **Success:** the shell can be built and reviewed against fixture data with no
  backend; it installs as a PWA; it passes a Lighthouse PWA + a11y bar; theme
  switches with no flash.

## Scope

**In:** root layout; sidebar (groups + recipes nav, collapse-to-icons, footer
with theme toggle); top bar (a slot workspace fills with the tab strip); main
content slot; the design-token system (color, spacing, radius, type, motion);
`next-themes` setup; global styles / Tailwind config / shadcn base; the PWA
manifest, icons, and Serwist service worker with an offline-browse strategy;
shared primitives that are purely presentational (collapsible section, empty
state, loading skeleton, toast host).

**Out:** the tab strip contents and multi-tab logic (`workspace`); the recipe
list *data* and grouping/ordering logic (`catalog` — the shell renders whatever
nav tree it's handed); settings screens (`settings`); anything that calls the
backend.

## Confirmed decisions

1. Next.js **16** App Router, React **19**, TypeScript, Tailwind **v4**,
   shadcn/ui. (Originally specified as Next 15; bumped to the current stable
   major during Task 0 rather than force-pinning an outdated one — see
   `tasks/plan-app-shell.md`'s note on this. App Router layout/page
   fundamentals are unchanged; Turbopack is now the default bundler for both
   `dev` and `build`, which matters for Task 7's Serwist integration.)
2. **Desktop-first**, responsive down to mobile (PWA installs on phones; sidebar
   becomes a drawer under `md`).
3. The shell owns the frame and exposes **slots**; `workspace` fills the top-bar
   slot with the tab strip and the main slot with tab content.
4. Built and reviewed against **fixture data** before any backend exists.
5. **Design direction:** persistent inset left sidebar with a subtle background
   tint, collapsible to icons; generous whitespace; one muted neutral palette +
   a single warm accent; small radii (6–8px); hairline borders, not shadows;
   system sans font stack; a content max-width so prose doesn't sprawl; minimal
   chrome.
6. **Accent:** a single warm burnt-orange (`~#C2410C` family), used only on the
   active nav item, primary buttons, and the focus ring. Everything else neutral.
7. **Theming:** light + dark + system via `next-themes`; toggle in the sidebar
   footer; persisted to `localStorage`; no flash on load. **Default: light
   (white).** **Dark-mode trigger: the `.dark` class on `<html>`
   (`next-themes`' `attribute="class"`), not a `data-theme` attribute** —
   corrected during Task 1/2 (see Code Style) once `shadcn init`'s generated
   `globals.css` turned out to assume `.dark`; every future
   `bunx shadcn add` component relies on that same convention, so fighting it
   would mean keeping two theming systems in sync forever.
8. **PWA:** `@serwist/next`. Offline = browse-only: app shell + catalog metadata
   + already-viewed recipe source are cached and readable offline; running a
   recipe shows an offline state.
9. **Motion:** `tailwindcss-animate` + CSS only for v1 (sidebar collapse,
   collapsible sections, list hover, tab in/out, page fade). No JS animation
   library unless a later interaction demands physics.

## Tech Stack

- Next.js 15 (App Router), React 19, TypeScript 5.x
- Tailwind CSS v4, shadcn/ui, `tailwindcss-animate`
- `next-themes`
- `@serwist/next` + `serwist`
- `lucide-react` (icons)
- Vitest + Testing Library; Playwright for the install/offline/a11y checks

## Commands

```
Install:     bun install
Dev:         bun dev
Build:       bun run build
Start:       bun start
Lint:        bun run lint
Typecheck:   bun run typecheck
Test:        bun run test        # Vitest, invoked via bun
E2E:         bun run test:e2e
Add shadcn:  bunx shadcn@latest add <component>
```

Package manager and runtime: **bun**. Vitest (not `bun test`) is the unit
runner for jsdom + Testing Library compatibility — see Open Questions.

## Project Structure

```
frontend/
  package.json
  next.config.ts             # Serwist plugin wired here
  tailwind.config.ts
  app/
    layout.tsx               # <html>, ThemeProvider, Shell
    globals.css              # Tailwind layers + CSS custom properties (tokens)
    page.tsx                 # landing / default catalog view (catalog module)
    manifest.ts              # PWA manifest (Next metadata route)
  components/
    shell/
      shell.tsx              # grid: sidebar | (topbar / main)
      sidebar.tsx            # nav tree slot + collapse + footer
      sidebar-nav.tsx        # renders a group/recipe tree it is handed (no data)
      topbar.tsx             # left: slot (tabs); right: fixed actions
      theme-toggle.tsx
      mobile-drawer.tsx
    ui/                       # shadcn components (generated)
    primitives/
      collapsible-section.tsx
      empty-state.tsx
      skeleton.tsx
      toaster.tsx
  lib/
    tokens.ts                # typed token names -> CSS var references
    cn.ts
  sw.ts                      # Serwist service worker source
  tests/
    shell/
    fixtures/
      nav-tree.ts            # sample groups + recipes for visual/dev work
  e2e/
    pwa-install.spec.ts
    offline-browse.spec.ts
    a11y.spec.ts
```

## Code Style

**Amended during Task 1/2 (implementation predates this text; `shadcn init`'s
generated tokens took precedence over the originally-drafted `--color-*`
names — see Confirmed Decision 7).** `shadcn init` generates its own semantic
token set (`--background`, `--foreground`, `--card`, `--border`, `--muted`,
`--primary`, `--sidebar*`, `--radius`, etc.) plus a ready-made `--sidebar*`
group — exactly what "sidebar / cards" needed, so it's used directly rather
than inventing a parallel `--color-surface`. Skillet adds only what shadcn
doesn't already have: the warm accent (layered onto `--primary`/`--ring`,
*not* shadcn's own `--accent`, which means "subtle hover surface" in its
convention — a real naming collision, resolved by not touching `--accent`),
spacing/motion/layout tokens, and a `--sidebar-w` layout token. Components
still never hardcode hex or px for anything themed.

```css
/* globals.css — shadcn-generated tokens shown abbreviated; Skillet's
   additions/overrides are the ones spelled out in full */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* ...shadcn's generated --color-* -> var(--*) mappings, unchanged... */
}

:root {
  /* ...shadcn's generated neutral/card/sidebar/chart values, unchanged... */
  --radius: 0.5rem;                              /* spec: small radii, 6-8px */
  --primary: oklch(58% 0.16 40);                 /* Skillet accent: burnt orange */
  --primary-foreground: oklch(99% 0 0);
  --ring: oklch(58% 0.16 40);                    /* focus ring matches accent */

  /* Skillet-only additions, not part of shadcn's set: */
  --sidebar-w: 16rem;
  --space-gutter: 1.5rem;
  --content-max: 46rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur: 200ms;
}

.dark {
  /* ...shadcn's generated dark neutral/card/sidebar/chart values, unchanged... */
  --primary: oklch(64% 0.15 45);                 /* accent, dark-adjusted */
  --primary-foreground: oklch(99% 0 0);
  --ring: oklch(64% 0.15 45);
}
```

```tsx
// components/shell/shell.tsx
export function Shell({ nav, tabs, children }: ShellProps) {
  return (
    <div className="grid h-dvh grid-cols-[var(--sidebar-w)_1fr] max-md:grid-cols-1">
      <Sidebar nav={nav} />
      <div className="flex min-w-0 flex-col">
        <Topbar>{tabs}</Topbar>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-(--content-max) px-(--space-gutter) py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

Conventions: `PascalCase` components in `kebab-case.tsx` files; named exports;
server components by default, `"use client"` only where interaction requires it
(sidebar collapse state, theme toggle, drawer); no `any`; props typed with an
explicit interface; Tailwind classes ordered layout → box → type → color → state.

## Testing Strategy

- **Unit / component (Vitest + Testing Library):** sidebar renders a handed nav
  tree; collapse toggles and persists; `CollapsibleSection` open/close + a11y
  attributes; `EmptyState` / `Skeleton` render; theme toggle updates the
  `.dark` class on `<html>` and `localStorage`.
- **No-flash test:** the inline theme script sets the `.dark` class before
  first paint (assert the script is present and runs pre-hydration).
- **E2E (Playwright):**
  - `pwa-install`: manifest is valid, service worker registers, `beforeinstallprompt` fires.
  - `offline-browse`: load app, go offline, navigate the cached nav + a
    previously-viewed recipe page — succeeds; the run form shows the offline state.
  - `a11y`: axe scan on the shell + a representative page has zero serious/critical
    violations; full keyboard traversal of sidebar → topbar → main; visible focus ring.
- **Responsive:** snapshot the shell at 375 / 768 / 1280; sidebar is a drawer
  under `md`.
- No coverage number mandated for presentational components; the E2E bar is the
  real gate.

## Boundaries

**Always**
- Reference tokens, never hardcoded colors/radii/durations for themed surfaces.
- Keep the shell data-free: it renders nav trees and slot children it is handed.
- Run `bun run typecheck`, `bun run lint`, `bun run test` before commit.
- Every interactive shell element is keyboard-reachable with a visible focus ring.

**Ask first**
- Adding a runtime dependency (bundle size matters on Vercel free + mobile).
- Changing the token names or the slot contract (downstream modules depend on both).
- Introducing a JS animation library.

**Never**
- Call the backend from this module.
- Ship a theme that flashes on load.
- Put recipe/catalog/tab business logic in the shell.
- Regress the Lighthouse PWA or the axe a11y bar to land a visual tweak.

## Success Criteria

1. `bun run build` produces an installable PWA: valid manifest, registered service
   worker, install prompt available (Playwright-verified).
2. Offline: after one online visit, the nav and any previously-viewed recipe page
   are browsable with no network; the run form shows an explicit offline state.
3. Theme switches light ⇄ dark ⇄ system with no flash; default is light; choice
   survives reload (persisted to `localStorage`).
4. axe scan on the shell + a representative page: zero serious/critical
   violations. Full keyboard traversal works with a visible focus ring.
5. The shell renders correctly at 375 / 768 / 1280 px; sidebar collapses to icons
   on desktop and to a drawer under `md`.
6. The shell compiles and renders with **only** fixture data — no backend running.
7. Downstream modules mount into the topbar and main slots without modifying
   `components/shell/`.

## Open Questions

1. ~~Package manager.~~ **Resolved: bun** (install + runtime + script runner).
   Open sub-question: use Vitest via `bun run test` (assumed, for jsdom +
   Testing Library) or migrate to the native `bun test` runner later.
2. **Landing page** — does `/` open straight into the catalog, or is there a
   short marketing/hero section above the fold for first-time visitors? Leaning:
   catalog-first, with a dismissible one-line intro banner.
3. **Icon set for recipe groups** — hand-picked `lucide` icon per group (author
   sets it in `group.toml`), or no icons in nav. Leaning: optional icon field.
4. **Exact accent + neutral ramp** — the oklch values above are a starting point
   to tune during visual iteration; they are not final.
