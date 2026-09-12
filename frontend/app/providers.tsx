"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Owns the react-query `QueryClient` instance. `useState(() => new
 * QueryClient())` (never a module-level singleton) is the standard Next.js
 * App Router pattern: a module-level client would be a single shared
 * instance across every request on the server (leaking cached data between
 * unrelated users) and would survive a client-side error boundary reset
 * incorrectly. `useState`'s lazy initializer runs once per component
 * instance instead — once per server request, once per full client page
 * load.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
