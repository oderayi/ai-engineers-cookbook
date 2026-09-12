import { describe, expect, it } from "vitest";

import type { RecipeSummary } from "@/lib/api/models";
import { buildNavModel } from "@/lib/catalog/nav-model";
import { catalogFixtureSummaries } from "@/tests/fixtures/catalog/summaries";

/** Minimal, explicit `RecipeSummary` builder so each test only spells out
 * the fields it cares about. */
function makeSummary(overrides: Partial<RecipeSummary> & Pick<RecipeSummary, "slug">): RecipeSummary {
  return {
    slug: overrides.slug,
    title: overrides.title ?? overrides.slug,
    summary: overrides.summary ?? "",
    group: overrides.group ?? "group-a",
    groupTitle: overrides.groupTitle ?? "Group A",
    groupIcon: overrides.groupIcon ?? null,
    difficulty: overrides.difficulty ?? "basic",
    order: overrides.order ?? 10,
    estimatedRuntimeSeconds: overrides.estimatedRuntimeSeconds ?? 15,
  };
}

describe("buildNavModel", () => {
  it("groups the realistic fixture into the right group count/order/recipe order", () => {
    const nav = buildNavModel(catalogFixtureSummaries);

    expect(nav.groups).toHaveLength(2);
    expect(nav.groups.map((g) => g.id)).toEqual(["fundamentals", "rag"]);
    expect(nav.groups[0]?.title).toBe("Fundamentals");
    expect(nav.groups[1]?.title).toBe("RAG");

    expect(nav.groups[0]?.recipes.map((r) => r.slug)).toEqual([
      "prompt-basics",
      "tokens-and-context",
    ]);
    expect(nav.groups[1]?.recipes.map((r) => r.slug)).toEqual([
      "embeddings-101",
      "hybrid-search",
    ]);
  });

  it("carries slug/title/difficulty onto each NavRecipe", () => {
    const nav = buildNavModel(catalogFixtureSummaries);
    const first = nav.groups[0]?.recipes[0];

    expect(first).toEqual({
      slug: "prompt-basics",
      title: "Prompt Basics",
      difficulty: "basic",
    });
  });

  it("sets NavGroup.icon when the group has a non-null groupIcon", () => {
    const nav = buildNavModel([makeSummary({ slug: "r1", groupIcon: "BookOpen" })]);

    expect(nav.groups[0]?.icon).toBe("BookOpen");
  });

  it("omits the icon property entirely when groupIcon is null (not icon: undefined)", () => {
    const nav = buildNavModel([makeSummary({ slug: "r1", groupIcon: null })]);
    const group = nav.groups[0];

    expect(group).toBeDefined();
    expect(group && "icon" in group).toBe(false);
  });

  it("uses the FIRST recipe seen for a group id to derive title/icon", () => {
    const nav = buildNavModel([
      makeSummary({ slug: "r1", group: "g", groupTitle: "First Title", groupIcon: "BookOpen" }),
      makeSummary({ slug: "r2", group: "g", groupTitle: "Second Title", groupIcon: "Database" }),
    ]);

    expect(nav.groups).toHaveLength(1);
    expect(nav.groups[0]?.title).toBe("First Title");
    expect(nav.groups[0]?.icon).toBe("BookOpen");
    expect(nav.groups[0]?.recipes.map((r) => r.slug)).toEqual(["r1", "r2"]);
  });

  it("merges recipes sharing a group id into one NavGroup even when not contiguous", () => {
    const nav = buildNavModel([
      makeSummary({ slug: "r1", group: "g1", groupTitle: "Group One" }),
      makeSummary({ slug: "r2", group: "g2", groupTitle: "Group Two" }),
      makeSummary({ slug: "r3", group: "g1", groupTitle: "Group One" }),
    ]);

    expect(nav.groups).toHaveLength(2);
    const g1 = nav.groups.find((g) => g.id === "g1");
    expect(g1?.recipes.map((r) => r.slug)).toEqual(["r1", "r3"]);
  });

  it("returns { groups: [] } for empty input", () => {
    expect(buildNavModel([])).toEqual({ groups: [] });
  });

  it("never sets progress on any output NavRecipe", () => {
    const nav = buildNavModel(catalogFixtureSummaries);

    for (const group of nav.groups) {
      for (const recipe of group.recipes) {
        expect(recipe.progress).toBeUndefined();
        expect("progress" in recipe).toBe(false);
      }
    }
  });
});
