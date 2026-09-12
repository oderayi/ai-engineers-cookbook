import { describe, expect, it } from "vitest";

import {
  EnvVar,
  Example,
  RecipeDetail,
  RecipeSummary,
  SourceBundle,
  SourceFileRef,
} from "@/lib/api/models";
import type { RecipeEnvDecl } from "@/lib/settings/types";
import type { RecipeOverridesProps } from "@/components/settings/recipe-overrides";

const ENV_VAR = {
  key: "OPENAI_API_KEY",
  provider: "OpenAI",
  required: true,
  description: "OpenAI key",
};

const EXAMPLE = {
  title: "Basic question",
  summary: "Ask a simple question",
  expect: "A short, direct answer",
  params: { question: "What is 2+2?" },
};

const MINIMAL_DETAIL = {
  slug: "echo",
  title: "Echo",
  summary: "Echoes input back",
  group: "demo",
  groupTitle: "Demo",
  groupIcon: null,
  difficulty: "basic",
  order: 10,
  estimatedRuntimeSeconds: 1,
  useCases: ["Learn the basics"],
  readmeMarkdown: null,
  examples: [EXAMPLE],
  inputSchema: { type: "object", properties: {} },
  sourceFiles: [{ path: "recipe.py", language: "python" }],
  env: [ENV_VAR],
};

describe("EnvVar", () => {
  it("parses a valid env var", () => {
    expect(EnvVar.parse(ENV_VAR)).toEqual(ENV_VAR);
  });
});

describe("Example", () => {
  it("parses a valid example", () => {
    expect(Example.parse(EXAMPLE)).toEqual(EXAMPLE);
  });

  it("accepts arbitrary params value types", () => {
    const parsed = Example.parse({ ...EXAMPLE, params: { n: 1, flag: true, nested: { a: 1 } } });
    expect(parsed.params).toEqual({ n: 1, flag: true, nested: { a: 1 } });
  });
});

describe("SourceFileRef / SourceBundle", () => {
  it("parses a source file ref", () => {
    expect(SourceFileRef.parse({ path: "recipe.py", language: "python" })).toEqual({
      path: "recipe.py",
      language: "python",
    });
  });

  it("parses a full source bundle", () => {
    const bundle = {
      files: [{ path: "recipe.py", language: "python", text: "print(1)", sha256: "abc123" }],
      bundleSha256: "def456",
    };
    expect(SourceBundle.parse(bundle)).toEqual(bundle);
  });
});

describe("RecipeSummary", () => {
  it("parses a minimal valid summary, including group metadata", () => {
    const summary = {
      slug: "echo",
      title: "Echo",
      summary: "Echoes input back",
      group: "demo",
      groupTitle: "Demo",
      groupIcon: null,
      difficulty: "basic",
      order: 10,
      estimatedRuntimeSeconds: 1,
    };
    expect(RecipeSummary.parse(summary)).toEqual(summary);
  });

  it("accepts a real group icon string", () => {
    const parsed = RecipeSummary.parse({
      slug: "echo",
      title: "Echo",
      summary: "...",
      group: "demo",
      groupTitle: "Demo",
      groupIcon: "flask-conical",
      difficulty: "basic",
      order: 10,
      estimatedRuntimeSeconds: 1,
    });
    expect(parsed.groupIcon).toBe("flask-conical");
  });

  it("rejects an invalid difficulty", () => {
    expect(() =>
      RecipeSummary.parse({
        slug: "echo",
        title: "Echo",
        summary: "...",
        group: "demo",
        groupTitle: "Demo",
        groupIcon: null,
        difficulty: "expert", // not in the enum
        order: 10,
        estimatedRuntimeSeconds: 1,
      }),
    ).toThrow();
  });
});

describe("RecipeDetail", () => {
  it("parses a minimal valid detail", () => {
    expect(RecipeDetail.parse(MINIMAL_DETAIL)).toEqual(MINIMAL_DETAIL);
  });

  it("accepts a nullable readmeMarkdown and groupIcon", () => {
    const parsed = RecipeDetail.parse({
      ...MINIMAL_DETAIL,
      readmeMarkdown: "# Hello",
      groupIcon: "flask-conical",
    });
    expect(parsed.readmeMarkdown).toBe("# Hello");
    expect(parsed.groupIcon).toBe("flask-conical");
  });

  it("accepts zero examples and zero env vars", () => {
    const parsed = RecipeDetail.parse({ ...MINIMAL_DETAIL, examples: [], env: [] });
    expect(parsed.examples).toEqual([]);
    expect(parsed.env).toEqual([]);
  });

  it("rejects a detail missing a required field", () => {
    const withoutSlug: Record<string, unknown> = { ...MINIMAL_DETAIL };
    delete withoutSlug.slug;
    expect(() => RecipeDetail.parse(withoutSlug)).toThrow();
  });

  // Compile-time only: a real RecipeDetail must be assignable to
  // RecipeOverridesProps["recipe"] with no cast — the whole point of
  // settings' RecipeEnvDecl being structurally, not nominally, typed.
  // `bun run typecheck` is what actually checks this function; it is
  // never called at runtime.
  it("type-checks as structurally assignable to RecipeOverridesProps (compile-time only)", () => {
    function _typeCheckOnly(detail: RecipeDetail) {
      const envDecls: RecipeEnvDecl[] = detail.env; // EnvVar[] -> RecipeEnvDecl[], no cast
      // A real RecipeDetail (with many more fields than {slug, env}) is
      // still directly assignable here -- excess-property checks only
      // apply to object literals, not to a variable already typed as the
      // wider RecipeDetail -- matching how run-form.tsx actually mounts
      // this: <RecipeOverrides recipe={recipe} /> with the whole detail.
      const props: RecipeOverridesProps = { recipe: detail };
      return { props, envDecls };
    }
    void _typeCheckOnly;
    expect(true).toBe(true);
  });
});
