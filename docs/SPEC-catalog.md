# Spec: catalog

Module id: `catalog` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-09**.
Depends on: `recipe-framework`, `app-shell`.

## Objective

Everything a learner sees *before* pressing Run: the grouped recipe navigation,
and the recipe page — description, use-cases, the byte-for-byte source viewer,
and the auto-generated run form.

- **What:** the nav tree in the shell's sidebar, the `/` catalog index, the
  `/r/[slug]` recipe page with collapsible regions (description, examples, source,
  run form), and the client that fetches the read-only recipe API.
- **Why:** browsing is the free, always-available surface — it must be great even
  for someone who never runs anything or is rate-limited. The "read the real
  code" promise is delivered here.
- **User:** the learner (browsing, reading, filling the form). `workspace`
  consumes this module's recipe page as tab content.
- **Success:** the full catalog + a recipe page render from fixtures with no
  backend; the run form is generated entirely from the recipe's published input
  schema; the source viewer shows exactly what the backend serves.

## Scope

**In:** sidebar nav tree (groups ordered by `group.order`, recipes by
`recipe.order`, difficulty badges, optional group icon); `/` catalog index
(groups with their recipe lists, the dismissible one-line intro banner); the
`/r/[slug]` recipe page; the collapsible **description** region (renders
`summary` + `use_cases` + optional `README.md` markdown); the collapsible
**source** region (multi-file tabs, syntax highlighting, copy, read-only); the
**run form** — generated from the recipe's JSON Schema, client-side validated,
producing a typed params object; a lightweight text filter over recipe
titles/summaries; the recipe-API client + typed models + fixture set.

**Out:** the recipe API *implementation* (`recipe-framework` owns
`GET /recipes`, `/recipes/{slug}`, `/recipes/{slug}/source`); the per-recipe
env-var override UI and config resolution (`settings` — the run form embeds
`settings`' override component); actually running a recipe and rendering its
event stream (`execution` owns the SSE client and the output renderer, mounted by
this page below the form); tabs and progress marks (`workspace`); the shell frame
and tokens (`app-shell`).

## Confirmed decisions

1. Frontend module. Next.js 15 App Router, React 19, TS, Tailwind v4, shadcn,
   **bun**. Consumes `recipe-framework`'s read-only API; adds no backend
   endpoints of its own.
2. **`/` is catalog-first** with a dismissible one-line intro banner (resolves
   `app-shell` open question 2). No separate marketing hero for v1.
3. **The run form is generated from a published input schema, never
   hand-written.** `recipe-framework`'s `GET /recipes/{slug}` returns
   `inputSchema` (the `Params` model as JSON Schema, including
   `json_schema_extra` hints). Catalog maps schema → form controls.
4. **Source viewer shows the exact bytes from `GET /recipes/{slug}/source`** —
   the multi-file bundle (`recipe.py` + local helpers + `recipe.toml`). Read-only,
   highlighted, per-file tabs, copy button. No "run in browser," no editing
   (hosted source is immutable).
5. Browsing is never gated. Rate limits and the keyless-trial state affect only
   the Run action, surfaced inside the form area, not the page.
6. Everything renders from a **fixture set** (nav tree + 3–4 sample recipe
   details + source bundles + schemas) before `execution` or the backend exist.
7. **Worked examples.** `GET /recipes/{slug}` returns `examples`
   (`title, summary, expect, params`). The recipe page renders each as a card
   with a **"Try this example"** button that pre-fills the run form from
   `params`. `expect` is shown as prose; no output is fetched or stored.
8. **`readmeMarkdown`** (optional per recipe) renders inside the description
   region below `summary` + `use_cases`.

## Cross-module contract (`recipe-framework` amendment — approved 2026-09-09)

`GET /recipes/{slug}` returns `inputSchema`, `sourceFiles` (`[{ path, language }]`),
`env` (declared `[[recipe.env]]` entries), `examples`, and `readmeMarkdown`. The
`env` type is imported from `recipe-framework`'s published contract; neither
`catalog` nor `settings` redefines it. Does not change `recipe-framework`'s
existing success criteria.

## Cross-module contract (`workspace` amendment — approved 2026-09-11)

Additive only; does not change this module's existing success criteria or any
`catalog`-owned component.

1. **`RecipeView` gains an optional `onStatusChange?: (status: RecipeRunStatus)
   => void` prop**, invoked whenever the internal `useRecipeRun` status
   transitions (`idle → running → done | error`, back to `idle` on
   cancel-and-restart). Unused, it changes nothing about `catalog`'s own
   rendering.
2. **`RecipeView` is wrapped in `forwardRef`** and exposes
   `{ cancelRun(): void }` via `useImperativeHandle`, delegating to its internal
   `useRecipeRun().cancel`. `workspace` calls this when a tab hosting the view is
   closed.
3. **`components/catalog/nav-tree.tsx` accepts an optional `progress` prop**
   (`Record<slug, { viewed: boolean; completed: boolean }>`) and renders a small
   badge/checkmark per recipe node when an entry is present; absent data (the
   prop omitted) renders no badge — today's behavior is unchanged.

`workspace` supplies the `progress` map and consumes the `onStatusChange` /
`cancelRun` surface; it never edits `components/catalog/` beyond what these
three additive points allow.

## Tech Stack

- Next.js 15, React 19, TypeScript
- `@tanstack/react-query` for API fetching/caching (plays well with Serwist
  offline cache)
- `shiki` for source highlighting (build-time grammar, `python` + `toml`)
- `react-markdown` + `remark-gfm` for `README.md` rendering
- `react-hook-form` + `zod` for the generated form; a schema→field resolver
- `zod` models for API responses
- Vitest + Testing Library; Playwright for the page-level flows

## Commands

Inherits `frontend/` commands from `app-shell` (`bun dev`, `bun run build|test|
test:e2e|lint|typecheck`).

## Project Structure

```
frontend/
  app/
    page.tsx                     # catalog index
    r/[slug]/page.tsx            # recipe page (server component: fetch detail)
    r/[slug]/recipe-view.tsx     # client: the collapsible regions
  components/
    catalog/
      nav-tree.tsx               # builds the sidebar nav model, passes to app-shell <Sidebar>
      catalog-index.tsx
      intro-banner.tsx           # dismissible, remembers dismissal in localStorage
      recipe-filter.tsx
      description-panel.tsx      # summary + use_cases + readmeMarkdown
      examples-panel.tsx         # <[[recipe.example]]> cards + "Try this example"
      source-viewer.tsx          # file tabs + shiki + copy
      run-form/
        run-form.tsx             # <form>; composes fields + <RecipeOverrides> (settings) + Run button
        schema-to-fields.tsx     # JSON Schema -> field descriptors
        fields/                  # text, number, slider, select, switch, file-dropzone
  lib/
    api/
      recipes.ts                 # typed client: listRecipes(), getRecipe(slug), getSource(slug)
      models.ts                  # zod: RecipeSummary, RecipeDetail, SourceBundle, EnvVar
    catalog/
      nav-model.ts               # group/order/difficulty -> nav tree
      schema-form.ts             # JSON Schema -> zod schema + field list
  tests/
    catalog/
    fixtures/
      catalog/                   # nav tree, recipe details, source bundles, schemas
  e2e/
    browse-catalog.spec.ts
    recipe-page.spec.ts
    run-form-validation.spec.ts
```

## Code Style

```ts
// lib/api/models.ts
export const EnvVar = z.object({
  key: z.string(),
  provider: z.string(),
  required: z.boolean(),
  description: z.string(),
});

export const RecipeDetail = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  group: z.string(),
  difficulty: z.enum(["basic", "intermediate", "advanced"]),
  order: z.number(),
  estimatedRuntimeSeconds: z.number(),
  useCases: z.array(z.string()),
  readmeMarkdown: z.string().nullable(),
  inputSchema: z.record(z.unknown()),          // JSON Schema of Params
  sourceFiles: z.array(z.object({ path: z.string(), language: z.string() })),
  env: z.array(EnvVar),
});
export type RecipeDetail = z.infer<typeof RecipeDetail>;
```

```ts
// lib/catalog/schema-form.ts
export interface FieldDescriptor {
  name: string;
  label: string;
  help?: string;
  control: "text" | "textarea" | "number" | "slider" | "select" | "switch" | "files";
  options?: string[];                          // for select (JSON Schema enum)
  min?: number; max?: number; step?: number;   // number/slider
  accept?: string[]; maxFiles?: number;        // files (from json_schema_extra)
  required: boolean;
  default?: unknown;
}

/** JSON Schema (Pydantic v2 output) -> ordered fields + a zod validator. */
export function compileForm(inputSchema: JsonSchema): {
  fields: FieldDescriptor[];
  validator: z.ZodTypeAny;
};
```

```tsx
// components/catalog/run-form/run-form.tsx
export function RunForm({ recipe }: { recipe: RecipeDetail }) {
  const { fields, validator } = useMemo(() => compileForm(recipe.inputSchema), [recipe]);
  const form = useForm({ resolver: zodResolver(validator) });
  // ... renders fields, then <RecipeOverrides recipe={recipe} /> from `settings`,
  //     then <RunButton /> whose enabled/limited state comes from `trial-limits`.
  // onSubmit hands { params, recipeSlug } upward; `execution` takes it from there.
}
```

Conventions follow `app-shell`: server components fetch, client components
interact; named exports; `kebab-case.tsx`; tokens only.

## Testing Strategy

- **Schema → form (the important one):** table-driven tests mapping representative
  JSON Schemas (string, constrained int, enum, bool, `list[UploadedFile]` with
  `accept`/`max_files`, optional-with-default) to the expected `FieldDescriptor[]`
  and `zod` validator behavior (accepts valid, rejects each invalid case with a
  field-level message).
- **Source viewer:** given a `SourceBundle` fixture, every file appears as a tab,
  content is verbatim (byte-compare against fixture), copy copies the raw file,
  nothing is editable.
- **Nav model:** groups sort by `group.order`, recipes by `recipe.order` within
  group; difficulty badges present; unknown/missing icon degrades gracefully.
- **Description panel:** `README.md` markdown renders with GFM; `use_cases` list
  renders; absent README hides the section.
- **Offline:** a previously-fetched recipe page renders from the react-query /
  Serwist cache with the network off; the Run button shows the offline state.
- **E2E:** browse index → open a group → open a recipe → expand every region →
  click "Try this example" and confirm the form pre-fills → fill the form with
  invalid then valid input → Run button enables only when valid (and not
  rate-limited).
- Filter: typing narrows the index and the sidebar; empty result shows an
  `EmptyState`.

## Boundaries

**Always**
- Generate the run form from `input_schema`; never hand-code a recipe's fields.
- Render source from the `/source` bytes; treat it as immutable and untrusted
  (highlight only, no HTML execution).
- Keep browsing fully functional without a key, without a backend (fixtures), and
  when rate-limited.
- Tokens only; keyboard-navigable collapsibles with correct ARIA.

**Ask first**
- Changing the recipe-API response contract (coordinate with `recipe-framework`).
- Adding a control type not derivable from JSON Schema.
- Adding a dependency (bundle size).

**Never**
- Let the source viewer execute or fetch anything from the source text.
- Gate browsing on auth, key presence, or rate-limit state.
- Duplicate recipe metadata in the frontend — it comes from the API/fixtures,
  which mirror `recipe.toml`.
- Put form values or keys in the URL.

## Success Criteria

1. The entire catalog + a recipe page render from fixtures with no backend
   process running.
2. For every fixture recipe, the run form is produced solely from
   `input_schema`, and client validation matches the schema constraints
   (verified by the table-driven tests).
3. The source viewer's per-file content byte-matches the `SourceBundle` fixture
   (and, in integration, the backend's `/source` response).
4. Browsing, filtering, expanding description/source, and reading work with the
   network disabled after one online visit.
5. The Run button is enabled only when the form is valid; its limited/offline
   states are driven by `trial-limits` / connectivity, not by catalog logic.
6. axe scan of the recipe page: zero serious/critical; every collapsible region
   operable by keyboard; "Try this example" pre-fills and focuses the form.
7. `workspace` can render `<RecipeView slug=… />` as tab content without
   modifying `components/catalog/`.

## Open Questions

1. ~~README vs. inline only.~~ **Resolved:** optional `README.md` per recipe →
   `readmeMarkdown`, rendered in the description region.
2. ~~"Examples" beyond use-cases.~~ **Resolved:** structured static
   `[[recipe.example]]` block (`title, summary, expect, params`) with a
   "Try this example" pre-fill. No stored expected output.
3. **Filter scope for v1** — title/summary substring only, or also by difficulty /
   group? Leaning: substring only.
4. **Deep-linking to a source line** (`/r/[slug]#recipe.py-L42`) — nice for
   teaching/sharing. Leaning: later.
5. **Group icons** — optional `icon` field in `group.toml` (a `lucide` name)?
   Leaning: yes, optional.
