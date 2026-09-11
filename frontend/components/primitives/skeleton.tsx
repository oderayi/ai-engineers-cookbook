import * as React from "react";

import { Skeleton as SkeletonPrimitive } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

interface SkeletonProps extends React.ComponentProps<"div"> {
  /** Width of the placeholder block. A number is treated as pixels. */
  width?: number | string;
  /** Height of the placeholder block. A number is treated as pixels. */
  height?: number | string;
}

function toDimension(value: number | string | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Loading placeholder. Thin wrapper around `components/ui/skeleton.tsx`.
 *
 * Sizing: pass `width`/`height` (numbers are treated as px, strings are used
 * verbatim, e.g. `"50%"` or `"1rem"`) for cases where the block's size is
 * data-driven; otherwise just size it with Tailwind utilities via
 * `className` (e.g. `className="h-4 w-32"`), the more idiomatic path for
 * static skeletons.
 */
function Skeleton({ width, height, className, style, ...props }: SkeletonProps) {
  return (
    <SkeletonPrimitive
      className={cn(className)}
      style={{
        width: toDimension(width),
        height: toDimension(height),
        ...style,
      }}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonProps };
