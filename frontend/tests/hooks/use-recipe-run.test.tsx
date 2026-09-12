import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useRecipeRun } from "@/hooks/use-recipe-run";
import { postRun, RunRequestError } from "@/lib/execution/run-client";
import type { RecipeEvent } from "@/lib/execution/events";

vi.mock("@/lib/execution/run-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/execution/run-client")>(
    "@/lib/execution/run-client",
  );
  return { ...actual, postRun: vi.fn() };
});

const mockPostRun = vi.mocked(postRun);

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

async function* eventsOf(events: RecipeEvent[]) {
  for (const ev of events) yield ev;
}

const STEP: RecipeEvent = { type: "step", id: "s1", name: "Thinking", status: "start", detail: null, ts: 0.1 };
const TOKEN: RecipeEvent = { type: "token", text: "hi" };
const RESULT: RecipeEvent = { type: "result", data: { ok: true }, ts: 1 };
const ERROR: RecipeEvent = {
  type: "error",
  error_type: "recipe_error",
  message: "boom",
  recoverable: false,
  ts: 1,
};

describe("useRecipeRun", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useRecipeRun("echo"));
    expect(result.current.status).toBe("idle");
    expect(result.current.events).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions idle -> running -> done on a happy-path stream, accumulating events and exposing the result", async () => {
    mockPostRun.mockReturnValue(eventsOf([STEP, TOKEN, RESULT]));
    const { result } = renderHook(() => useRecipeRun("echo"));

    act(() => {
      result.current.start({ params: {}, config: {} });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.events).toEqual([STEP, TOKEN, RESULT]);
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.error).toBeNull();
  });

  it("transitions to error on a terminal ErrorEvent, keeping partial output in events", async () => {
    mockPostRun.mockReturnValue(eventsOf([STEP, TOKEN, ERROR]));
    const { result } = renderHook(() => useRecipeRun("echo"));

    act(() => {
      result.current.start({ params: {}, config: {} });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.events).toEqual([STEP, TOKEN, ERROR]); // partial output preserved
    expect(result.current.result).toBeNull();
    expect(result.current.error).toMatchObject({
      kind: "stream",
      errorType: "recipe_error",
      message: "boom",
    });
  });

  it("classifies a 429 with a valid rate-limit body as kind 'rate_limit', not 'transport'", async () => {
    const rateLimitBody = {
      error: "rate_limited",
      scope: "trial_daily",
      message: "You've used your 2 free runs today.",
      retry_after_seconds: 34567,
      cta: "add_key",
    };
    mockPostRun.mockReturnValue(
      (async function* () {
        throw new RunRequestError("rate limited", 429, rateLimitBody);
      })(),
    );
    const { result } = renderHook(() => useRecipeRun("echo"));

    act(() => {
      result.current.start({ params: {}, config: {} });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatchObject({ kind: "rate_limit", status: 429 });
    expect(result.current.error?.rateLimit).toEqual(rateLimitBody);
  });

  it("classifies a non-429 transport failure (e.g. 422) as kind 'transport'", async () => {
    mockPostRun.mockReturnValue(
      (async function* () {
        throw new RunRequestError("bad params", 422, { detail: "invalid" });
      })(),
    );
    const { result } = renderHook(() => useRecipeRun("echo"));

    act(() => {
      result.current.start({ params: {}, config: {} });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatchObject({ kind: "transport", status: 422 });
  });

  it("cancel() aborts the in-flight run and returns to idle", async () => {
    let released: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    mockPostRun.mockReturnValue(
      (async function* () {
        yield STEP;
        await gate; // hang until the test releases it (or the signal aborts)
        yield RESULT;
      })(),
    );

    const { result } = renderHook(() => useRecipeRun("echo"));
    act(() => {
      result.current.start({ params: {}, config: {} });
    });
    await waitFor(() => expect(result.current.events).toEqual([STEP]));

    act(() => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.events).toEqual([]);

    released?.(); // let the generator finish so the test doesn't leak a pending promise
  });

  it("start() while already running cancels the previous run and starts fresh (cancel-and-restart)", async () => {
    mockPostRun.mockReturnValueOnce(eventsOf([STEP])).mockReturnValueOnce(eventsOf([TOKEN, RESULT]));

    const { result } = renderHook(() => useRecipeRun("echo"));
    act(() => {
      result.current.start({ params: {}, config: {} });
    });
    await waitFor(() => expect(result.current.events).toEqual([STEP]));

    act(() => {
      result.current.start({ params: {}, config: {} });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.events).toEqual([TOKEN, RESULT]); // fresh, not appended to the old run's
  });

  it("passes the resolved backend base URL and slug through to postRun", () => {
    mockPostRun.mockReturnValue(eventsOf([]));
    const { result } = renderHook(() => useRecipeRun("my-recipe"));

    act(() => {
      result.current.start({ params: { a: 1 }, config: { OPENAI_API_KEY: "sk-x" } });
    });

    expect(mockPostRun).toHaveBeenCalledWith(
      "http://localhost:8000",
      "my-recipe",
      { params: { a: 1 }, config: { OPENAI_API_KEY: "sk-x" } },
      expect.any(AbortSignal),
    );
  });
});
