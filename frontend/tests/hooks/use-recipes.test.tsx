import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipe, useRecipes, useSource } from "@/hooks/use-recipes";

import { promptBasics, tokensAndContext } from "../fixtures/catalog/recipes";
import { catalogFixtureSourceBundles } from "../fixtures/catalog/source-bundles";
import { catalogFixtureSummaries } from "../fixtures/catalog/summaries";

const BACKEND_URL = "http://localhost:8000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Fresh, retry-free QueryClient per test so failures resolve immediately. */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRecipes", () => {
  it("fetches /recipes and resolves with the parsed summaries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(catalogFixtureSummaries));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipes(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(catalogFixtureSummaries);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes`, { method: "GET" });
  });

  it("surfaces a catchable error on failure rather than throwing during render", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipes(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(500);
  });

  it("uses the stable queryKey ['recipes']", async () => {
    fetchMock.mockResolvedValue(jsonResponse(catalogFixtureSummaries));
    const { Wrapper, queryClient } = createWrapper();

    const { result, rerender } = renderHook(() => useRecipes(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender();
    rerender();

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual([["recipes"]]);
    // Re-renders with no argument change never triggered a second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useRecipe", () => {
  it("fetches /recipes/{slug} and resolves with the parsed detail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(promptBasics));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipe("prompt-basics"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(promptBasics);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes/prompt-basics`, {
      method: "GET",
    });
  });

  it("surfaces status 404 distinguishably on an unknown slug", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipe("does-not-exist"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(404);
  });

  it("keeps queryKey stable across re-renders with the same slug (no refetch)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(promptBasics));
    const { Wrapper, queryClient } = createWrapper();

    const { result, rerender } = renderHook(({ slug }: { slug: string }) => useRecipe(slug), {
      wrapper: Wrapper,
      initialProps: { slug: "prompt-basics" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ slug: "prompt-basics" });
    rerender({ slug: "prompt-basics" });

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual([["recipes", "prompt-basics"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("changes queryKey (and refetches) when slug changes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(promptBasics))
      .mockResolvedValueOnce(jsonResponse(tokensAndContext));
    const { Wrapper, queryClient } = createWrapper();

    const { result, rerender } = renderHook(({ slug }: { slug: string }) => useRecipe(slug), {
      wrapper: Wrapper,
      initialProps: { slug: "prompt-basics" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(promptBasics);

    rerender({ slug: "tokens-and-context" });
    await waitFor(() => expect(result.current.data).toEqual(tokensAndContext));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["recipes", "prompt-basics"],
        ["recipes", "tokens-and-context"],
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useSource", () => {
  it("fetches /recipes/{slug}/source and resolves with the parsed bundle", async () => {
    const bundle = catalogFixtureSourceBundles["prompt-basics"];
    fetchMock.mockResolvedValueOnce(jsonResponse(bundle));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useSource("prompt-basics"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(bundle);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/recipes/prompt-basics/source`, {
      method: "GET",
    });
  });

  it("uses the stable queryKey ['recipes', slug, 'source'], distinct from useRecipe's", async () => {
    const bundle = catalogFixtureSourceBundles["prompt-basics"];
    fetchMock.mockResolvedValue(jsonResponse(bundle));
    const { Wrapper, queryClient } = createWrapper();

    const { result, rerender } = renderHook(() => useSource("prompt-basics"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender();

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual([["recipes", "prompt-basics", "source"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
