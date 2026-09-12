import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "@/components/execution/artifact/data-table";

// Real fixture from tests/execution/fixtures/artifacts.jsonl (artifact "a2", kind: "table").
const salesData = {
  columns: ["Month", "Revenue"],
  rows: [
    ["Jan", 1000],
    ["Feb", 1200],
    ["Mar", 950],
  ],
};

describe("DataTable", () => {
  it("renders columns as table headers", () => {
    render(<DataTable data={salesData} />);
    expect(screen.getByRole("columnheader", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
  });

  it("renders each row as a table row of cells", () => {
    render(<DataTable data={salesData} />);
    expect(screen.getByRole("cell", { name: "Jan" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1000" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Feb" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1200" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Mar" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "950" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4); // 1 header + 3 data rows
  });

  it("wraps the table in a horizontally-scrollable container", () => {
    const { container } = render(<DataTable data={salesData} />);
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.querySelector("table")).not.toBeNull();
  });

  it.each([
    ["null", null],
    ["a plain string", "not a table"],
    ["missing rows", { columns: ["A"] }],
    ["missing columns", { rows: [["x"]] }],
    ["non-array rows", { columns: ["A"], rows: "nope" }],
    ["a row that isn't an array", { columns: ["A"], rows: [{ A: "x" }] }],
  ])("renders a graceful fallback for malformed data: %s", (_label, malformed) => {
    render(<DataTable data={malformed} />);
    expect(screen.getByText(/unable to render this table/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("truncates to the first 100 rows and shows a visible note", () => {
    const bigRows = Array.from({ length: 250 }, (_, i) => [`Row ${i}`, i]);
    render(<DataTable data={{ columns: ["Label", "Value"], rows: bigRows }} />);

    // Header + 100 data rows only.
    expect(screen.getAllByRole("row")).toHaveLength(101);
    expect(screen.getByText("Row 0")).toBeInTheDocument();
    expect(screen.getByText("Row 99")).toBeInTheDocument();
    expect(screen.queryByText("Row 100")).not.toBeInTheDocument();
    expect(screen.getByText(/showing first 100 of 250 rows/i)).toBeInTheDocument();
  });

  it("does not show a truncation note when rows are within the cap", () => {
    render(<DataTable data={salesData} />);
    expect(screen.queryByText(/showing first/i)).not.toBeInTheDocument();
  });
});
