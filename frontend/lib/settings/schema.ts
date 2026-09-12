import { z } from "zod";

export const CURRENT_VERSION = 1 as const;

/** A provider API key env var name, e.g. "OPENAI_API_KEY". */
const EnvKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

const backendUrl = z
  .string()
  .trim()
  .refine((u) => u === "" || /^https?:\/\/.+/.test(u), "Must be an http(s) URL")
  .transform((u) => u.replace(/\/+$/, ""));

export const settingsV1Schema = z.object({
  version: z.literal(CURRENT_VERSION),
  /** Global provider defaults: env key -> secret value. */
  global: z.record(EnvKey, z.string()).default({}),
  customBackendUrl: backendUrl.default(""),
  /** Per-recipe overrides: recipe slug -> (env key -> value). */
  overrides: z.record(z.string(), z.record(EnvKey, z.string())).default({}),
});

export type SettingsV1 = z.infer<typeof settingsV1Schema>;
export type Settings = SettingsV1; // alias tracks the current version
