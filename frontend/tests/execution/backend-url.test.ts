import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useBackendBaseUrl } from "@/lib/execution/backend-url";
import { useSettings } from "@/hooks/use-settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useBackendBaseUrl", () => {
  it("falls back to the default backend URL when settings.customBackendUrl is empty", () => {
    const { result } = renderHook(() => useBackendBaseUrl());
    expect(result.current).toBe("http://localhost:8000");
  });

  it("uses settings.customBackendUrl when the learner has set one", () => {
    const { result: settingsResult } = renderHook(() => useSettings());
    settingsResult.current[1].setBackendUrl("https://my-self-hosted-backend.example.com");

    const { result } = renderHook(() => useBackendBaseUrl());
    expect(result.current).toBe("https://my-self-hosted-backend.example.com");
  });

  it("falls back to the default again once customBackendUrl is cleared", () => {
    const { result: settingsResult } = renderHook(() => useSettings());
    settingsResult.current[1].setBackendUrl("https://custom.example.com");
    settingsResult.current[1].setBackendUrl("");

    const { result } = renderHook(() => useBackendBaseUrl());
    expect(result.current).toBe("http://localhost:8000");
  });
});
