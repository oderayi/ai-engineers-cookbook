import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecipeOverrides, type RecipeOverridesProps } from "@/components/settings/recipe-overrides";
import { useSettings } from "@/hooks/use-settings";
import { renderHook, act } from "@testing-library/react";

beforeEach(() => {
  window.localStorage.clear();
});

const RECIPE = {
  slug: "rag-basics",
  env: [
    { key: "OPENAI_API_KEY", provider: "OpenAI", required: true, description: "OpenAI key" },
    { key: "ANTHROPIC_API_KEY", provider: "Anthropic", required: false, description: "Anthropic key" },
  ],
};

describe("RecipeOverrides", () => {
  it("renders one row per declared env key, with no value/no global shown as 'Not set'", () => {
    render(<RecipeOverrides recipe={RECIPE} />);

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getAllByText("Not set")).toHaveLength(2);
  });

  it("renders nothing for a recipe declaring no env vars", () => {
    const { container } = render(<RecipeOverrides recipe={{ slug: "no-env", env: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'Inherited from global' with a masked placeholder when only a global default is set", () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-global");
    });

    render(<RecipeOverrides recipe={RECIPE} />);

    expect(screen.getByText("Inherited from global")).toBeInTheDocument();
    const input = screen.getByLabelText("OpenAI") as HTMLInputElement;
    expect(input.value).toBe(""); // the global secret is never copied into the field
    expect(input.placeholder).toBe("••••••••");
  });

  it("typing an override flips the badge to 'Overridden' and reveals 'Reset to global'", async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-global");
    });

    render(<RecipeOverrides recipe={RECIPE} />);
    const input = screen.getByLabelText("OpenAI");

    await user.type(input, "sk-override");

    expect(screen.getByText("Overridden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to global" })).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("sk-override");
  });

  it("'Reset to global' clears the override and returns to 'Inherited from global'", async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-global");
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-override");
    });

    render(<RecipeOverrides recipe={RECIPE} />);
    expect(screen.getByText("Overridden")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to global" }));

    expect(screen.getByText("Inherited from global")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset to global" })).not.toBeInTheDocument();
    expect((screen.getByLabelText("OpenAI") as HTMLInputElement).value).toBe("");
  });

  it("'Reset to global' with no global value returns to 'Not set'", async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-override-only");
    });

    render(<RecipeOverrides recipe={RECIPE} />);
    expect(screen.getByText("Overridden")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to global" }));

    const badges = screen.getAllByText("Not set");
    expect(badges).toHaveLength(2); // both OpenAI and Anthropic rows now unset
  });

  it("show/hide toggle is independent per row", async () => {
    const user = userEvent.setup();
    render(<RecipeOverrides recipe={RECIPE} />);

    const openaiInput = screen.getByLabelText("OpenAI") as HTMLInputElement;
    const anthropicInput = screen.getByLabelText("Anthropic") as HTMLInputElement;
    expect(openaiInput.type).toBe("password");
    expect(anthropicInput.type).toBe("password");

    await user.click(screen.getAllByRole("button", { name: "Show key" })[0]);

    expect(openaiInput.type).toBe("text");
    expect(anthropicInput.type).toBe("password");
  });

  it("a required, unset field is styled distinctly from an optional, unset field", () => {
    render(<RecipeOverrides recipe={RECIPE} />);

    const badges = screen.getAllByText("Not set");
    // OPENAI_API_KEY (required: true) is listed first, ANTHROPIC_API_KEY (required: false) second.
    expect(badges[0].className).not.toEqual(badges[1].className);
  });

  it("only ever writes overrides for this recipe's own slug", async () => {
    const user = userEvent.setup();
    render(<RecipeOverrides recipe={RECIPE} />);

    await user.type(screen.getByLabelText("OpenAI"), "sk-scoped");

    const { result } = renderHook(() => useSettings());
    expect(result.current[0].overrides).toEqual({
      "rag-basics": { OPENAI_API_KEY: "sk-scoped" },
    });
  });
});

// Compile-time only: `RecipeOverridesProps["recipe"]` must be satisfied by a
// shape matching SPEC-catalog.md's `RecipeDetail` (EnvVar[] `env`, plus every
// other field a real RecipeDetail carries) with no cast. This function is
// never called — `bun run typecheck` is what actually checks it.
function _typeCheckOnly() {
  interface EnvVar {
    key: string;
    provider: string;
    required: boolean;
    description: string;
  }
  interface RecipeDetail {
    slug: string;
    title: string;
    summary: string;
    group: string;
    difficulty: "basic" | "intermediate" | "advanced";
    order: number;
    estimatedRuntimeSeconds: number;
    useCases: string[];
    readmeMarkdown: string | null;
    inputSchema: Record<string, unknown>;
    sourceFiles: { path: string; language: string }[];
    env: EnvVar[];
  }

  const recipe = {} as RecipeDetail;
  const props: RecipeOverridesProps = { recipe };
  return props;
}
void _typeCheckOnly;
