import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunOutputView } from "@/components/execution/run-output";
import { parseRecipeEvent, type ErrorEvent, type RecipeEvent } from "@/lib/execution/events";
import { RateLimitPayload } from "@/lib/execution/rate-limit";
import type { RunFailure } from "@/hooks/use-recipe-run";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

function readJsonlEvents(fileName: string): RecipeEvent[] {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseRecipeEvent(JSON.parse(line)));
}

function readJson(fileName: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8"));
}

/** Builds the `RunFailure` a real `<RunOutput>` would derive from a fixture's terminal `ErrorEvent`. */
function streamFailureFrom(errorEvent: ErrorEvent): RunFailure {
  return {
    kind: "stream",
    message: errorEvent.message,
    errorType: errorEvent.error_type,
    recoverable: errorEvent.recoverable,
  };
}

describe("RunOutputView", () => {
  it("renders nothing while idle", () => {
    const { container } = render(
      <RunOutputView status="idle" events={[]} result={null} error={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a running indicator before any output has streamed", () => {
    render(<RunOutputView status="running" events={[]} result={null} error={null} />);
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  describe("every one of the 7 event types renders distinctly from real fixtures", () => {
    it("step -> StepTimeline", () => {
      const events = readJsonlEvents("happy-path.jsonl");
      render(<RunOutputView status="running" events={events} result={null} error={null} />);
      expect(screen.getByText("Generating summary")).toBeInTheDocument();
    });

    it("token -> TokenPane", () => {
      const events = readJsonlEvents("token-stream.jsonl");
      render(<RunOutputView status="running" events={events} result={null} error={null} />);
      const expectedText = events
        .filter((e) => e.type === "token")
        .map((e) => e.text)
        .join("");
      // Exact textContent, not screen.getByText: a stream's trailing space
      // (real here) would otherwise be silently trimmed away by Testing
      // Library's default text normalizer, hiding a real mismatch.
      const pane = document.querySelector('[data-slot="token-pane"]');
      expect(pane?.textContent).toBe(expectedText);
    });

    it("tool_call -> ToolCallCard", () => {
      const events = readJsonlEvents("tool-calls.jsonl");
      render(<RunOutputView status="running" events={events} result={null} error={null} />);
      expect(screen.getByText("web_search")).toBeInTheDocument();
      expect(screen.getByText("calculator")).toBeInTheDocument();
    });

    it("log -> LogStream", () => {
      const events = readJsonlEvents("tool-calls.jsonl");
      render(<RunOutputView status="running" events={events} result={null} error={null} />);
      expect(screen.getByText("web_search returned 1 result in 290ms")).toBeInTheDocument();
    });

    it("artifact -> one distinct renderer per kind", () => {
      const events = readJsonlEvents("artifacts.jsonl");
      render(<RunOutputView status="running" events={events} result={null} error={null} />);

      expect(screen.getByText("Sentiment Analysis")).toBeInTheDocument(); // json-tree heading
      expect(screen.getByText("Month")).toBeInTheDocument(); // data-table header
      expect(screen.getByRole("heading", { name: "Sales Report" })).toBeInTheDocument(); // markdown
      expect(screen.getByRole("link", { name: /full-report\.pdf/ })).toHaveAttribute(
        "href",
        "/artifacts/runs/run-42/full-report.pdf"
      );
    });

    it("result -> rendered via JsonTree", () => {
      const events = readJsonlEvents("happy-path.jsonl");
      const resultEvent = events.find((e) => e.type === "result");
      if (resultEvent?.type !== "result") throw new Error("fixture has no result event");

      render(
        <RunOutputView status="done" events={events} result={resultEvent} error={null} />
      );
      expect(screen.getByText("Result")).toBeInTheDocument();
      // Scoped to the JsonTree specifically -- the same text also appears
      // in the TokenPane above it (the token stream spells out the same
      // sentence), so an unscoped query would be ambiguous.
      const resultTree = document.querySelector('[data-slot="json-tree"]');
      expect(resultTree?.textContent).toContain("The quick brown fox jumps.");
    });

    it.each([
      ["error-timeout.jsonl", "timed out"],
      ["error-output-limit.jsonl", "Output limit"],
      ["error-recipe-error.jsonl", "Recipe error"],
      ["error-bad-input.jsonl", "Invalid input"],
      ["error-upstream-error.jsonl", "Upstream provider error"],
    ])("error (%s) -> distinct RunError copy, never RateLimitNotice", (fixtureFile, expectedTitleFragment) => {
      const events = readJsonlEvents(fixtureFile);
      const errorEvent = events.find((e) => e.type === "error");
      if (errorEvent?.type !== "error") throw new Error(`${fixtureFile} has no terminal error event`);

      render(
        <RunOutputView
          status="error"
          events={events}
          result={null}
          error={streamFailureFrom(errorEvent)}
        />
      );

      expect(screen.getByText(new RegExp(expectedTitleFragment, "i"))).toBeInTheDocument();
      expect(screen.getByText(errorEvent.message)).toBeInTheDocument();
      expect(screen.queryByText(/free runs|daily budget/i)).not.toBeInTheDocument();
    });

    it("429 rate-limit payload -> RateLimitNotice, never RunError", () => {
      const payload = RateLimitPayload.parse(readJson("rate-limit-429.json"));
      const error: RunFailure = { kind: "rate_limit", message: payload.message, rateLimit: payload };

      render(<RunOutputView status="error" events={[]} result={null} error={error} />);

      expect(screen.getByText(payload.message)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /add your own api key/i })).toHaveAttribute(
        "href",
        "/settings"
      );
      // None of the 5 in-stream error titles ever appear alongside a 429.
      expect(screen.queryByText(/run timed out|recipe error|invalid input/i)).not.toBeInTheDocument();
    });
  });

  it("keeps partial output visible above a terminal error banner (partial-then-error.jsonl)", () => {
    const events = readJsonlEvents("partial-then-error.jsonl");
    const errorEvent = events.find((e) => e.type === "error");
    if (errorEvent?.type !== "error") throw new Error("fixture has no terminal error event");

    render(
      <RunOutputView
        status="error"
        events={events}
        result={null}
        error={streamFailureFrom(errorEvent)}
      />
    );

    // Partial output: the step that started, and every token streamed before the error.
    expect(screen.getByText("Generating response")).toBeInTheDocument();
    const streamedText = events
      .filter((e) => e.type === "token")
      .map((e) => e.text)
      .join("");
    const pane = document.querySelector('[data-slot="token-pane"]');
    expect(pane?.textContent).toBe(streamedText);
    // And the terminal error banner itself.
    expect(screen.getByText(errorEvent.message)).toBeInTheDocument();
  });

  it("a transport-kind failure renders RunError with a working Retry button", async () => {
    const onRetry = vi.fn();
    const error: RunFailure = { kind: "transport", message: "Failed to fetch", status: 0 };

    render(
      <RunOutputView status="error" events={[]} result={null} error={error} onRetry={onRetry} />
    );

    const retryButton = screen.getByRole("button", { name: /retry/i });
    retryButton.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("an in-stream (non-transport) failure never shows a Retry button even if onRetry is passed", () => {
    const onRetry = vi.fn();
    const error: RunFailure = {
      kind: "stream",
      message: "boom",
      errorType: "recipe_error",
      recoverable: false,
    };

    render(
      <RunOutputView status="error" events={[]} result={null} error={error} onRetry={onRetry} />
    );

    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows a working Cancel button while running, when onCancel is provided", () => {
    const onCancel = vi.fn();
    render(
      <RunOutputView status="running" events={[]} result={null} error={null} onCancel={onCancel} />
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    cancelButton.click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows no Cancel button when onCancel is not provided, or once the run has ended", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <RunOutputView status="running" events={[]} result={null} error={null} />
    );
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();

    rerender(
      <RunOutputView status="done" events={[]} result={null} error={null} onCancel={onCancel} />
    );
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });
});
