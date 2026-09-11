"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper around next-themes' `ThemeProvider`, pinned to the shell's
 * theming contract (see `docs/SPEC-app-shell.md`, Confirmed Decision 7):
 *
 * - `attribute="class"` — dark mode is triggered by the `.dark` class on
 *   `<html>`, matching shadcn's generated `globals.css`. NOT `data-theme`.
 * - `defaultTheme="light"` — when nothing is stored yet, the app opens in
 *   light mode (not "system"). "system" is still a choice the learner can
 *   make explicitly.
 * - `enableSystem` — keeps "system" selectable via `useTheme()`.
 * - `disableTransitionOnChange` — suppresses CSS transitions while the
 *   `.dark` class flips, so a theme switch doesn't animate every themed
 *   surface at once.
 *
 * No-flash: next-themes injects its own pre-hydration `<script>` (see its
 * source) that reads `localStorage` and sets the `.dark` class before first
 * paint. Nothing needs to be hand-written here for that.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
