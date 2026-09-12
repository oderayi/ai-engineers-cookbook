/**
 * The subset of recipe-framework's declared env-var contract this module
 * needs (`recipe.toml`'s `[[recipe.env]]`, as published by
 * `GET /recipes/{slug}` — see docs/SPEC-recipe-framework.md).
 *
 * Deliberately a local type, not an import from `catalog`'s `lib/api/
 * models.ts`: `catalog` is built *after* `settings` in the approved build
 * order, so settings cannot depend on a file that doesn't exist yet.
 * Catalog's richer `EnvVar` will be structurally identical to this, so a
 * real `RecipeDetail.env` is assignable here with no adapter once catalog
 * exists — see SPEC-settings.md's Code Style section.
 */
export interface RecipeEnvDecl {
  key: string;
  provider: string;
  required: boolean;
  description: string;
}
