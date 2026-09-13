import { describe, expect, it } from "vitest";

import { mergeNavProgress } from "@/lib/workspace/merge-nav-progress";
import type { NavModel } from "@/components/shell/sidebar-nav";
import type { ProgressMap } from "@/lib/workspace/progress";

const NAV: NavModel = {
  groups: [
    {
      id: "demo",
      title: "Demo",
      recipes: [
        { slug: "echo", title: "Echo", difficulty: "basic" },
        { slug: "echo-with-helper", title: "Echo with helper", difficulty: "basic" },
      ],
    },
  ],
};

describe("mergeNavProgress", () => {
  it("sets progress on a recipe with a matching entry", () => {
    const progress: ProgressMap = { echo: { viewedAt: 1, completedAt: 2 } };

    const merged = mergeNavProgress(NAV, progress);

    expect(merged.groups[0].recipes[0].progress).toEqual({ viewed: true, completed: true });
  });

  it("leaves a recipe with no matching progress entry untouched (no `progress` key)", () => {
    const merged = mergeNavProgress(NAV, {});

    expect(merged.groups[0].recipes[1]).not.toHaveProperty("progress");
  });

  it("maps viewedAt-only (no completedAt) to viewed: true, completed: false", () => {
    const progress: ProgressMap = { "echo-with-helper": { viewedAt: 1, completedAt: null } };

    const merged = mergeNavProgress(NAV, progress);

    expect(merged.groups[0].recipes[1].progress).toEqual({ viewed: true, completed: false });
  });

  it("does not mutate the input NavModel or ProgressMap", () => {
    const progress: ProgressMap = { echo: { viewedAt: 1, completedAt: null } };
    const navSnapshot = JSON.parse(JSON.stringify(NAV));
    const progressSnapshot = JSON.parse(JSON.stringify(progress));

    mergeNavProgress(NAV, progress);

    expect(NAV).toEqual(navSnapshot);
    expect(progress).toEqual(progressSnapshot);
  });

  it("preserves every other NavGroup/NavRecipe field untouched", () => {
    const merged = mergeNavProgress(NAV, {});

    expect(merged.groups[0].id).toBe("demo");
    expect(merged.groups[0].title).toBe("Demo");
    expect(merged.groups[0].recipes[0].title).toBe("Echo");
    expect(merged.groups[0].recipes[0].difficulty).toBe("basic");
  });
});
