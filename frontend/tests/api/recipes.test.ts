import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRecipe, getSource, listRecipes, RecipeApiError } from "@/lib/api/recipes";

import { catalogFixtureRecipes, promptBasics } from "../fixtures/catalog/recipes";
import { catalogFixtureSourceBundles } from "../fixtures/catalog/source-bundles";
import { catalogFixtureSummaries } from "../fixtures/catalog/summaries";

const BACKEND_URL = "http://localhost:8000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listRecipes", () => {
  it("GETs /recipes and parses a 2xx body into RecipeSummary[]", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(catalogFixtureSummaries));

    const result = await listRecipes();

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes`, { method: "GET" });
    expect(result).toEqual(catalogFixtureSummaries);
  });

  it("throws a RecipeApiError with the right status on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500));

    let caught: unknown;
    try {
      await listRecipes();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect((caught as RecipeApiError).status).toBe(500);
  });

  it("throws a RecipeApiError, not a raw ZodError, on a malformed 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ slug: "missing-everything-else" }]));

    let caught: unknown;
    try {
      await listRecipes();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect(caught).not.toHaveProperty("issues"); // a raw ZodError would
    expect((caught as RecipeApiError).status).toBe(200);
  });

  it("throws a RecipeApiError on a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    let caught: unknown;
    try {
      await listRecipes();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect((caught as RecipeApiError).status).toBe(0);
  });
});

describe("getRecipe", () => {
  it("GETs /recipes/{slug} and parses a 2xx body into RecipeDetail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(promptBasics));

    const result = await getRecipe("prompt-basics");

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes/prompt-basics`, {
      method: "GET",
    });
    expect(result).toEqual(promptBasics);
  });

  it("encodes the slug into the URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(promptBasics));

    await getRecipe("weird/slug value");

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/recipes/${encodeURIComponent("weird/slug value")}`,
      { method: "GET" },
    );
  });

  it("throws a RecipeApiError with status 404 on an unknown slug, distinguishable from other statuses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));

    let caught: unknown;
    try {
      await getRecipe("does-not-exist");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect((caught as RecipeApiError).status).toBe(404);
  });

  it("throws a RecipeApiError with status 500 for a server error, distinct from 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500));

    let caught: unknown;
    try {
      await getRecipe("prompt-basics");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect((caught as RecipeApiError).status).toBe(500);
    expect((caught as RecipeApiError).status).not.toBe(404);
  });

  it("throws a RecipeApiError, not a raw ZodError, on a malformed 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ slug: "incomplete" }));

    let caught: unknown;
    try {
      await getRecipe("incomplete");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect(caught).not.toHaveProperty("issues");
  });
});

describe("getSource", () => {
  it("GETs /recipes/{slug}/source and parses a 2xx body into SourceBundle", async () => {
    const bundle = catalogFixtureSourceBundles["prompt-basics"];
    fetchMock.mockResolvedValueOnce(jsonResponse(bundle));

    const result = await getSource("prompt-basics");

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes/prompt-basics/source`, {
      method: "GET",
    });
    expect(result).toEqual(bundle);
  });

  it("throws a RecipeApiError with status 404 on an unknown slug", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));

    let caught: unknown;
    try {
      await getSource("does-not-exist");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect((caught as RecipeApiError).status).toBe(404);
  });

  it("throws a RecipeApiError, not a raw ZodError, on a malformed 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ files: "not-an-array" }));

    let caught: unknown;
    try {
      await getSource("prompt-basics");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RecipeApiError);
    expect(caught).not.toHaveProperty("issues");
  });
});

describe("catalogFixtureRecipes sanity", () => {
  it("has at least one fixture usable for the above tests", () => {
    expect(catalogFixtureRecipes.length).toBeGreaterThan(0);
  });
});
