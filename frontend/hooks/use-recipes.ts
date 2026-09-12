"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getRecipe, getSource, listRecipes, RecipeApiError } from "@/lib/api/recipes";
import type { RecipeDetail, RecipeSummary, SourceBundle } from "@/lib/api/models";

/**
 * The catalog is read-only reference data for the lifetime of a browsing
 * session — nothing in this app mutates a recipe, so a successful fetch
 * never goes stale on its own. `Infinity` means react-query serves the
 * cached result forever (no background refetch on remount/refocus) until
 * something explicitly invalidates it, which is exactly right for this data
 * and avoids refetching the same three endpoints every time a user
 * navigates between recipe pages.
 */
const STALE_TIME = Infinity;

/** `GET /recipes` — the full catalog listing. */
export function useRecipes(): UseQueryResult<RecipeSummary[], RecipeApiError> {
  return useQuery<RecipeSummary[], RecipeApiError>({
    queryKey: ["recipes"],
    queryFn: listRecipes,
    staleTime: STALE_TIME,
  });
}

/** `GET /recipes/{slug}` — one recipe's full detail. */
export function useRecipe(slug: string): UseQueryResult<RecipeDetail, RecipeApiError> {
  return useQuery<RecipeDetail, RecipeApiError>({
    queryKey: ["recipes", slug],
    queryFn: () => getRecipe(slug),
    staleTime: STALE_TIME,
  });
}

/** `GET /recipes/{slug}/source` — one recipe's source bundle. */
export function useSource(slug: string): UseQueryResult<SourceBundle, RecipeApiError> {
  return useQuery<SourceBundle, RecipeApiError>({
    queryKey: ["recipes", slug, "source"],
    queryFn: () => getSource(slug),
    staleTime: STALE_TIME,
  });
}
