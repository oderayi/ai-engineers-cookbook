import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LogStream } from "@/components/execution/log-stream";
import { parseRecipeEvent, type LogEvent } from "@/lib/execution/events";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

function logEvents(fileName: string): LogEvent[] {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseRecipeEvent(JSON.parse(line)))
    .filter((event): event is LogEvent => event.type === "log");
}

describe("LogStream", () => {
  it("renders a real info-level log line from tool-calls.jsonl", () => {
    const events = logEvents("tool-calls.jsonl");
    expect(events).toEqual([
      expect.objectContaining({ level: "info", message: "web_search returned 1 result in 290ms" }),
    ]);

    render(<LogStream events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("web_search returned 1 result in 290ms")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-level", "info");
  });

  it("renders events in the given order", () => {
    const events: LogEvent[] = [
      parseRecipeEvent({ type: "log", level: "info", message: "first", ts: 0 }) as LogEvent,
      parseRecipeEvent({ type: "log", level: "warn", message: "second", ts: 1 }) as LogEvent,
      parseRecipeEvent({ type: "log", level: "error", message: "third", ts: 2 }) as LogEvent,
    ];

    render(<LogStream events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("first")).toBeInTheDocument();
    expect(within(rows[1]).getByText("second")).toBeInTheDocument();
    expect(within(rows[2]).getByText("third")).toBeInTheDocument();
  });

  it("visually distinguishes info/warn/error levels by both color and icon", () => {
    const events: LogEvent[] = [
      parseRecipeEvent({ type: "log", level: "info", message: "info msg", ts: 0 }) as LogEvent,
      parseRecipeEvent({ type: "log", level: "warn", message: "warn msg", ts: 1 }) as LogEvent,
      parseRecipeEvent({ type: "log", level: "error", message: "error msg", ts: 2 }) as LogEvent,
    ];

    render(<LogStream events={events} />);

    const rows = screen.getAllByRole("listitem");
    const infoIcon = rows[0].querySelector("svg");
    const warnIcon = rows[1].querySelector("svg");
    const errorIcon = rows[2].querySelector("svg");
    expect(infoIcon).not.toBeNull();
    expect(warnIcon).not.toBeNull();
    expect(errorIcon).not.toBeNull();

    // Distinct icon shapes (different lucide components render different
    // inner markup/class names) and distinct color classes per level.
    expect(infoIcon?.outerHTML).not.toBe(warnIcon?.outerHTML);
    expect(warnIcon?.outerHTML).not.toBe(errorIcon?.outerHTML);
    expect(rows[1].querySelector(".text-amber-600")).not.toBeNull();
    expect(rows[2].querySelector(".text-destructive")).not.toBeNull();
  });

  it("renders without error and with no rows for an empty events array", () => {
    const { container } = render(<LogStream events={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(container.querySelector('[data-slot="log-stream"]')).toBeInTheDocument();
  });
});
