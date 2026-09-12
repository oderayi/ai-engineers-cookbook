import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/lib/settings/resolve";
import type { RecipeEnvDecl } from "@/lib/settings/types";

function envDecl(overrides: Partial<RecipeEnvDecl> = {}): RecipeEnvDecl {
  return {
    key: "OPENAI_API_KEY",
    provider: "openai",
    required: false,
    description: "OpenAI API key",
    ...overrides,
  };
}

describe("resolveConfig", () => {
  it("resolves to the override with source \"override\" when an override is present", () => {
    const recipe = { slug: "rag-basics", env: [envDecl()] };
    const result = resolveConfig(recipe, { OPENAI_API_KEY: "global-val" }, { OPENAI_API_KEY: "override-val" });

    expect(result.fields).toEqual([
      { key: "OPENAI_API_KEY", value: "override-val", source: "override", required: false },
    ]);
    expect(result.config).toEqual({ OPENAI_API_KEY: "override-val" });
    expect(result.missingRequired).toEqual([]);
  });

  it("falls back to the global value with source \"global\" when only global is set", () => {
    const recipe = { slug: "rag-basics", env: [envDecl()] };
    const result = resolveConfig(recipe, { OPENAI_API_KEY: "global-val" }, {});

    expect(result.fields).toEqual([
      { key: "OPENAI_API_KEY", value: "global-val", source: "global", required: false },
    ]);
    expect(result.config).toEqual({ OPENAI_API_KEY: "global-val" });
    expect(result.missingRequired).toEqual([]);
  });

  it("resolves to \"unset\" and omits the key from config when neither is set", () => {
    const recipe = { slug: "rag-basics", env: [envDecl()] };
    const result = resolveConfig(recipe, {}, {});

    expect(result.fields).toEqual([
      { key: "OPENAI_API_KEY", value: null, source: "unset", required: false },
    ]);
    expect(result.config).toEqual({});
    expect(result.missingRequired).toEqual([]);
  });

  it("falls through to global when the override is whitespace-only", () => {
    const recipe = { slug: "rag-basics", env: [envDecl()] };
    const result = resolveConfig(recipe, { OPENAI_API_KEY: "global-val" }, { OPENAI_API_KEY: "   " });

    expect(result.fields).toEqual([
      { key: "OPENAI_API_KEY", value: "global-val", source: "global", required: false },
    ]);
    expect(result.config).toEqual({ OPENAI_API_KEY: "global-val" });
  });

  it("falls through to unset when both override and global are whitespace-only", () => {
    const recipe = { slug: "rag-basics", env: [envDecl()] };
    const result = resolveConfig(recipe, { OPENAI_API_KEY: "   " }, { OPENAI_API_KEY: "  " });

    expect(result.fields).toEqual([
      { key: "OPENAI_API_KEY", value: null, source: "unset", required: false },
    ]);
    expect(result.config).toEqual({});
  });

  it("ignores an override for a key the recipe does not declare", () => {
    const recipe = { slug: "rag-basics", env: [envDecl({ key: "OPENAI_API_KEY" })] };
    const result = resolveConfig(
      recipe,
      {},
      { OPENAI_API_KEY: "val", UNDECLARED_KEY: "should-not-appear" },
    );

    expect(result.fields.map((f) => f.key)).toEqual(["OPENAI_API_KEY"]);
    expect(result.config).not.toHaveProperty("UNDECLARED_KEY");
    expect(result.fields.some((f) => f.key === "UNDECLARED_KEY")).toBe(false);
  });

  it("lists exactly the declared-required keys that resolved to nothing in missingRequired", () => {
    const recipe = {
      slug: "rag-basics",
      env: [
        envDecl({ key: "REQUIRED_MISSING", required: true }),
        envDecl({ key: "REQUIRED_PRESENT", required: true }),
        envDecl({ key: "OPTIONAL_MISSING", required: false }),
      ],
    };
    const result = resolveConfig(
      recipe,
      { REQUIRED_PRESENT: "present-val" },
      {},
    );

    expect(result.missingRequired).toEqual(["REQUIRED_MISSING"]);
  });

  it("resolves an empty recipe.env to empty config/fields/missingRequired with no error", () => {
    const recipe = { slug: "empty-recipe", env: [] };
    const result = resolveConfig(recipe, { OPENAI_API_KEY: "global-val" }, { OPENAI_API_KEY: "override-val" });

    expect(result).toEqual({ config: {}, fields: [], missingRequired: [] });
  });

  it("resolves multiple keys in mixed states independently within a single call", () => {
    const recipe = {
      slug: "mixed-recipe",
      env: [
        envDecl({ key: "OVERRIDDEN_KEY", required: false }),
        envDecl({ key: "GLOBAL_ONLY_KEY", required: false }),
        envDecl({ key: "UNSET_KEY", required: false }),
        envDecl({ key: "REQUIRED_AND_MISSING", required: true }),
      ],
    };
    const global = {
      GLOBAL_ONLY_KEY: "global-val",
      OVERRIDDEN_KEY: "global-should-be-ignored",
    };
    const overrides = {
      OVERRIDDEN_KEY: "override-val",
    };

    const result = resolveConfig(recipe, global, overrides);

    expect(result.fields).toEqual([
      { key: "OVERRIDDEN_KEY", value: "override-val", source: "override", required: false },
      { key: "GLOBAL_ONLY_KEY", value: "global-val", source: "global", required: false },
      { key: "UNSET_KEY", value: null, source: "unset", required: false },
      { key: "REQUIRED_AND_MISSING", value: null, source: "unset", required: true },
    ]);
    expect(result.config).toEqual({
      OVERRIDDEN_KEY: "override-val",
      GLOBAL_ONLY_KEY: "global-val",
    });
    expect(result.missingRequired).toEqual(["REQUIRED_AND_MISSING"]);
  });
});
