import type { NavModel } from "@/components/shell/sidebar-nav";
import type { ProgressMap } from "@/lib/workspace/progress";

/**
 * Merges `workspace`'s client-only `ProgressMap` into a server-built
 * `NavModel`, producing the `NavRecipe.progress` field
 * `components/shell/sidebar-nav.tsx` already knows how to render (see that
 * file's own `NavRecipeProgress`/`RecipeProgressBadge` -- built ahead of
 * time during `app-shell`, anticipating exactly this composition; nothing
 * in `components/shell/` needs to change for this).
 *
 * A pure function, not a hook: `app/layout.tsx` builds `NavModel`
 * server-side (no progress data exists there -- `localStorage` is
 * client-only), so the merge has to happen client-side, in whatever
 * component actually calls `useProgress()`
 * (`components/workspace/workspace-shell.tsx`) -- this function is that
 * merge step, kept separate and pure so it's testable without mounting
 * anything.
 */
export function mergeNavProgress(nav: NavModel, progress: ProgressMap): NavModel {
  return {
    groups: nav.groups.map((group) => ({
      ...group,
      recipes: group.recipes.map((recipe) => {
        const entry = progress[recipe.slug];
        if (!entry) return recipe;
        return {
          ...recipe,
          progress: { viewed: entry.viewedAt != null, completed: entry.completedAt != null },
        };
      }),
    })),
  };
}
