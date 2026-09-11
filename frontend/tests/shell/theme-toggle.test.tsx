import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * jsdom has no `matchMedia`. next-themes calls it unconditionally on mount
 * (to track the OS preference for the "system" option), so it must be
 * stubbed before any render. `matches` controls what "system" resolves to.
 */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole("button", { name: /toggle theme/i });
  await user.click(trigger);
  // Base UI schedules the open state via requestAnimationFrame for
  // pointer-driven opens, so the menu doesn't appear synchronously after the
  // click resolves -- wait for it rather than asserting immediately.
  await screen.findByRole("menu");
  return trigger;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    stubMatchMedia(false); // OS preference: light, unless a test says otherwise
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.restoreAllMocks();
  });

  it("defaults to light (no .dark class) when nothing is stored", () => {
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("exposes light, dark, and system as reachable options", async () => {
    const user = userEvent.setup();
    renderToggle();
    await openMenu(user);

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitemradio", { name: /light/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: /dark/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: /system/i })
    ).toBeInTheDocument();
  });

  it("selecting Dark adds the .dark class to <html> and persists it", async () => {
    const user = userEvent.setup();
    renderToggle();
    await openMenu(user);

    await user.click(screen.getByRole("menuitemradio", { name: /dark/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("selecting Light removes the .dark class and persists it", async () => {
    const user = userEvent.setup();
    renderToggle();

    // go dark first so switching back to light is an observable change.
    // Radio items don't close the menu on selection (closeOnClick=false),
    // so it's still open afterwards -- no need to reopen it.
    await openMenu(user);
    await user.click(screen.getByRole("menuitemradio", { name: /dark/i }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    await user.click(screen.getByRole("menuitemradio", { name: /light/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("selecting System resolves against the OS preference and persists 'system'", async () => {
    stubMatchMedia(true); // OS preference: dark
    const user = userEvent.setup();
    renderToggle();
    await openMenu(user);

    await user.click(screen.getByRole("menuitemradio", { name: /system/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("is fully keyboard-operable: tab to the trigger, open and select with the keyboard", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.tab();
    const trigger = screen.getByRole("button", { name: /toggle theme/i });
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // one full cycle of keyboard interaction should have changed the theme
    await waitFor(() => {
      expect(["light", "dark", "system"]).toContain(
        localStorage.getItem("theme")
      );
    });
  });

  it("gives the trigger a visible focus ring via the shared focus-visible styles", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: /toggle theme/i });
    expect(trigger.className).toMatch(/focus-visible:ring/);
  });
});

describe("ThemeProvider no-flash mechanism", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("injects next-themes' pre-hydration script configured for class-based dark mode", () => {
    const { container } = render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );

    const script = container.querySelector("script");
    expect(script).not.toBeNull();
    // next-themes serializes [attribute, storageKey, defaultTheme, ...] into
    // the script body; assert the shell's actual configuration made it in.
    expect(script?.innerHTML).toContain("class");
    expect(script?.innerHTML).toContain("theme");
    expect(script?.innerHTML).toContain("light");
    // the script mutates classList pre-hydration -- confirms class-based
    // (not data-theme-attribute-based) toggling is what's wired up.
    expect(script?.innerHTML).toContain("classList");
  });
});
