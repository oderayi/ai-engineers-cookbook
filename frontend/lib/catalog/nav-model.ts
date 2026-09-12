import type { NavGroup, NavModel, NavRecipe } from "@/components/shell/sidebar-nav";
import type { RecipeSummary } from "@/lib/api/models";

/**
 * Builds the sidebar's `NavModel` from the backend's pre-sorted recipe
 * summaries (SPEC-catalog.md, `catalog`'s nav-model amendment).
 *
 * Input ordering contract: `recipes` arrives already sorted by the backend
 * (group order, then ascending `order` within each group) — this function
 * does not re-sort by any field; it only groups entries in the order they
 * appear.
 *
 * Contiguous-vs-defensive regrouping: we key groups by `group` id in a
 * `Map` rather than only merging into the most-recently-opened group. That
 * means two recipes sharing a `group` id always land in the same
 * `NavGroup` — including the hypothetical case where the precondition above
 * is violated and same-group recipes aren't contiguous — at no extra cost
 * over a contiguous-run-only implementation (a `Map` lookup vs. comparing
 * against the last group). We chose this defensive reading because it's
 * strictly safer for the same amount of code and doesn't require trusting
 * an upstream invariant that this module has no way to verify at runtime.
 * `NavGroup.title`/`icon` are still taken from the FIRST recipe seen for
 * that group id, per spec.
 */
export function buildNavModel(recipes: RecipeSummary[]): NavModel {
  const groupsById = new Map<string, NavGroup>();

  for (const recipe of recipes) {
    let group = groupsById.get(recipe.group);
    if (!group) {
      group = {
        id: recipe.group,
        title: recipe.groupTitle,
        recipes: [],
        // `icon` is optional on `NavGroup` and its absence is load-bearing
        // (sidebar-nav.tsx renders no icon slot when the key is missing).
        // `exactOptionalPropertyTypes` isn't enabled in this project's
        // tsconfig, so `icon: undefined` would type-check, but we omit the
        // key entirely rather than set it to `undefined` to keep the two
        // states ("no icon" vs. "explicitly undefined icon") unambiguous
        // for any consumer that distinguishes them (e.g. `"icon" in group`).
        ...(recipe.groupIcon ? { icon: recipe.groupIcon } : {}),
      };
      groupsById.set(recipe.group, group);
    }

    // `progress` is never set here: this module has no progress data at
    // all — `workspace` composes it in later. Omitting the key (rather
    // than `progress: undefined`) matches the same omission style as
    // `icon` above.
    const navRecipe: NavRecipe = {
      slug: recipe.slug,
      title: recipe.title,
      difficulty: recipe.difficulty,
    };
    group.recipes.push(navRecipe);
  }

  return { groups: Array.from(groupsById.values()) };
}
