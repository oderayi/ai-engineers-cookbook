import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useResolvedConfig } from "@/hooks/use-resolved-config";
import { useSettings } from "@/hooks/use-settings";

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

describe("useResolvedConfig", () => {
  it("returns source: 'global' for a key with a global default and no override", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-global");
    });

    const field = result.current[0].fields.find((f) => f.key === "OPENAI_API_KEY");
    expect(field).toEqual({
      key: "OPENAI_API_KEY",
      value: "sk-global",
      source: "global",
      required: true,
    });
  });

  it("returns source: 'override' when both global and an override are set", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-global");
    });
    act(() => {
      result.current[1].setOverride("rag-basics", "OPENAI_API_KEY", "sk-override");
    });

    const field = result.current[0].fields.find((f) => f.key === "OPENAI_API_KEY");
    expect(field?.source).toBe("override");
    expect(field?.value).toBe("sk-override");
  });

  it("for a recipe with no matching settings at all, returns all-unset with missingRequired, never throws", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    expect(result.current[0]).toEqual({
      config: {},
      fields: [
        { key: "OPENAI_API_KEY", value: null, source: "unset", required: true },
        { key: "ANTHROPIC_API_KEY", value: null, source: "unset", required: false },
      ],
      missingRequired: ["OPENAI_API_KEY"],
    });
  });

  it("recomputes when the underlying settings change", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    expect(result.current[0].config).toEqual({});

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-added-later");
    });

    expect(result.current[0].config).toEqual({ OPENAI_API_KEY: "sk-added-later" });
  });

  it("only ever pulls overrides for the given recipe's own slug", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    act(() => {
      result.current[1].setOverride("some-other-recipe", "OPENAI_API_KEY", "sk-not-mine");
    });

    const field = result.current[0].fields.find((f) => f.key === "OPENAI_API_KEY");
    expect(field?.source).toBe("unset");
  });

  it("exposes the same settings + actions as useSettings, for a single source of truth", () => {
    const { result } = renderHook(() => useResolvedConfig(RECIPE));

    act(() => {
      result.current[1].setGlobalKey("OPENAI_API_KEY", "sk-shared");
    });

    const { result: settingsResult } = renderHook(() => useSettings());
    expect(settingsResult.current[0].global).toEqual({ OPENAI_API_KEY: "sk-shared" });
  });
});
