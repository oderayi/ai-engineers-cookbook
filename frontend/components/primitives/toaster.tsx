"use client";

import * as React from "react";

import { Toaster as SonnerToaster } from "@/components/ui/sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * App-wide toast host. Mount once, near the root of the app (this is
 * infrastructure, not a bespoke toast system). Other modules enqueue toasts
 * by calling `toast()` from the `sonner` package directly — this component
 * only hosts the rendered notifications.
 */
function Toaster(props: ToasterProps) {
  return <SonnerToaster {...props} />;
}

export { Toaster };
export type { ToasterProps };
