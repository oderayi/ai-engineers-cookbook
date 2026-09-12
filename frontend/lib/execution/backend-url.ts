"use client";

import { useSettings } from "@/hooks/use-settings";

/**
 * The default backend, when the learner hasn't set `settings.
 * customBackendUrl` — the same env var / fallback `catalog`'s own
 * `lib/api/recipes.ts` uses for its (fixed, build-time) reads, kept
 * consistent so both modules agree on "the backend" when no override is set.
 */
const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/**
 * `settings.customBackendUrl || the default backend` — per
 * `SPEC-execution.md`'s own Code Style sample. Unlike `catalog`'s
 * `lib/api/recipes.ts` (a fixed, build-time constant, since that module's
 * own read-only fetches were deliberately kept simple), a *run* genuinely
 * needs to respect a learner's self-hosted backend at runtime — this is
 * the hook `catalog` left for this module to build.
 *
 * A live hook (not a one-time read) so a change to `customBackendUrl` in
 * another tab, or in `settings` itself, is picked up on the next render
 * without requiring a reload.
 */
export function useBackendBaseUrl(): string {
  const [settings] = useSettings();
  return settings.customBackendUrl || DEFAULT_BACKEND_URL;
}
