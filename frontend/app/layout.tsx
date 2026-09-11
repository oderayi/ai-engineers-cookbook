import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Shell } from "@/components/shell/shell";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/primitives/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// Temporary: there is no `catalog` module yet to supply a real NavModel.
// This fixture is what "built and reviewed against fixture data before any
// backend exists" (SPEC-app-shell.md success criterion 6) means in practice.
// Replace with real data once `catalog` exists — nothing else in Shell needs
// to change when that happens, since Shell only ever renders the NavModel
// it's handed.
import { navTreeFixture } from "@/tests/fixtures/nav-tree";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
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
        <ThemeProvider>
          <TooltipProvider>
            <Shell nav={navTreeFixture}>{children}</Shell>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
