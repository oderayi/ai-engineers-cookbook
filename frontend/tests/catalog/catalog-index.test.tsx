import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CatalogIndex } from "@/components/catalog/catalog-index";
import { useRecipes } from "@/hooks/use-recipes";
import { catalogFixtureSummaries } from "@/tests/fixtures/catalog/summaries";
import type { RecipeApiError } from "@/lib/api/recipes";
import type { RecipeSummary } from "@/lib/api/models";
import type { UseQueryResult } from "@tanstack/react-query";

vi.mock("@/hooks/use-recipes", () => ({
  useRecipes: vi.fn(),
}));

const mockUseRecipes = vi.mocked(useRecipes);

function mockResult(
  partial: Partial<UseQueryResult<RecipeSummary[], RecipeApiError>>,
): UseQueryResult<RecipeSummary[], RecipeApiError> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    ...partial,
  } as UseQueryResult<RecipeSummary[], RecipeApiError>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("CatalogIndex", () => {
  it("shows a loading state while the query is pending", () => {
    mockUseRecipes.mockReturnValue(mockResult({ isPending: true, isSuccess: false }));
    render(<CatalogIndex />);
    expect(screen.getByTestId("catalog-index-loading")).toBeInTheDocument();
  });

  it("shows an error empty state when the query fails", () => {
    mockUseRecipes.mockReturnValue(
      mockResult({ isError: true, isSuccess: false, error: new Error("boom") as RecipeApiError }),
    );
    render(<CatalogIndex />);
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
  });

  it("shows a sensible empty state for zero recipes, not an error", () => {
    mockUseRecipes.mockReturnValue(mockResult({ data: [] }));
    render(<CatalogIndex />);
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
  });

  it("renders groups and recipes from the fetched summaries, each linking to /r/[slug]", () => {
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);

    expect(screen.getByRole("heading", { name: "Fundamentals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG" })).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Prompt Basics/i });
    expect(link).toHaveAttribute("href", "/r/prompt-basics");
  });

  it("renders a difficulty badge per recipe", () => {
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);

    const advancedBadges = screen.getAllByText("Advanced");
    expect(advancedBadges.length).toBeGreaterThan(0);
  });

  it("typing in the filter narrows the list to matching titles/summaries", async () => {
    const user = userEvent.setup();
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);

    await user.type(screen.getByRole("textbox", { name: /search recipes/i }), "embeddings");

    expect(screen.getByRole("link", { name: /Embeddings 101/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Prompt Basics/i })).not.toBeInTheDocument();
  });

  it("shows a 'no matches' empty state (not the zero-recipes one) when the filter matches nothing", async () => {
    const user = userEvent.setup();
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);

    await user.type(screen.getByRole("textbox", { name: /search recipes/i }), "nonexistent-xyz");

    expect(screen.getByText(/no recipes match/i)).toBeInTheDocument();
  });

  it("filter matches on summary text too, not just title", async () => {
    const user = userEvent.setup();
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);

    // "hybridSearch"'s summary mentions "keyword" -- not in its title.
    await user.type(screen.getByRole("textbox", { name: /search recipes/i }), "keyword");

    expect(screen.getByRole("link", { name: /Hybrid Search/i })).toBeInTheDocument();
  });

  it("renders the intro banner", () => {
    mockUseRecipes.mockReturnValue(mockResult({ data: catalogFixtureSummaries }));
    render(<CatalogIndex />);
    expect(screen.getByText(/runnable recipes/i)).toBeInTheDocument();
  });
});
