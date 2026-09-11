"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

/**
 * Interaction pattern: a dropdown (Base UI menu, radio-group semantics)
 * listing Light / Dark / System as three explicit, individually selectable
 * options, rather than a button that cycles through them.
 *
 * A cycling button can only ever announce the *next* state, which makes
 * "system" hard to communicate (you can't tell whether you're currently
 * following the OS or pinned to light/dark). A radio-group dropdown lets
 * every state be labelled and checked (`role="menuitemradio"`,
 * `aria-checked`) at once, and all three states stay reachable via the
 * keyboard: Tab to the trigger, Enter/Space to open, Arrow keys to move,
 * Enter/Space to select.
 *
 * Focus ring: the trigger renders through the shared `Button` primitive,
 * which already carries `focus-visible:ring-3 focus-visible:ring-ring/50`
 * from `buttonVariants` -- verified (not assumed) in
 * `tests/shell/theme-toggle.test.tsx`.
 */

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

type ThemeValue = (typeof THEME_OPTIONS)[number]["value"];

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  // Avoid a hydration mismatch: `theme` reflects localStorage, which only
  // exists on the client, so the first client render must still match the
  // server's. `useSyncExternalStore` (no subscription needed -- it never
  // changes after mount) reports `false` for that first render/hydration and
  // `true` afterwards, without the extra render-then-setState an effect
  // would add.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const current: ThemeValue = mounted ? ((theme as ThemeValue) ?? "light") : "light";
  const ActiveIcon =
    THEME_OPTIONS.find((option) => option.value === current)?.icon ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={cn(className)}
            aria-label="Toggle theme"
          />
        }
      >
        <ActiveIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => setTheme(value as ThemeValue)}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
