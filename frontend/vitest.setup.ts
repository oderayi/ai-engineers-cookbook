import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Testing Library's automatic afterEach(cleanup) only self-registers when
// Vitest's `globals: true`. This config runs with `globals: false` (explicit
// imports everywhere), so it has to be wired up by hand — otherwise a render
// from one test leaks into the next test in the same file. Multiple parallel
// app-shell tracks hit this independently before it was centralized here.
afterEach(() => {
  cleanup();
});

// jsdom has no `window.matchMedia` implementation. next-themes (and sonner,
// which reads next-themes' resolved theme) call it unconditionally on mount
// to resolve "system" — without a stub, any component that touches theming
// throws in tests. A minimal stub is enough; no test here asserts on actual
// media-query matching (that needs a real browser — see Playwright/E2E).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
