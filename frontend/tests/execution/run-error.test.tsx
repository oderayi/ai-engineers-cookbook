import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunError } from "@/components/execution/run-error";
import { parseRecipeEvent, type ErrorEvent } from "@/lib/execution/events";

afterEach(() => {
  cleanup();
});

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

/** Reads the single terminal `ErrorEvent` out of one of the real `error-*.jsonl` fixtures. */
function readErrorEvent(fileName: string): ErrorEvent {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const events = lines.map((line) => parseRecipeEvent(JSON.parse(line)));
  const errorEvent = events.find((event): event is ErrorEvent => event.type === "error");
  if (!errorEvent) throw new Error(`${fileName} has no error event`);
  return errorEvent;
}

const FIXTURE_BY_ERROR_TYPE: Record<ErrorEvent["error_type"], string> = {
  timeout: "error-timeout.jsonl",
  output_limit: "error-output-limit.jsonl",
  recipe_error: "error-recipe-error.jsonl",
  bad_input: "error-bad-input.jsonl",
  upstream_error: "error-upstream-error.jsonl",
};

const ERROR_TYPES = Object.keys(FIXTURE_BY_ERROR_TYPE) as ErrorEvent["error_type"][];

describe("RunError", () => {
  it.each(ERROR_TYPES)("renders %s distinctly, with the server message shown too", (errorType) => {
    const event = readErrorEvent(FIXTURE_BY_ERROR_TYPE[errorType]);

    render(
      <RunError errorType={event.error_type} message={event.message} recoverable={event.recoverable} />
    );

    // The server's own message is always shown.
    expect(screen.getByText(event.message)).toBeInTheDocument();
    // Rendered inside the destructive Alert.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("gives each error_type distinct, non-generic title copy", () => {
    const titles = new Set<string>();

    for (const errorType of ERROR_TYPES) {
      const event = readErrorEvent(FIXTURE_BY_ERROR_TYPE[errorType]);
      const { unmount } = render(
        <RunError errorType={event.error_type} message={event.message} recoverable={event.recoverable} />
      );

      const alert = screen.getByRole("alert");
      const title = alert.querySelector("[data-slot='alert-title']")?.textContent;
      expect(title).toBeTruthy();
      expect(title).not.toMatch(/an error occurred/i);
      titles.add(title!);

      unmount();
    }

    // 5 distinct error_types -> 5 distinct titles.
    expect(titles.size).toBe(ERROR_TYPES.length);
  });

  it("renders no retry affordance when onRetry is absent", () => {
    const event = readErrorEvent(FIXTURE_BY_ERROR_TYPE.upstream_error);
    render(
      <RunError errorType={event.error_type} message={event.message} recoverable={event.recoverable} />
    );

    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders a Retry button and calls onRetry when provided (transport-style usage)", async () => {
    const event = readErrorEvent(FIXTURE_BY_ERROR_TYPE.upstream_error);
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <RunError
        errorType={event.error_type}
        message={event.message}
        recoverable={event.recoverable}
        onRetry={onRetry}
      />
    );

    const retryButton = screen.getByRole("button", { name: /retry/i });
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("never renders a 429/rate-limit-specific message", () => {
    const event = readErrorEvent(FIXTURE_BY_ERROR_TYPE.bad_input);
    render(
      <RunError errorType={event.error_type} message={event.message} recoverable={event.recoverable} />
    );

    expect(screen.queryByText(/rate.?limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/429/)).not.toBeInTheDocument();
  });
});
