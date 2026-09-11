# Spec: settings

Module id: `settings` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-09**.

## Objective

The client-side configuration layer: global model-provider keys and a custom
backend URL, per-recipe overrides of the env keys a recipe declares, and the
merge policy that turns those into the single `ResolvedConfig` object a run
consumes.

- **What:** a browser-only settings store (Zod-validated, versioned, persisted to
  `localStorage`) plus two UI surfaces — a global Settings screen mounted in the
  `app-shell` main slot, and a per-recipe overrides section rendered inside the
  run form — and one pure function, `resolveConfig`, that merges per-recipe
  overrides over global defaults for exactly the keys a recipe's `recipe.toml`
  declares.
- **Why:** the teaching promise is "run it live with your own key." That only
  works if a learner can save a key once and have every recipe inherit it, see
  clearly which value a recipe is using and where it came from, and trust that
  the key never leaves their device except on a run request they initiated.
- **User:** the learner. Also `catalog` (embeds the overrides UI in its run form)
  and `execution` (receives the resolved config and forwards keys per-request).
- **Success:** a learner enters `OPENAI_API_KEY` once in global settings, opens
  any recipe, and the run form shows that key as "inherited from global"; a
  round-trip through `localStorage` preserves every value; `resolveConfig` is
  covered by a table of merge cases that all pass.

## Scope

**In:** the `SettingsV1` shape + Zod schema; the versioned `localStorage` blob
(`skillet.settings`) and its migration runner; the `useSettings` /
`useResolvedConfig` hooks; a typed `useLocalStorage` primitive; the
`resolveConfig(recipe, global, overrides)` merge function and its "source"
metadata (`global` | `override` | `unset`); the global Settings screen (provider
key fields, custom backend URL, clear-all); the per-recipe overrides panel
(one field per declared `recipe.env` key, each with an inherited/overridden
indicator and a "reset to global" affordance); masked inputs with a show/hide
toggle; the "keys stay in your browser" messaging; the empty state when no key
is set.

**Out:** the run form itself and how it collects recipe `Params`
(`catalog`); the run endpoint, SSE, and per-request key transport
(`execution` — it consumes the resolved object); server-side key handling and
the "never persisted server-side" guarantee (`execution` / `recipe-framework`
boundary); rate limiting and the keyless trial key (`trial-limits`); progress
tracking in `localStorage` (`workspace`); the shell frame, tokens, and theme
persistence (`app-shell`); recipe discovery and the `recipe.env` schema
(`recipe-framework` — this module reads it, does not define it).

## Confirmed decisions

1. **Frontend-only module.** No API routes, no server component data fetching,
   no server-side persistence of anything. Next.js 15 App Router, React 19,
   TypeScript, Tailwind v4, shadcn/ui, **bun** — same stack as `app-shell`.
2. **`localStorage` is the only store**, per-device per the intent. The learner's
   own key **is** remembered there (explicitly confirmed). Nothing syncs, nothing
   is encrypted at rest in v1 (see Open Questions).
3. **Two levels only:** GLOBAL defaults keyed by provider env key (e.g.
   `OPENAI_API_KEY`) plus a single `customBackendUrl`; and PER-RECIPE overrides
   keyed by recipe `slug` then by env key. No project / group level.
4. **Only declared keys are overridable.** A per-recipe override is accepted only
   for a key present in that recipe's `recipe.toml` `[[recipe.env]]` list. Any
   other key in the stored overrides is dropped on load (and never written by the
   UI, which only renders fields for declared keys).
5. **This module owns the merge policy.** `resolveConfig` produces the
   `ResolvedConfig` (a `Record<string, string>` of env key → value) that
   `execution` sends and that becomes `ctx.config` in the recipe.
   `recipe-framework` only consumes the resolved object; it has no opinion on how
   it was built.
6. **Merge rule:** for each key the recipe declares, use the per-recipe override
   if it is a non-empty string, else the global default if set, else leave it
   unset. Empty string == unset (trimmed). Values are strings only, matching the
   `recipe-framework` contract.
7. **"Inherited from global" is derived, never stored.** The UI computes each
   field's source from `(override?, global?)` at render time via the same
   function the resolver uses — a single source of truth for the indicator and
   the resolved value.
8. **Custom backend URL** is validated as an absolute `http(s)` URL, stored
   normalized (no trailing slash), and is a global-only setting (not
   per-recipe). Empty → the app's default backend.
9. **Keys are sensitive.** All key fields are masked inputs with a per-field
   show/hide toggle; a prominent "your keys stay in this browser and are sent
   only when you run a recipe" note; a one-click "Clear all settings" that wipes
   the blob. Keys are never logged, never placed in a URL, query string, or
   `GET` request, never sent to any origin other than the configured backend.
10. **Empty state is first-class.** No key set is a valid, non-blocking state:
    browsing is unaffected, and the keyless trial (`trial-limits`) can still run.
    The run form shows an unobtrusive "using the free trial key" / "add a key to
    keep going" hint driven by resolved-config emptiness, not an error.
11. **Versioned blob + forward-only migrations.** The stored object carries
    `{ version: 1, ... }`. On load, a migration runner upgrades older versions to
    the current shape; an unreadable or too-new blob is discarded and replaced
    with defaults (never throws into the UI).

## Tech Stack

- Next.js 15 (App Router), React 19, TypeScript 5.x
- Tailwind CSS v4, shadcn/ui (`input`, `button`, `label`, `card`, `alert`,
  `tooltip`, `dialog` for clear-all confirm)
- `zod` — settings schema, parsing, and per-field validation
- `lucide-react` — `Eye` / `EyeOff`, `Info`, `RotateCcw` (reset), `Trash2`
- Vitest + Testing Library — merge logic, persistence, migrations, UI indicators
- No new runtime dependency beyond `zod` (bundle size matters — see Boundaries)

## Commands

```
Install:     bun install
Dev:         bun dev
Build:       bun run build
Lint:        bun run lint
Typecheck:   bun run typecheck
Test:        bun run test
Test (watch):bun run test --watch
```

(Shares the `frontend/` workspace and toolchain with `app-shell`; package
manager and runtime: **bun**.)

## Project Structure

```
frontend/
  lib/
    settings/
      schema.ts             # SettingsV1 Zod schema + TS types, CURRENT_VERSION
      defaults.ts           # emptySettings(), known provider key catalog
      storage.ts            # STORAGE_KEY, read/write/clear, safe JSON + Zod parse
      migrations.ts         # migrate(raw): Stored -> SettingsV1, version by version
      resolve.ts            # resolveConfig(), resolveField() + FieldSource type
      providers.ts          # env-key -> provider display metadata (label, docs URL)
  hooks/
    use-local-storage.ts    # typed, SSR-safe, cross-tab-synced primitive
    use-settings.ts         # useSettings(): [settings, actions] over the blob
    use-resolved-config.ts  # useResolvedConfig(recipe): { config, fields }
  components/
    settings/
      settings-screen.tsx   # global screen (app-shell main slot)
      provider-key-field.tsx# masked input + show/hide + validation message
      backend-url-field.tsx
      clear-all-button.tsx  # confirm dialog -> storage.clear()
      recipe-overrides.tsx  # per-recipe panel, one row per declared env key
      inheritance-badge.tsx # "Inherited from global" | "Overridden" | "Not set"
      keys-safety-note.tsx  # the "stays in your browser" messaging block
  app/
    settings/
      page.tsx              # renders <SettingsScreen/> in the shell
  tests/
    settings/
      resolve.test.ts
      storage.test.ts
      migrations.test.ts
      use-local-storage.test.tsx
      provider-key-field.test.tsx
      recipe-overrides.test.tsx
```

`recipe-overrides.tsx` is imported by `catalog`'s run form; everything else is
self-contained.

## Code Style

The stored shape and its schema (`lib/settings/schema.ts`):

```ts
import { z } from "zod";

export const CURRENT_VERSION = 1 as const;

/** A provider API key env var name, e.g. "OPENAI_API_KEY". */
const EnvKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

const backendUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "Must be an http(s) URL")
  .transform((u) => u.replace(/\/+$/, ""))
  .or(z.literal(""));

export const settingsV1Schema = z.object({
  version: z.literal(CURRENT_VERSION),
  /** Global provider defaults: env key -> secret value. */
  global: z.record(EnvKey, z.string()).default({}),
  customBackendUrl: backendUrl.default(""),
  /** Per-recipe overrides: recipe slug -> (env key -> value). */
  overrides: z.record(z.string(), z.record(EnvKey, z.string())).default({}),
});

export type SettingsV1 = z.infer<typeof settingsV1Schema>;
export type Settings = SettingsV1; // alias tracks the current version
```

The merge policy (`lib/settings/resolve.ts`) — the heart of the module:

```ts
import type { EnvVar } from "@/lib/api/models"; // recipe-framework contract, shared with catalog

export type FieldSource = "override" | "global" | "unset";

export interface ResolvedField {
  key: string;
  value: string | null;
  source: FieldSource;
  required: boolean;
}

export interface ResolvedConfig {
  /** env key -> value, only keys that resolved to a non-empty string. */
  config: Record<string, string>;
  /** one entry per key the recipe declares, for the UI indicators. */
  fields: ResolvedField[];
  /** declared + required keys that resolved to nothing. */
  missingRequired: string[];
}

const clean = (v: string | undefined): string => (v ?? "").trim();

export function resolveConfig(
  recipe: { slug: string; env: EnvVar[] },
  global: Record<string, string>,
  overrides: Record<string, string>, // overrides[recipe.slug] already selected
): ResolvedConfig {
  const fields = recipe.env.map<ResolvedField>((decl) => {
    const ov = clean(overrides[decl.key]);
    const gl = clean(global[decl.key]);
    if (ov) return { key: decl.key, value: ov, source: "override", required: decl.required };
    if (gl) return { key: decl.key, value: gl, source: "global", required: decl.required };
    return { key: decl.key, value: null, source: "unset", required: decl.required };
  });

  return {
    config: Object.fromEntries(
      fields.filter((f) => f.value !== null).map((f) => [f.key, f.value as string]),
    ),
    fields,
    missingRequired: fields.filter((f) => f.required && f.value === null).map((f) => f.key),
  };
}
```

The typed `localStorage` primitive (`hooks/use-local-storage.ts`):

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T, // caller supplies a Zod-backed parser
): readonly [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(fallback); // SSR-safe: hydrate in effect

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(parse(raw));
    } catch {
      /* private mode / quota / bad blob — keep the fallback */
    }
  }, [key, parse]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* ignore write failures; state still updates for this session */
        }
        return resolved;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(fallback);
  }, [key, fallback]);

  // cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(e.newValue === null ? fallback : parse(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, fallback, parse]);

  return [value, set, clear] as const;
}
```

Conventions: `PascalCase` components in `kebab-case.tsx` files; named exports;
`"use client"` only on the hooks and the interactive settings components;
props typed with an explicit interface; no `any`; secrets never interpolated
into log/analytics calls; Tailwind class order layout → box → type → color →
state (matches `app-shell`).

## Testing Strategy

- **Merge / resolution correctness (the important one) — Vitest table over
  `resolveConfig`:** override present → `source: "override"`; only global set →
  `"global"`; neither → `"unset"` and key absent from `config`; whitespace-only
  override falls through to global; whitespace-only global falls through to
  unset; an override for a key the recipe does **not** declare never appears in
  `config` or `fields`; `missingRequired` lists exactly the declared-required
  keys that resolved to nothing; a recipe with no `recipe.env` resolves to an
  empty `config` with no error.
- **Persistence round-trip (`storage.test.ts`):** write a fully-populated
  `SettingsV1`, read it back, deep-equal; unknown top-level fields are stripped
  by the schema; a `customBackendUrl` with a trailing slash is stored
  normalized; `clear()` removes the key and the next read returns defaults.
- **Migration / versioning (`migrations.test.ts`):** a `version: 0` /
  unversioned legacy blob upgrades to `CURRENT_VERSION` with values preserved;
  a blob with `version` greater than `CURRENT_VERSION` is discarded for
  defaults; malformed JSON is discarded for defaults; a valid current blob
  passes through untouched; each migration step is pure and independently
  tested.
- **Masking (`provider-key-field.test.tsx`):** the input renders as
  `type="password"` by default; the show/hide toggle flips to `type="text"` and
  back; the raw key value never appears in the DOM while hidden; toggling one
  field does not reveal another.
- **"Inherited from global" indicator (`recipe-overrides.test.tsx`):** with a
  global key and no override, the row shows the "Inherited from global" badge and
  the field placeholder reflects the global value (masked); typing an override
  flips the badge to "Overridden" and enables "reset to global"; "reset to
  global" clears the override and the badge returns to inherited; a declared key
  with neither value shows "Not set" (and "Required" styling when
  `required: true`).
- **Empty state:** `useResolvedConfig` for a recipe with an empty store yields
  `config: {}` and drives the "using the trial key" hint, not an error; the run
  form is not blocked.
- **No coverage number mandated for the presentational badges;** `resolve.ts`,
  `storage.ts`, and `migrations.ts` target **≥ 95% line coverage** — they are the
  load-bearing logic.

## Boundaries

**Always**
- Resolve every field through `resolveConfig` / `resolveField` so the indicator
  and the value that runs can never disagree.
- Validate the stored blob with the Zod schema on every read; on failure fall
  back to defaults without throwing into the UI.
- Mask key inputs by default and keep the "keys stay in your browser, sent only
  when you run a recipe" note visible on both settings surfaces.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test` before every commit.
- Treat empty settings as a valid state everywhere (no blocking, no error).

**Ask first**
- Adding a runtime dependency (bundle size matters on Vercel free + mobile).
- Changing the `ResolvedConfig` shape or the `resolveConfig` signature
  (`execution` and `catalog` depend on it).
- Changing the `localStorage` key, the blob shape, or `CURRENT_VERSION` without a
  migration.
- Adding a settings level beyond global + per-recipe, or a non-key global
  setting (e.g. model selection) — that reshapes the schema.

**Never**
- Send a key, or any settings value, to any origin other than the configured
  backend, and only on a run request the learner initiated.
- Put a key in a URL, query string, request header on a `GET`, log line,
  analytics event, or error message.
- Persist settings anywhere server-side, or read them in a server component.
- Write a per-recipe override for an env key the recipe's `recipe.toml` does not
  declare.
- Block browsing, the catalog, or the keyless trial run because no key is set.
- Store a derived "inherited" flag — it is always computed from
  `(override, global)`.

## Success Criteria

1. A learner enters `OPENAI_API_KEY` once in global settings; every recipe that
   declares it shows it as "Inherited from global" in the run form and runs with
   it — proven by a component + resolve test.
2. `resolveConfig` passes the full merge table: override > global > unset, with
   trimming, declared-keys-only, and `missingRequired` correct.
3. A populated settings object survives a `localStorage` write/read round-trip
   byte-for-byte (after normalization) with no data loss.
4. A legacy / unversioned blob is migrated to `CURRENT_VERSION`; a corrupt or
   too-new blob is replaced with defaults and the UI still renders.
5. Every key field is masked by default; the show/hide toggle works per-field;
   no key value is ever emitted to a log, URL, or non-backend origin (grep +
   test guard).
6. "Clear all settings" wipes the blob; the next load shows the empty state and
   nothing breaks.
7. With no key set, the catalog is fully browsable and the keyless trial run is
   not blocked; the run form shows the trial-key hint, not an error.
8. `customBackendUrl` accepts only absolute `http(s)` URLs, stores them
   normalized, and an empty value falls back to the default backend.

## Open Questions

1. ~~Model selection, not just keys.~~ **Resolved: recipe-owned in v1** — a
   module constant in `recipe.py` or a `Params` field. `settings` has no model
   config and `resolveConfig` stays env-key-only. Revisit if recipes proliferate.
2. **Multiple named key profiles** (e.g. "personal" vs "work" OpenAI keys) with a
   quick switcher — deferred; would change `global` from a flat record to a
   profile map.
3. **Export / import settings** (JSON download + paste-to-restore) for moving
   between devices without accounts — nice for the local-clone story; risk is
   handing a plaintext key file around. Deferred.
4. **Encryption at rest in `localStorage`.** A passphrase-derived key would stop
   casual disk/extension snooping but adds a lock/unlock UX and can't protect
   against a compromised page. v1 stores plaintext with clear messaging;
   revisit if it blocks adoption.
5. **Per-provider validation / "test key" button.** A lightweight
   backend-proxied check that a key is live before a full run — improves the
   first-run experience but adds an endpoint (`execution`'s concern) and a way
   to burn quota. Deferred.
6. **Which provider keys ship in the global screen by default.** Driven by the
   union of `recipe.env` across bundled recipes (OpenAI at minimum) plus the
   custom backend URL; finalize once the v1 recipe set is locked.
7. **Cross-tab write conflicts.** The `storage` event keeps tabs in sync on a
   last-write-wins basis; if two tabs edit different keys near-simultaneously one
   edit is lost. Acceptable for v1? Leaning: yes, single-user single-device.
