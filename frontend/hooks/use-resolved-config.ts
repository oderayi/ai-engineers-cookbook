"use client";

import { useMemo } from "react";

import { useSettings, type SettingsActions } from "@/hooks/use-settings";
import { resolveConfig, type ResolvedConfig } from "@/lib/settings/resolve";
import type { RecipeEnvDecl } from "@/lib/settings/types";

/**
 * `useResolvedConfig(recipe): [resolved, actions]` — composes `useSettings`
 * with `resolveConfig` so a recipe's run form (catalog/execution, built
 * later) can render the merged global/override config and its per-field
 * source without reaching into the settings blob's shape itself.
 *
 * Returns `useSettings`'s own actions alongside the resolved result rather
 * than making the caller mount a second `useSettings()` — both read the
 * same underlying `useLocalStorage` subscription either way, but this
 * keeps a recipe's run form to a single hook call for the common case of
 * "show the resolved config, let the user edit an override right here."
 *
 * Never throws and never blocks: a recipe with no matching settings at all
 * resolves to every field `"unset"` (with `missingRequired` populated) —
 * empty state is first-class, not an error, per SPEC-settings.md.
 */
export function useResolvedConfig(recipe: {
  slug: string;
  env: RecipeEnvDecl[];
}): readonly [ResolvedConfig, SettingsActions] {
  const [settings, actions] = useSettings();

  const resolved = useMemo(
    () => resolveConfig(recipe, settings.global, settings.overrides[recipe.slug] ?? {}),
    [recipe, settings.global, settings.overrides]
  );

  return [resolved, actions] as const;
}
