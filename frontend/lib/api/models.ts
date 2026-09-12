import { z } from "zod";

/**
 * Zod mirrors of the backend's exact camelCase wire contract
 * (`backend/src/skillet/api/schemas.py`) — see docs/SPEC-recipe-framework.md
 * ("Read-only recipe API") and its `catalog`-amendment addenda in
 * docs/SPEC-catalog.md.
 *
 * `EnvVar` is deliberately field-for-field identical to `settings`'
 * `RecipeEnvDecl` (`lib/settings/types.ts`) — that module couldn't import
 * from here (it's built first, per the approved build order), so it
 * defined the minimal shape it needed locally instead. A real `EnvVar`
 * satisfies `RecipeOverridesProps["recipe"]["env"]` with no adapter as a
 * result; verified at compile time in `tests/api/models.test.ts`.
 */
export const EnvVar = z.object({
  key: z.string(),
  provider: z.string(),
  required: z.boolean(),
  description: z.string(),
});
export type EnvVar = z.infer<typeof EnvVar>;

/** A `[[recipe.example]]` entry. `expect` is prose, never a stored/fetched output. */
export const Example = z.object({
  title: z.string(),
  summary: z.string(),
  expect: z.string(),
  params: z.record(z.string(), z.unknown()),
});
export type Example = z.infer<typeof Example>;

export const SourceFileRef = z.object({
  path: z.string(),
  language: z.string(),
});
export type SourceFileRef = z.infer<typeof SourceFileRef>;

export const SourceFileWithContent = SourceFileRef.extend({
  text: z.string(),
  sha256: z.string(),
});
export type SourceFileWithContent = z.infer<typeof SourceFileWithContent>;

export const SourceBundle = z.object({
  files: z.array(SourceFileWithContent),
  bundleSha256: z.string(),
});
export type SourceBundle = z.infer<typeof SourceBundle>;

const Difficulty = z.enum(["basic", "intermediate", "advanced"]);

/**
 * `groupTitle`/`groupIcon` are the recipe-framework amendment added in this
 * module's Task 0 — `group` itself stays the bare id, matching the
 * backend's own `RecipeSummary`/`RecipeDetail` split.
 */
export const RecipeSummary = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  group: z.string(),
  groupTitle: z.string(),
  groupIcon: z.string().nullable(),
  difficulty: Difficulty,
  order: z.number(),
  estimatedRuntimeSeconds: z.number(),
});
export type RecipeSummary = z.infer<typeof RecipeSummary>;

export const RecipeDetail = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  group: z.string(),
  groupTitle: z.string(),
  groupIcon: z.string().nullable(),
  difficulty: Difficulty,
  order: z.number(),
  estimatedRuntimeSeconds: z.number(),
  useCases: z.array(z.string()),
  readmeMarkdown: z.string().nullable(),
  examples: z.array(Example),
  inputSchema: z.record(z.string(), z.unknown()), // JSON Schema of Params
  sourceFiles: z.array(SourceFileRef),
  env: z.array(EnvVar),
});
export type RecipeDetail = z.infer<typeof RecipeDetail>;
