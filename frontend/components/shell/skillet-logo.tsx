import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The Skillet mark, icon-only: a frying pan, drawn `currentColor` so it
 * picks up whatever text color its container sets (the brand accent here
 * via `SkilletLogo`'s own `text-primary`, but reusable anywhere at any
 * color/size). Same drawing as `public/brand/skillet-mark.svg` -- the
 * single source of truth also rasterized into the static favicon/PWA
 * icons (`scripts/generate-icons.py`) -- kept inline here (not an `<img>`
 * pointing at that file) so it can inherit color/size like every other
 * icon in this app instead of needing its own per-color asset variant.
 */
export function SkilletMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="10" cy="14" r="6.5" />
      <path d="M14.6 9.4 20.5 3.5" />
      <path d="M7.5 13.5c.6-1 1.7-1.5 2.5-1.5s1.9.5 2.5 1.5" />
    </svg>
  );
}

export interface SkilletLogoProps {
  /**
   * Hides the "Skillet" wordmark, showing just the mark -- for the
   * collapsed sidebar rail (`sidebar.tsx`'s `collapsed` state), where the
   * whole rail narrows to icon width and there's no room for text.
   */
  collapsed?: boolean;
  className?: string;
}

/**
 * The one clickable "Skillet" identity, linking home (`/`, the catalog
 * index) -- the standard "click the logo to go home" convention. A single
 * `aria-label` on the link itself is the accessible name (not the visible
 * "Skillet" text span, which would otherwise double-announce alongside
 * it) -- the inner mark stays `aria-hidden` accordingly.
 */
export function SkilletLogo({ collapsed = false, className }: SkilletLogoProps) {
  return (
    <Link
      href="/"
      aria-label="Skillet — home"
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors",
        "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        className
      )}
    >
      <SkilletMark className="size-6 shrink-0 text-primary" />
      {!collapsed && (
        <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
          Skillet
        </span>
      )}
    </Link>
  );
}
