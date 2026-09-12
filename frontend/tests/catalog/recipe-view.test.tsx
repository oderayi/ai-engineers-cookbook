import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecipeView, type RecipeViewHandle } from "@/app/r/[slug]/recipe-view";
import { useRecipe, useSource } from "@/hooks/use-recipes";
import { RecipeApiError } from "@/lib/api/recipes";
import { promptBasics } from "@/tests/fixtures/catalog/recipes";
import { catalogFixtureSourceBundles } from "@/tests/fixtures/catalog/source-bundles";
import type { UseQueryResult } from "@tanstack/react-query";

vi.mock("@/hooks/use-recipes", () => ({
  useRecipe: vi.fn(),
  useSource: vi.fn(),
}));

const mockNotFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

const mockUseRecipe = vi.mocked(useRecipe);
const mockUseSource = vi.mocked(useSource);

function mockResult<T>(partial: Partial<UseQueryResult<T, RecipeApiError>>): UseQueryResult<T, RecipeApiError> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    ...partial,
  } as UseQueryResult<T, RecipeApiError>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mockUseSource.mockReturnValue(mockResult({ data: catalogFixtureSourceBundles["prompt-basics"] }));
});

describe("RecipeView", () => {
  it("shows a loading state while the recipe query is pending", () => {
    mockUseRecipe.mockReturnValue(mockResult({ isPending: true, isSuccess: false }));
    render(<RecipeView slug="prompt-basics" />);
    expect(screen.getByTestId("recipe-view-loading")).toBeInTheDocument();
  });

  it("calls next/navigation's notFound() on a confirmed 404", () => {
    mockUseRecipe.mockReturnValue(
      mockResult({
        isError: true,
        isSuccess: false,
        error: new RecipeApiError("not found", 404),
      }),
    );
    render(<RecipeView slug="does-not-exist" />);
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("shows an error empty state (not notFound) for a non-404 error, e.g. a network blip", () => {
    mockUseRecipe.mockReturnValue(
      mockResult({
        isError: true,
        isSuccess: false,
        error: new RecipeApiError("network error", 0),
      }),
    );
    render(<RecipeView slug="prompt-basics" />);
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
  });

  it("renders the title, description, examples, source, and run form all at once", () => {
    mockUseRecipe.mockReturnValue(mockResult({ data: promptBasics }));
    render(<RecipeView slug="prompt-basics" />);

    // `promptBasics`' own readmeMarkdown happens to start with "# Prompt
    // Basics" too, so there are genuinely two <h1>s with this text once
    // DescriptionPanel's README section renders -- `data-testid` picks out
    // the page's own title specifically, unambiguously.
    expect(screen.getByTestId("recipe-view-title")).toHaveTextContent("Prompt Basics");
    // description-panel content
    expect(screen.getByText(promptBasics.summary)).toBeInTheDocument();
    // examples-panel content
    expect(screen.getByText("A direct question")).toBeInTheDocument();
    // source-viewer content (a tab per source file)
    expect(screen.getByRole("tab", { name: "recipe.py" })).toBeInTheDocument();
    // run-form content
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
  });

  it("browsing (description/examples/source) is never blocked by the run form's own state", () => {
    mockUseRecipe.mockReturnValue(mockResult({ data: promptBasics }));
    render(<RecipeView slug="prompt-basics" />);

    // The Run button starts disabled (required field empty) -- description/
    // examples/source must still be fully present and readable regardless.
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(promptBasics.summary)).toBeVisible();
    expect(screen.getByText("A direct question")).toBeVisible();
    expect(screen.getByRole("tab", { name: "recipe.py" })).toBeVisible();
  });

  it("clicking 'Try this example' pre-fills AND focuses the run form", async () => {
    const user = userEvent.setup();
    mockUseRecipe.mockReturnValue(mockResult({ data: promptBasics }));
    render(<RecipeView slug="prompt-basics" />);

    await user.click(screen.getByRole("button", { name: "Try this example" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Question")).toHaveValue("What is the capital of France?");
    });
    expect(screen.getByLabelText("Question")).toHaveFocus();
  });

  it("exposes an imperative handle with a documented no-op cancelRun (execution doesn't exist yet)", () => {
    const ref = createRef<RecipeViewHandle>();
    mockUseRecipe.mockReturnValue(mockResult({ data: promptBasics }));
    render(<RecipeView ref={ref} slug="prompt-basics" />);

    expect(() => ref.current?.cancelRun()).not.toThrow();
  });

  it("accepts an unused onStatusChange prop without crashing (workspace's forward-looking contract)", () => {
    mockUseRecipe.mockReturnValue(mockResult({ data: promptBasics }));
    const onStatusChange = vi.fn();
    render(<RecipeView slug="prompt-basics" onStatusChange={onStatusChange} />);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
