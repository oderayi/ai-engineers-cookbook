import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLocalStorage } from "@/hooks/use-local-storage";

const parse = (raw: string): string => JSON.parse(raw) as string;

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useLocalStorage", () => {
  // No separate "fallback, then hydrate" render pass: `useSyncExternalStore`
  // reads the real value via `getSnapshot` on the very first client render
  // (there's no jsdom equivalent of an actual server-render pass for
  // `getServerSnapshot` to matter here — the same reasoning applies to
  // `useLocalStorageBoolean`'s own tests, which don't attempt to exercise
  // it either). SSR-safety instead means: `getServerSnapshot` exists and
  // returns `fallback`, so a *real* server render (via `react-dom/server`,
  // not exercised by this component-level test) never touches `window`.
  it("reads an already-stored value immediately on the first render, with no fallback flash", () => {
    window.localStorage.setItem("existing.key", JSON.stringify("stored-value"));

    const { result } = renderHook(() => useLocalStorage("existing.key", "fallback", parse));

    expect(result.current[0]).toBe("stored-value");
  });

  it("keeps the fallback when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage("missing.key", "fallback", parse));
    expect(result.current[0]).toBe("fallback");
  });

  it("reads and deserializes an existing stored value via the caller-supplied parse function", () => {
    window.localStorage.setItem("read.key", JSON.stringify("hello"));
    const parseSpy = vi.fn(parse);

    const { result } = renderHook(() => useLocalStorage("read.key", "fallback", parseSpy));

    expect(result.current[0]).toBe("hello");
    expect(parseSpy).toHaveBeenCalledWith(JSON.stringify("hello"));
  });

  it("keeps the fallback and does not crash when localStorage.getItem throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });

    const { result } = renderHook(() => useLocalStorage("throwing.key", "fallback", parse));

    expect(result.current[0]).toBe("fallback");
  });

  it("persists a written value and supports a functional updater", () => {
    const { result } = renderHook(() => useLocalStorage("write.key", "fallback", parse));

    act(() => {
      result.current[1]("first");
    });
    expect(result.current[0]).toBe("first");
    expect(window.localStorage.getItem("write.key")).toBe(JSON.stringify("first"));

    act(() => {
      result.current[1]((prev) => `${prev}-second`);
    });
    expect(result.current[0]).toBe("first-second");
    expect(window.localStorage.getItem("write.key")).toBe(JSON.stringify("first-second"));
  });

  it("updates the in-memory value even when localStorage.setItem throws", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    const { result } = renderHook(() => useLocalStorage("write-fail.key", "fallback", parse));

    act(() => {
      result.current[1]("new-value");
    });

    expect(result.current[0]).toBe("new-value");
  });

  it("clear() removes the stored item and resets state to fallback", () => {
    const { result } = renderHook(() => useLocalStorage("clear.key", "fallback", parse));

    act(() => {
      result.current[1]("something");
    });
    expect(window.localStorage.getItem("clear.key")).not.toBeNull();

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe("fallback");
    expect(window.localStorage.getItem("clear.key")).toBeNull();
  });

  it("does not crash when clear()'s removeItem throws", () => {
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useLocalStorage("clear-fail.key", "fallback", parse));

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe("fallback");
  });

  it("updates the value when a storage event fires for the same key, using the parse function", () => {
    const parseSpy = vi.fn(parse);
    const { result } = renderHook(() => useLocalStorage("sync.key", "fallback", parseSpy));

    // In a real browser the `storage` event only fires *after* the other
    // tab's write has already landed in this origin's localStorage — jsdom's
    // synthetic dispatch doesn't do that write for us, so it's done by hand
    // here to match reality. The hook re-reads via `getSnapshot` rather than
    // trusting `event.newValue` directly, which is what actually makes this
    // realistic setup necessary.
    window.localStorage.setItem("sync.key", JSON.stringify("from-other-tab"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "sync.key",
          newValue: JSON.stringify("from-other-tab"),
        }),
      );
    });

    expect(result.current[0]).toBe("from-other-tab");
    expect(parseSpy).toHaveBeenCalledWith(JSON.stringify("from-other-tab"));
  });

  it("resets to fallback when a storage event reports the key was removed elsewhere", () => {
    const { result } = renderHook(() => useLocalStorage("removed.key", "fallback", parse));

    act(() => {
      result.current[1]("was-set");
    });
    expect(result.current[0]).toBe("was-set");

    // Mirror the other tab's removal in this origin's localStorage before
    // dispatching, for the same reason as above.
    window.localStorage.removeItem("removed.key");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "removed.key", newValue: null }));
    });

    expect(result.current[0]).toBe("fallback");
  });

  it("ignores a storage event for a different key", () => {
    const { result } = renderHook(() => useLocalStorage("mine.key", "fallback", parse));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "someone-elses.key",
          newValue: JSON.stringify("ignored"),
        }),
      );
    });

    expect(result.current[0]).toBe("fallback");
  });
});
