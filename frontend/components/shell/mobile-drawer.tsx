"use client";

import type { ReactElement, ReactNode } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export interface MobileDrawerProps {
  /**
   * What to render inside the drawer panel — the sidebar nav content once
   * `sidebar.tsx` (Task 8) composes this in. Opaque to this component.
   */
  children: ReactNode;
  /**
   * A fully-formed custom trigger element (its own type, props, and
   * children are preserved — the Dialog's open/keyboard/ARIA behavior is
   * merged onto it). Defaults to a ghost icon button with lucide-react's
   * `Menu` glyph, labelled by `triggerLabel`. A custom trigger is
   * responsible for its own focus-visible styling.
   */
  trigger?: ReactElement;
  /** Accessible name for the default trigger button. Ignored when `trigger` is supplied. */
  triggerLabel?: string;
  /** Visually-hidden dialog title — Base UI's Dialog requires an accessible name. */
  title?: string;
  /**
   * Controlled open state. Both `open` and `onOpenChange` are optional:
   * omit them and the underlying Base UI `Dialog.Root` manages its own
   * (uncontrolled) open/close state, which is all a standalone drawer
   * needs. Pass both when a caller needs to drive the drawer from the
   * outside — e.g. Task 8's sidebar closing it after a nav link is
   * clicked.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function MobileDrawer({
  children,
  trigger,
  triggerLabel = "Open menu",
  title = "Navigation",
  open,
  onOpenChange,
  className,
}: MobileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <SheetTrigger render={trigger} />
      ) : (
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label={triggerLabel} />}>
          <Menu aria-hidden="true" className="size-5" />
        </SheetTrigger>
      )}
      <SheetContent side="left" className={cn("w-3/4 max-w-xs gap-0 p-4", className)}>
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
