import { z } from "zod";

/**
 * Zod mirrors of the backend's exact wire contract for the 7 recipe events
 * (`backend/src/skillet/recipe/events.py`) — see docs/SPEC-recipe-framework.md's
 * "Event wire format (SSE)" section.
 *
 * Unlike every other backend model this frontend consumes (`lib/api/models.ts`,
 * `lib/settings/*`), these are plain, un-aliased Pydantic models with NO
 * camelCase conversion — the wire format is snake_case exactly as declared
 * below (`error_type`, and so on). Confirmed by reading events.py and by
 * generating real serialized JSON via `model_dump_json()`; see
 * `tests/execution/events.test.ts` for the exact fixtures produced.
 *
 * `ToolCallEvent.args`/`.result` and `ArtifactEvent.data` are `z.unknown()`:
 * their shape varies per tool / per artifact `kind` and modeling each one is
 * out of scope for this module. `ResultEvent.data` and `StepEvent`/
 * `ArtifactEvent`'s nullable fields mirror the backend's declared types
 * (`dict[str, Any]`, `str | None`) directly.
 */

export const StepEvent = z.object({
  type: z.literal("step"),
  id: z.string(),
  name: z.string(),
  status: z.enum(["start", "finish", "error"]),
  detail: z.string().nullable(),
  ts: z.number(),
});
export type StepEvent = z.infer<typeof StepEvent>;

export const TokenEvent = z.object({
  type: z.literal("token"),
  text: z.string(),
});
export type TokenEvent = z.infer<typeof TokenEvent>;

export const ToolCallEvent = z.object({
  type: z.literal("tool_call"),
  id: z.string(),
  name: z.string(),
  args: z.unknown(),
  result: z.unknown(),
  ts: z.number(),
});
export type ToolCallEvent = z.infer<typeof ToolCallEvent>;

export const LogEvent = z.object({
  type: z.literal("log"),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  ts: z.number(),
});
export type LogEvent = z.infer<typeof LogEvent>;

export const ArtifactEvent = z.object({
  type: z.literal("artifact"),
  id: z.string(),
  kind: z.enum(["json", "table", "markdown", "file"]),
  name: z.string(),
  data: z.unknown(),
  url: z.string().nullable(),
});
export type ArtifactEvent = z.infer<typeof ArtifactEvent>;

export const ResultEvent = z.object({
  type: z.literal("result"),
  data: z.record(z.string(), z.unknown()),
  ts: z.number(),
});
export type ResultEvent = z.infer<typeof ResultEvent>;

export const ErrorEvent = z.object({
  type: z.literal("error"),
  error_type: z.enum(["timeout", "output_limit", "recipe_error", "bad_input", "upstream_error"]),
  message: z.string(),
  recoverable: z.boolean(),
  ts: z.number(),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

/** The closed set of 7 recipe events, discriminated on `type` (mirrors the backend's `Field(discriminator="type")`). */
export const RecipeEvent = z.discriminatedUnion("type", [
  StepEvent,
  TokenEvent,
  ToolCallEvent,
  LogEvent,
  ArtifactEvent,
  ResultEvent,
  ErrorEvent,
]);
export type RecipeEvent = z.infer<typeof RecipeEvent>;

/**
 * Parses and validates a raw SSE payload against the closed set of 7 recipe
 * events. Callers elsewhere in this module should use this helper rather
 * than reaching for `RecipeEvent.parse` directly, so parsing behavior (and
 * any future error handling added here) stays in one place.
 */
export function parseRecipeEvent(raw: unknown): RecipeEvent {
  return RecipeEvent.parse(raw);
}
