import { z } from "zod";

export const CURRENT_VERSION = 1 as const;
export const STORAGE_KEY = "skillet.workspace";

const persistedTab = z.object({
  id: z.string(),
  slug: z.string(),
});

const progressEntry = z.object({
  viewedAt: z.number().nullable().default(null),
  completedAt: z.number().nullable().default(null),
});

export const workspaceV1Schema = z.object({
  version: z.literal(CURRENT_VERSION),
  /** Order = tab strip order. */
  tabs: z.array(persistedTab).default([]),
  activeTabId: z.string().nullable().default(null),
  /** recipe slug -> progress. Never stores run output or events. */
  progress: z.record(z.string(), progressEntry).default({}),
});

export type WorkspaceV1 = z.infer<typeof workspaceV1Schema>;
export type PersistedTab = z.infer<typeof persistedTab>;
export type ProgressEntry = z.infer<typeof progressEntry>;
