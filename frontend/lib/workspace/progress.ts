/**
 * Pure functions over the progress ledger slice of the `skillet.workspace`
 * blob. No I/O, no localStorage, no React — mirrors `settings`' `resolveConfig`
 * purity convention (see `lib/settings/resolve.ts`): every function here takes
 * the current map and returns a new one, never touching its input in place.
 */
export type ProgressMap = Record<string, { viewedAt: number | null; completedAt: number | null }>;

/** Set once, the first time a tab for `slug` is opened; never overwritten by later opens. */
export function markViewed(progress: ProgressMap, slug: string, now = Date.now()): ProgressMap {
  const existing = progress[slug];
  if (existing?.viewedAt != null) return progress; // set once, never overwritten
  return { ...progress, [slug]: { viewedAt: now, completedAt: existing?.completedAt ?? null } };
}

/**
 * Set (and overwritten) every time a run for `slug` reaches a terminal
 * `result` event. `existing?.viewedAt ?? now` deliberately backfills
 * `viewedAt` to the same timestamp as `completedAt` when `slug` was never
 * viewed first: a recipe cannot complete a run without having been opened, so
 * "completed but never viewed" is a logically impossible ledger state. Rather
 * than leave `viewedAt` null (which would let a completed recipe render as
 * un-viewed in the nav), backfilling keeps the ledger internally consistent.
 * This is intentional behavior, pinned down by a dedicated test, not an
 * untested accident of the sample code.
 */
export function markCompleted(progress: ProgressMap, slug: string, now = Date.now()): ProgressMap {
  const existing = progress[slug];
  return { ...progress, [slug]: { viewedAt: existing?.viewedAt ?? now, completedAt: now } };
}

/** Shape `catalog`'s nav-tree progress prop expects (see Cross-module contract). */
export function toNavBadges(progress: ProgressMap): Record<string, { viewed: boolean; completed: boolean }> {
  return Object.fromEntries(
    Object.entries(progress).map(([slug, p]) => [
      slug,
      { viewed: p.viewedAt != null, completed: p.completedAt != null },
    ]),
  );
}
