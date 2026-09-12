import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSettings } from "@/hooks/use-settings";
import { STORAGE_KEY } from "@/lib/settings/storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSettings", () => {
  it("returns emptySettings() when nothing is stored", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current[0]).toEqual({
      version: 1,
      global: {},
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("hydrates an existing valid stored blob on mount", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        global: { OPENAI_API_KEY: "sk-stored" },
        customBackendUrl: "https://api.example.com",
        overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
      }),
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current[0]).toEqual({
      version: 1,
      global: { OPENAI_API_KEY: "sk-stored" },
      customBackendUrl: "https://api.example.com",
      overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
    });
  });

  it("falls back to emptySettings() for a malformed stored blob, without crashing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useSettings());

    expect(result.current[0]).toEqual({
      version: 1,
      global: {},
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("falls back to emptySettings() for a schema-invalid stored blob", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, global: { "bad-key": "x" } }));

    const { result } = renderHook(() => useSettings());

    expect(result.current[0].global).toEqual({});
  });

  it("migrates a legacy/unversioned stored blob, preserving its values", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ global: { OPENAI_API_KEY: "sk-legacy" } }),
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current[0]).toEqual({
      version: 1,
      global: { OPENAI_API_KEY: "sk-legacy" },
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("setGlobalKey sets a global key and persists it", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-new");
    });

    expect(result.current[0].global).toEqual({ OPENAI_API_KEY: "sk-new" });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}").global).toEqual({
      OPENAI_API_KEY: "sk-new",
    });
  });

  it("setBackendUrl sets the custom backend URL", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setBackendUrl("https://api.example.com");
    });

    expect(result.current[0].customBackendUrl).toBe("https://api.example.com");
  });

  it("setOverride sets a per-recipe override without disturbing other keys on the same recipe", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-override");
    });
    act(() => {
      result.current[1].setOverride("rag-basics", "ANTHROPIC_API_KEY", "sk-anthropic");
    });

    expect(result.current[0].overrides).toEqual({
      "rag-basics": { OPENAI_API_KEY: "sk-override", ANTHROPIC_API_KEY: "sk-anthropic" },
    });
  });

  it("setOverride does not disturb a different recipe's overrides", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-rag");
    });
    act(() => {
      result.current[1].setOverride("agents-101", "OPENAI_API_KEY", "sk-agents");
    });

    expect(result.current[0].overrides).toEqual({
      "rag-basics": { OPENAI_API_KEY: "sk-rag" },
      "agents-101": { OPENAI_API_KEY: "sk-agents" },
    });
  });

  it("clearOverride removes just that key, preserving sibling keys on the same recipe", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-override");
    });
    act(() => {
      result.current[1].setOverride("rag-basics", "ANTHROPIC_API_KEY", "sk-anthropic");
    });
    act(() => {
      result.current[1].clearOverride("rag-basics", "OPENAI_API_KEY");
    });

    expect(result.current[0].overrides).toEqual({
      "rag-basics": { ANTHROPIC_API_KEY: "sk-anthropic" },
    });
  });

  it("clearOverride on a recipe with no overrides at all does not crash", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].clearOverride("never-touched", "OPENAI_API_KEY");
    });

    expect(result.current[0].overrides).toEqual({ "never-touched": {} });
  });

  it("clearAll resets to emptySettings() and removes the stored blob", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-new");
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => {
      result.current[1].clearAll();
    });

    expect(result.current[0]).toEqual({
      version: 1,
      global: {},
      customBackendUrl: "",
      overrides: {},
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
