"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocalStorageBoolean } from "@/hooks/use-local-storage-boolean";
import { cn } from "@/lib/cn";

/**
 * localStorage key for whether the catalog intro banner has been dismissed.
 * Namespaced under `skillet.catalog.*` so it reads unambiguously alongside
 * any other per-feature UI flags that land in localStorage later.
 */
export const INTRO_BANNER_STORAGE_KEY = "skillet.catalog.intro-dismissed";

export interface IntroBannerProps {
  className?: string;
}

/**
 * Dismissible one-line intro banner shown at the top of the `/` catalog
 * index. Resolves app-shell's open question 2 (no separate marketing hero
 * for v1) by giving the index page a single, low-commitment line of context
 * instead.
 *
 * Owns its own dismissed/not-dismissed state via `useLocalStorageBoolean`
 * (reused as-is, not forked) so callers don't need to lift or control it.
 */
export function IntroBanner({ className }: IntroBannerProps) {
  const [dismissed, setDismissed] = useLocalStorageBoolean(INTRO_BANNER_STORAGE_KEY, false);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground",
        className
      )}
    >
      <p>
        Skillet teaches AI engineering concepts through short, runnable recipes you can read and
        execute end to end.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
