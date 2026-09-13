import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/primitives/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { listRecipes } from "@/lib/api/recipes";
import { buildNavModel } from "@/lib/catalog/nav-model";
import type { NavModel } from "@/components/shell/sidebar-nav";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skillet",
  description: "Skillet — the AI engineer's cookbook.",
};

/**
 * Without this, Next.js statically prerenders the root layout at BUILD
 * time — there is nothing else in this layout (no `cookies()`/`headers()`
 * call, no uncached `fetch`) to signal it needs per-request rendering, so
 * `fetchNav()` below would run exactly once, during `next build`, and its
 * result would be baked into the static HTML forever. Verified the hard
 * way during this task's own manual check: built once against a live
 * backend, then killed the backend and reloaded the *same already-running*
 * `next start` process — the nav still showed the backend's recipes,
 * confirming it wasn't being re-fetched. A backend that comes up after a
 * build (or the reverse — down at build time, up at runtime, as
 * `SPEC-distribution.md`'s Docker Compose setup can easily produce) would
 * otherwise show permanently stale or permanently empty nav data until the
 * next rebuild, not the graceful, live-reflecting degradation this module
 * actually needs.
 */
export const dynamic = "force-dynamic";

/**
 * Fetches the real nav tree server-side on every request. A backend that's
 * unreachable (not yet started, a dev server pointed at the wrong port, a
 * genuine outage) falls back to an empty `NavModel` rather than throwing
 * into the root layout — an empty sidebar is a valid, first-class state
 * (browsing is never gated, per SPEC-catalog.md's own boundary); a crashed
 * root layout is not. Logs the failure server-side (not swallowed
 * silently) so "backend unreachable" is distinguishable from "genuinely
 * zero recipes" when reading server logs.
 */
async function fetchNav(): Promise<NavModel> {
  try {
    const recipes = await listRecipes();
    return buildNavModel(recipes);
  } catch (error) {
    console.error("Failed to fetch the recipe catalog for the sidebar nav; rendering empty.", error);
    return { groups: [] };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nav = await fetchNav();

  return (
    <html
      lang="en"
      // next-themes mutates the `class` attribute before hydration (its
      // no-flash script) — this attribute intentionally won't match the
      // server-rendered markup, and that's expected, not a bug to fix.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <Providers>
          <ThemeProvider>
            <TooltipProvider>
              <WorkspaceShell nav={nav}>{children}</WorkspaceShell>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
