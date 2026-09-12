"use client";

import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";

import { IntroBanner } from "@/components/catalog/intro-banner";
import { RecipeFilter } from "@/components/catalog/recipe-filter";
import { EmptyState } from "@/components/primitives/empty-state";
import { Skeleton } from "@/components/primitives/skeleton";
import { useRecipes } from "@/hooks/use-recipes";
import type { RecipeSummary } from "@/lib/api/models";
import { cn } from "@/lib/cn";

const DIFFICULTY_LABEL: Record<RecipeSummary["difficulty"], string> = {
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/**
 * Groups a flat `RecipeSummary[]` by `group`, in the order groups first
 * appear (the backend already sorts the list — see `lib/catalog/nav-model.
 * ts`'s own doc comment). Deliberately NOT built on `buildNavModel`: that
 * function's output (`NavGroup`/`NavRecipe`) only carries `{slug, title,
 * difficulty}` per recipe, dropping `summary` — and an index page,
 * whose whole job is letting a learner decide what to read next, benefits
 * from showing the summary right on each card. Grouping logic is
 * intentionally similar to `nav-model.ts`'s (same Map-by-id approach), just
 * over the richer type.
 */
function groupSummaries(recipes: RecipeSummary[]): { id: string; title: string; recipes: RecipeSummary[] }[] {
  const groups = new Map<string, { id: string; title: string; recipes: RecipeSummary[] }>();
  for (const recipe of recipes) {
    let group = groups.get(recipe.group);
    if (!group) {
      group = { id: recipe.group, title: recipe.groupTitle, recipes: [] };
      groups.set(recipe.group, group);
    }
    group.recipes.push(recipe);
  }
  return Array.from(groups.values());
}

function matchesFilter(recipe: RecipeSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return recipe.title.toLowerCase().includes(q) || recipe.summary.toLowerCase().includes(q);
}

/**
 * The `/` catalog index: every recipe the backend (or, with no backend
 * reachable, nothing) returns, grouped, filterable, browsable with no key
 * and no rate limit (SPEC-catalog.md — browsing is never gated). Filters
 * only this page's own list; the sidebar's nav tree is a separate,
 * server-rendered tree (`app/layout.tsx`) with no live connection to this
 * page's filter input.
 */
export function CatalogIndex() {
  const { data: recipes, isPending, isError } = useRecipes();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () => (recipes ?? []).filter((recipe) => matchesFilter(recipe, filter)),
    [recipes, filter],
  );
  const groups = useMemo(() => groupSummaries(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-6">
      <IntroBanner />
      <RecipeFilter value={filter} onChange={setFilter} />

      {isPending ? (
        <div data-testid="catalog-index-loading" className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : isError ? (
        <EmptyState
          icon={BookOpen}
          message="Couldn't load the recipe catalog. Check that the backend is running, then reload."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          message={
            recipes && recipes.length > 0
              ? "No recipes match your search."
              : "No recipes yet — check back soon."
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-3">
              <h2 className="text-lg font-medium text-foreground">{group.title}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.recipes.map((recipe) => (
                  <li key={recipe.slug}>
                    <a
                      href={`/r/${recipe.slug}`}
                      className={cn(
                        "flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4",
                        "outline-none transition-colors",
                        "hover:bg-accent",
                        "focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:outline-offset-2"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground">{recipe.title}</span>
                        {/* Same badge shape/scale as sidebar-nav.tsx's difficulty
                            badge (rounded-full, text-[10px] uppercase tracking-wide)
                            for visual consistency, using main-content tokens
                            (border/muted-foreground) rather than the sidebar's
                            own sidebar-* tokens, since this renders outside the
                            sidebar's color context. */}
                        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                          {DIFFICULTY_LABEL[recipe.difficulty]}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{recipe.summary}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
