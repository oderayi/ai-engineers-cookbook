import { describe, expect, it } from "vitest";

import { RecipeDetail, RecipeSummary, SourceBundle } from "@/lib/api/models";

import { catalogFixtureRecipes } from "./recipes";
import { catalogFixtureSourceBundles } from "./source-bundles";
import { catalogFixtureSummaries } from "./summaries";

/**
 * Guards every catalog fixture against Task 1's zod schemas, so an edit to
 * a fixture that drifts from the wire contract fails loudly here rather
 * than surfacing as a confusing failure three tasks later.
 */
describe("catalog fixtures", () => {
  it("every RecipeDetail fixture parses via the zod schema", () => {
    for (const recipe of catalogFixtureRecipes) {
      expect(() => RecipeDetail.parse(recipe)).not.toThrow();
    }
  });

  it("every RecipeSummary fixture parses via the zod schema", () => {
    for (const summary of catalogFixtureSummaries) {
      expect(() => RecipeSummary.parse(summary)).not.toThrow();
    }
  });

  it("every SourceBundle fixture parses via the zod schema", () => {
    for (const bundle of Object.values(catalogFixtureSourceBundles)) {
      expect(() => SourceBundle.parse(bundle)).not.toThrow();
    }
  });

  it("has a source bundle for every recipe detail, and vice versa", () => {
    const detailSlugs = catalogFixtureRecipes.map((r) => r.slug).sort();
    const bundleSlugs = Object.keys(catalogFixtureSourceBundles).sort();
    expect(bundleSlugs).toEqual(detailSlugs);
  });

  it("summaries are derived from, and stay in sync with, the details", () => {
    expect(catalogFixtureSummaries.map((s) => s.slug)).toEqual(
      catalogFixtureRecipes.map((r) => r.slug),
    );
  });

  it("spans at least 2 groups", () => {
    const groups = new Set(catalogFixtureRecipes.map((r) => r.group));
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  it("is already in discover()'s sort order: group order, then recipe order within group", () => {
    // The fixture list itself doesn't carry a numeric group order (that's
    // server-side, in group.toml) -- what's checked here is the contract
    // this fixture set promises callers: recipes sharing a group are
    // contiguous, and ascending by `order` within that run.
    let previousGroup: string | null = null;
    let previousOrderInGroup = -Infinity;
    for (const recipe of catalogFixtureRecipes) {
      if (recipe.group !== previousGroup) {
        previousGroup = recipe.group;
        previousOrderInGroup = -Infinity;
      }
      expect(recipe.order).toBeGreaterThan(previousOrderInGroup);
      previousOrderInGroup = recipe.order;
    }
  });

  it("includes at least one recipe with env, one with examples, one with readmeMarkdown, and one list[UploadedFile]-shaped field", () => {
    expect(catalogFixtureRecipes.some((r) => r.env.length > 0)).toBe(true);
    expect(catalogFixtureRecipes.some((r) => r.examples.length > 0)).toBe(true);
    expect(catalogFixtureRecipes.some((r) => r.readmeMarkdown !== null)).toBe(true);

    const hasFileField = catalogFixtureRecipes.some((r) => {
      const properties = r.inputSchema.properties as Record<string, unknown> | undefined;
      return Object.values(properties ?? {}).some((prop) => {
        const p = prop as { json_schema_extra?: { maxFiles?: number } };
        return typeof p.json_schema_extra?.maxFiles === "number";
      });
    });
    expect(hasFileField).toBe(true);
  });

  it("includes at least one enum field and one constrained int/number field", () => {
    const hasEnumField = catalogFixtureRecipes.some((r) => {
      const properties = r.inputSchema.properties as Record<string, unknown> | undefined;
      return Object.values(properties ?? {}).some(
        (prop) => Array.isArray((prop as { enum?: unknown[] }).enum),
      );
    });
    const hasConstrainedNumberField = catalogFixtureRecipes.some((r) => {
      const properties = r.inputSchema.properties as Record<string, unknown> | undefined;
      return Object.values(properties ?? {}).some((prop) => {
        const p = prop as { minimum?: number; maximum?: number };
        return typeof p.minimum === "number" && typeof p.maximum === "number";
      });
    });
    expect(hasEnumField).toBe(true);
    expect(hasConstrainedNumberField).toBe(true);
  });
});
