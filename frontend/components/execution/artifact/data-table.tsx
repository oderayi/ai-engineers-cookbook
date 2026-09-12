import { cn } from "@/lib/cn";

export interface DataTableProps {
  /** The artifact's `kind: "table"` `data` payload -- see `TableData` below for the expected shape. */
  data: unknown;
  className?: string;
}

/**
 * Expected `data` shape for a `kind: "table"` artifact. `ArtifactEvent.data`
 * is typed `z.unknown()` in `lib/execution/events.ts` (its real shape isn't
 * separately modeled), so this is documented here rather than enforced by
 * that type -- confirmed by the real fixture in
 * `tests/execution/fixtures/artifacts.jsonl`:
 *   {"columns":["Month","Revenue"],"rows":[["Jan",1000],["Feb",1200],["Mar",950]]}
 */
interface TableData {
  columns: string[];
  rows: unknown[][];
}

/**
 * Row cap applied before rendering, per this codebase's artifact-rendering
 * guidance (SPEC-execution.md Open Question 3: truncate large payloads with
 * a visible note rather than rendering unbounded content). 100 rows is
 * comfortably enough to preview a table's shape/content without risking a
 * huge DOM for a pathological artifact.
 */
const MAX_ROWS = 100;

function isTableData(value: unknown): value is TableData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.columns) &&
    candidate.columns.every((column) => typeof column === "string") &&
    Array.isArray(candidate.rows) &&
    candidate.rows.every((row) => Array.isArray(row))
  );
}

function formatCell(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return String(cell);
  }
  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

/**
 * Renders a `kind: "table"` artifact's `data` as an HTML `<table>`:
 * `columns` become `<th>` headers, each entry in `rows` becomes a `<tr>` of
 * `<td>`s. Guards against malformed `data` (missing/mistyped `columns`/
 * `rows`) with a graceful fallback instead of crashing, and truncates to
 * `MAX_ROWS` with a visible note (see `MAX_ROWS` above).
 */
function DataTable({ data, className }: DataTableProps) {
  if (!isTableData(data)) {
    return (
      <p data-slot="data-table-fallback" className={cn("text-sm text-muted-foreground", className)}>
        Unable to render this table.
      </p>
    );
  }

  const { columns, rows } = data;
  const truncated = rows.length > MAX_ROWS;
  const visibleRows = truncated ? rows.slice(0, MAX_ROWS) : rows;

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-2", className)}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={`${index}-${column}`}
                  className="border-b border-border px-2 py-1 font-medium text-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-b border-border px-2 py-1 text-muted-foreground">
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p data-slot="data-table-truncated-note" className="text-xs text-muted-foreground">
          Showing first {MAX_ROWS} of {rows.length} rows.
        </p>
      )}
    </div>
  );
}

export { DataTable };
