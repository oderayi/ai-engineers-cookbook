import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseRecipeEvent, type RecipeEvent } from "@/lib/execution/events";

/**
 * Schema-validity guard for the recorded-event fixtures under this
 * directory. Every `.jsonl` fixture must be a stream of real, schema-valid
 * `RecipeEvent`s (one per line) so the run-output renderer (a later task)
 * can be built and tested entirely against these files, with no backend
 * running. If a future edit to `lib/execution/events.ts` (or to a fixture)
 * breaks that contract, this file is where it fails loudly.
 */

const FIXTURES_DIR = path.resolve(import.meta.dirname, ".");

const JSONL_FIXTURES = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith(".jsonl"))
  .sort();

function readJsonlEvents(fileName: string): RecipeEvent[] {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line) => parseRecipeEvent(JSON.parse(line)));
}

describe("jsonl fixtures", () => {
  it("found at least one .jsonl fixture to check", () => {
    expect(JSONL_FIXTURES.length).toBeGreaterThan(0);
  });

  it.each(JSONL_FIXTURES)("every line in %s parses via parseRecipeEvent", (fileName) => {
    const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      const parsed: unknown = JSON.parse(line);
      expect(() => parseRecipeEvent(parsed)).not.toThrow();
    }
  });

  it("covers every one of the 7 event types across the whole fixture set", () => {
    const allEvents = JSONL_FIXTURES.flatMap((fileName) => readJsonlEvents(fileName));
    const seenTypes = new Set(allEvents.map((event) => event.type));

    const expectedTypes: RecipeEvent["type"][] = [
      "step",
      "token",
      "tool_call",
      "log",
      "artifact",
      "result",
      "error",
    ];

    for (const type of expectedTypes) {
      expect(seenTypes.has(type)).toBe(true);
    }
  });

  it("covers every one of the 5 error_type values across the whole fixture set", () => {
    const allEvents = JSONL_FIXTURES.flatMap((fileName) => readJsonlEvents(fileName));
    const seenErrorTypes = new Set(
      allEvents.filter((event) => event.type === "error").map((event) => event.error_type),
    );

    const expectedErrorTypes = [
      "timeout",
      "output_limit",
      "recipe_error",
      "bad_input",
      "upstream_error",
    ] as const;

    for (const errorType of expectedErrorTypes) {
      expect(seenErrorTypes.has(errorType)).toBe(true);
    }
  });

  it("partial-then-error.jsonl ends in an error with no result event", () => {
    const events = readJsonlEvents("partial-then-error.jsonl");
    const lastEvent = events[events.length - 1];

    expect(lastEvent?.type).toBe("error");
    expect(events.some((event) => event.type === "result")).toBe(false);
  });

  it("artifacts.jsonl includes at least one artifact of each kind", () => {
    const events = readJsonlEvents("artifacts.jsonl");
    const artifactKinds = new Set(
      events.filter((event) => event.type === "artifact").map((event) => event.kind),
    );

    for (const kind of ["json", "table", "markdown", "file"] as const) {
      expect(artifactKinds.has(kind)).toBe(true);
    }
  });

  it("tool-calls.jsonl includes at least 2 tool_call events with different names", () => {
    const events = readJsonlEvents("tool-calls.jsonl");
    const toolCallNames = new Set(
      events.filter((event) => event.type === "tool_call").map((event) => event.name),
    );

    expect(toolCallNames.size).toBeGreaterThanOrEqual(2);
  });
});

/**
 * `rate-limit-429.json` is a single JSON object (the `429` contract from
 * docs/SPEC-execution.md's "429 contract" section), not an event stream, so
 * it gets its own shape check rather than going through `parseRecipeEvent`.
 * We define a small inline zod schema (rather than plain key/type
 * assertions) so the check documents and enforces the full shape —
 * including the closed `scope`/`cta` enums — in one place.
 */
const RateLimit429 = z.object({
  error: z.literal("rate_limited"),
  scope: z.enum(["trial_daily", "global_budget"]),
  message: z.string(),
  retry_after_seconds: z.number(),
  cta: z.enum(["add_key", "clone_local"]),
});

describe("rate-limit-429.json", () => {
  it("matches the 429 contract shape from docs/SPEC-execution.md", () => {
    const raw = readFileSync(path.join(FIXTURES_DIR, "rate-limit-429.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);

    expect(() => RateLimit429.parse(parsed)).not.toThrow();
  });
});
