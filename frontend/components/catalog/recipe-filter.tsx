"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export interface RecipeFilterProps {
  /** Current filter text. */
  value: string;
  /** Called with the raw, untransformed value on every keystroke -- and
   * with "" when the clear button is clicked. */
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Controlled text filter for the `/` catalog index. Purely presentational:
 * it reports every keystroke's value via `onChange` and renders a clear
 * affordance, but never touches the DOM to actually filter anything --
 * substring matching over recipe titles/summaries lives in `catalog-index.tsx`
 * (a later task), which owns the `value` state and decides what to do with it.
 *
 * No debounce: every keystroke calls `onChange` immediately and
 * synchronously, so the caller always sees the exact, complete string the
 * user typed, in order, with nothing dropped or delayed. Debouncing
 * filter-as-you-type input is a common pattern, but it trades correctness
 * (the last keystroke can be lost if a caller reads `value` before a
 * delayed flush, or the component unmounts mid-debounce) for a marginal
 * perf win on what's expected to be a client-side substring match over a
 * small, in-memory recipe list -- not worth it here.
 *
 * Includes a visible "clear" (X) button inside the input, shown only when
 * `value` is non-empty, that calls `onChange("")`.
 */
function RecipeFilter({ value, onChange, className }: RecipeFilterProps) {
  const inputId = React.useId();
  const hasValue = value !== "";

  return (
    <div data-slot="recipe-filter" className={cn("relative flex items-center", className)}>
      <label htmlFor={inputId} className="sr-only">
        Search recipes
      </label>
      <Input
        id={inputId}
        type="text"
        autoComplete="off"
        placeholder="Search recipes…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(hasValue && "pr-7")}
      />
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1"
          onClick={() => onChange("")}
        >
          <XIcon />
          <span className="sr-only">Clear search</span>
        </Button>
      )}
    </div>
  );
}

export { RecipeFilter };
