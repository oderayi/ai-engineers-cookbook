import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ToolCallCard } from "@/components/execution/tool-call-card";
import { parseRecipeEvent, type ToolCallEvent } from "@/lib/execution/events";

afterEach(() => {
  cleanup();
});

/**
 * Real `tool_call` events from the recorded fixture (a `web_search` and a
 * `calculator`), not hand-authored objects — same posture as
 * `tests/execution/fixtures/index.test.ts`.
 */
const FIXTURE_PATH = path.resolve(import.meta.dirname, "fixtures/tool-calls.jsonl");

function readToolCallEvents(): ToolCallEvent[] {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseRecipeEvent(JSON.parse(line)))
    .filter((event): event is ToolCallEvent => event.type === "tool_call");
}

const toolCalls = readToolCallEvents();
const webSearch = toolCalls.find((event) => event.name === "web_search");
const calculator = toolCalls.find((event) => event.name === "calculator");

describe("ToolCallCard", () => {
  it("found both real tool_call fixtures to test against", () => {
    expect(webSearch).toBeDefined();
    expect(calculator).toBeDefined();
  });

  it.each([
    ["web_search", () => webSearch!],
    ["calculator", () => calculator!],
  ])("shows %s's name always, collapsed by default", (name, getEvent) => {
    const event = getEvent();
    render(<ToolCallCard event={event} />);

    const trigger = screen.getByRole("button", { name: event.name });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["web_search", () => webSearch!],
    ["calculator", () => calculator!],
  ])("hides args/result for %s until expanded, then renders them as JSON", async (name, getEvent) => {
    const event = getEvent();
    const user = userEvent.setup();
    render(<ToolCallCard event={event} />);

    expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: event.name });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();

    // `getByText`'s default normalizer collapses whitespace (including the
    // real newlines in pretty-printed JSON), so it's disabled here to match
    // the <pre> block's exact multi-line text content.
    const rawTextMatch = (text: string) => text;
    const expectedArgs = JSON.stringify(event.args, null, 2);
    const expectedResult = JSON.stringify(event.result, null, 2);
    expect(screen.getByText(expectedArgs, { normalizer: rawTextMatch })).toBeInTheDocument();
    expect(screen.getByText(expectedResult, { normalizer: rawTextMatch })).toBeInTheDocument();
  });

  it("renders args/result inside <pre> blocks for readable formatting", async () => {
    const user = userEvent.setup();
    render(<ToolCallCard event={calculator!} />);

    await user.click(screen.getByRole("button", { name: calculator!.name }));

    const expectedArgs = JSON.stringify(calculator!.args, null, 2);
    expect(screen.getByText(expectedArgs, { normalizer: (text) => text }).tagName).toBe("PRE");
  });
});
