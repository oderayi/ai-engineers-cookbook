import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RunForm, type RunFormHandle } from "@/components/catalog/run-form/run-form";
import {
  catalogFixtureRecipes,
  promptBasics,
  tokensAndContext,
  embeddings101,
  hybridSearch,
} from "@/tests/fixtures/catalog/recipes";
import { compileForm, type FieldDescriptor } from "@/lib/catalog/schema-form";

beforeEach(() => {
  window.localStorage.clear();
});

describe("RunForm", () => {
  it("renders one field per compiled FieldDescriptor, across control types", () => {
    render(<RunForm recipe={tokensAndContext} />);
    // tokensAndContext: an enum field (select) + a constrained int (slider).
    expect(screen.getByLabelText("Tokenizer")).toBeInTheDocument();
    expect(screen.getByText("Max Tokens")).toBeInTheDocument();
  });

  it("renders <RecipeOverrides recipe={recipe} /> verbatim, with no adapter", () => {
    render(<RunForm recipe={embeddings101} />);
    // embeddings-101 declares OPENAI_API_KEY as an env var -- RecipeOverrides
    // renders one row per declared key, labeled by its provider.
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });

  it("the Run button starts disabled for a recipe with a required field left empty", async () => {
    render(<RunForm recipe={promptBasics} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    });
  });

  it("the Run button enables once the required field is filled", async () => {
    const user = userEvent.setup();
    render(<RunForm recipe={promptBasics} />);

    await user.type(screen.getByLabelText("Question"), "What is 2+2?");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    });
  });

  it("submitting calls onSubmit with { params, recipeSlug }", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RunForm recipe={promptBasics} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Question"), "What is 2+2?");
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        params: { question: "What is 2+2?" },
        recipeSlug: "prompt-basics",
      });
    });
  });

  it("does not crash on submit when no onSubmit prop is given (default no-op)", async () => {
    const user = userEvent.setup();
    render(<RunForm recipe={promptBasics} />);

    await user.type(screen.getByLabelText("Question"), "hi");
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run" }));
    // No assertion beyond "didn't throw" -- the point is the TODO(execution)
    // no-op path is safe to hit before execution exists.
  });

  it("exposes an imperative handle to pre-fill the form from an example's params", async () => {
    const ref = createRef<RunFormHandle>();
    render(<RunForm ref={ref} recipe={promptBasics} />);

    ref.current?.fillExample({ question: "Pre-filled question" });

    await waitFor(() => {
      expect(screen.getByLabelText("Question")).toHaveValue("Pre-filled question");
    });
  });

  it("exposes an imperative handle to focus the form's first field", () => {
    const ref = createRef<RunFormHandle>();
    render(<RunForm ref={ref} recipe={promptBasics} />);

    ref.current?.focus();

    expect(screen.getByLabelText("Question")).toHaveFocus();
  });

  it("pre-filling via the imperative handle also enables the Run button when the example is valid", async () => {
    const ref = createRef<RunFormHandle>();
    render(<RunForm ref={ref} recipe={promptBasics} />);

    ref.current?.fillExample({ question: "Pre-filled question" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    });
  });

  // Task 14's own manual-verification requirement: "the table-driven
  // fixture recipes from Task 2 each render a working form (every control
  // type appears at least once across them)". Checked two ways: (1) every
  // fixture recipe renders via RunForm with no crash, proving compileForm's
  // output is always something the field-component switch can handle; (2)
  // every one of FieldDescriptor["control"]'s 7 values is actually produced
  // by at least one fixture's compiled fields, so (1) isn't vacuously true
  // over a narrower set of controls than the run form actually needs to
  // support.
  it("renders every Task 2 fixture recipe without crashing", () => {
    for (const recipe of catalogFixtureRecipes) {
      const { unmount } = render(<RunForm recipe={recipe} />);
      unmount();
    }
  });

  it("Task 2's fixture set covers every FieldDescriptor control type at least once", () => {
    const allControls = new Set(
      catalogFixtureRecipes.flatMap((recipe) => compileForm(recipe.inputSchema).fields.map((f) => f.control)),
    );

    // "textarea" is a real control (see schema-form.ts's own header comment)
    // but is currently only reachable via a `list[str]` field -- not present
    // in every fixture, but is in `embeddings101`'s `texts` field, so it's
    // still covered without needing its own carve-out here.
    const expectedControls: FieldDescriptor["control"][] = [
      "text",
      "textarea",
      "number",
      "slider",
      "select",
      "switch",
      "files",
    ];
    for (const control of expectedControls) {
      expect(allControls.has(control)).toBe(true);
    }
  });

  it("hybridSearch's added number/switch fields (closing the coverage gap above) render correctly", () => {
    render(<RunForm recipe={hybridSearch} />);
    expect(screen.getByLabelText("Max Results")).toBeInTheDocument(); // "number" control
    expect(screen.getByRole("switch", { name: "Rerank" })).toBeInTheDocument(); // "switch" control
  });
});
