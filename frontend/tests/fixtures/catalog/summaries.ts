import type { RecipeSummary } from "@/lib/api/models";

import { catalogFixtureRecipes } from "./recipes";

/**
 * The `GET /recipes` shape derived from the same detail fixtures
 * (`recipes.ts`) that `GET /recipes/{slug}` would return — kept in sync by
 * construction (mapped, not hand-duplicated) and already in the order
 * `discover()` guarantees (group order, then recipe order within group):
 * `fundamentals` (order implied by first appearance) before `rag`, and
 * within each group, ascending `order`.
 */
export const catalogFixtureSummaries: RecipeSummary[] = catalogFixtureRecipes.map((r) => ({
  slug: r.slug,
  title: r.title,
  summary: r.summary,
  group: r.group,
  groupTitle: r.groupTitle,
  groupIcon: r.groupIcon,
  difficulty: r.difficulty,
  order: r.order,
  estimatedRuntimeSeconds: r.estimatedRuntimeSeconds,
}));
