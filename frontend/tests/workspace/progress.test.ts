import { describe, expect, it } from "vitest";

import { markCompleted, markViewed, toNavBadges } from "@/lib/workspace/progress";
import type { ProgressMap } from "@/lib/workspace/progress";

describe("markViewed", () => {
  it("sets viewedAt on a fresh slug", () => {
    const result = markViewed({}, "rag-basics", 1000);

    expect(result).toEqual({
      "rag-basics": { viewedAt: 1000, completedAt: null },
    });
  });

  it("is idempotent — a repeat call does not change the original viewedAt", () => {
    const first = markViewed({}, "rag-basics", 1000);
    const second = markViewed(first, "rag-basics", 2000);

    expect(second["rag-basics"]?.viewedAt).toBe(1000);
  });

  it("preserves an existing completedAt when marking viewed", () => {
    const completed = markCompleted({}, "rag-basics", 500);
    const result = markViewed(completed, "rag-basics", 1500);

    expect(result["rag-basics"]).toEqual({ viewedAt: 500, completedAt: 500 });
  });

  it("does not mutate the input progress object", () => {
    const progress: ProgressMap = {};
    markViewed(progress, "rag-basics", 1000);

    expect(progress).toEqual({});
  });

  it("does not mutate an input progress object that already has entries", () => {
    const progress: ProgressMap = { "rag-basics": { viewedAt: 1, completedAt: null } };
    const snapshot = { ...progress };

    markViewed(progress, "other-recipe", 1000);

    expect(progress).toEqual(snapshot);
  });
});

describe("markCompleted", () => {
  it("sets completedAt on every call, overwriting the previous value (second call wins)", () => {
    const first = markCompleted({}, "rag-basics", 1000);
    const second = markCompleted(first, "rag-basics", 2000);

    expect(second["rag-basics"]?.completedAt).toBe(2000);
  });

  it("never disturbs an existing viewedAt", () => {
    const viewed = markViewed({}, "rag-basics", 100);
    const result = markCompleted(viewed, "rag-basics", 9999);

    expect(result["rag-basics"]).toEqual({ viewedAt: 100, completedAt: 9999 });
  });

  // Deliberate, pinned-down behavior: calling markCompleted for a slug that was
  // never viewed first backfills viewedAt to the same timestamp as completedAt,
  // rather than leaving it null. This is intentional, not an accident of the
  // sample's `existing?.viewedAt ?? now` — a recipe run cannot reach a terminal
  // "completed" state without the learner having viewed the recipe first (you
  // can't run a recipe you haven't opened), so backfilling viewedAt to match
  // completedAt keeps the ledger internally consistent (viewed implies
  // completed's precondition) instead of leaving a logically-impossible
  // "completed but never viewed" entry in the map.
  it("backfills viewedAt to the same value as completedAt when the slug was never viewed", () => {
    const result = markCompleted({}, "rag-basics", 4242);

    expect(result["rag-basics"]).toEqual({ viewedAt: 4242, completedAt: 4242 });
    expect(result["rag-basics"]?.viewedAt).toBe(result["rag-basics"]?.completedAt);
  });

  it("does not mutate the input progress object", () => {
    const progress: ProgressMap = {};
    markCompleted(progress, "rag-basics", 1000);

    expect(progress).toEqual({});
  });

  it("does not mutate an input progress object that already has entries", () => {
    const progress: ProgressMap = { "rag-basics": { viewedAt: 1, completedAt: null } };
    const snapshot = { ...progress };

    markCompleted(progress, "other-recipe", 1000);

    expect(progress).toEqual(snapshot);
  });
});

describe("toNavBadges", () => {
  it("maps a mix of never-viewed/viewed-only/viewed-and-completed slugs to the exact boolean shape", () => {
    const progress: ProgressMap = {
      "viewed-and-completed": { viewedAt: 100, completedAt: 200 },
      "viewed-only": { viewedAt: 100, completedAt: null },
      "never-viewed": { viewedAt: null, completedAt: null },
    };

    expect(toNavBadges(progress)).toEqual({
      "viewed-and-completed": { viewed: true, completed: true },
      "viewed-only": { viewed: true, completed: false },
      "never-viewed": { viewed: false, completed: false },
    });
  });

  it("returns {} for an empty ProgressMap", () => {
    expect(toNavBadges({})).toEqual({});
  });
});
