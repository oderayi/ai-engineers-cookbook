import { CURRENT_VERSION, type WorkspaceV1 } from "@/lib/workspace/schema";

/**
 * The canonical "no tabs open, nothing tracked yet" workspace object. Other
 * parts of the module fall back to this when there is no persisted blob, or
 * the persisted blob is unreadable/invalid/from a future schema version.
 *
 * Mirrors `settings`' `emptySettings()` (see `lib/settings/defaults.ts`).
 *
 * Returns a fresh object on every call (never a shared reference) so a
 * caller mutating the result can never affect another caller's copy.
 */
export function emptyWorkspace(): WorkspaceV1 {
  return {
    version: CURRENT_VERSION,
    tabs: [],
    activeTabId: null,
    progress: {},
  };
}
