"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

export interface JsonTreeProps {
  /**
   * Optional heading rendered above the tree -- typically the artifact's
   * `name` (e.g. "Sentiment Analysis"). Omit to render just the tree with
   * no heading.
   */
  name?: string;
  /** The artifact's `kind: "json"` `data` payload -- any JSON-shaped value. */
  data: unknown;
  className?: string;
}

/**
 * Depth below which object/array nodes default to collapsed. Depth 0 is the
 * root value itself, depth 1 its immediate object/array children. Given the
 * real fixture (`{"score":0.87,"labels":["positive","confident"]}`), depth 0
 * is the root object and depth 1 is the `labels` array -- both stay expanded
 * out of the box, which is right for a payload this shallow. Anything nested
 * deeper than that starts collapsed so a large/deeply-nested payload doesn't
 * dump an unreadable wall of expanded nodes on first render; the viewer can
 * expand further by clicking in.
 */
const DEFAULT_EXPANDED_DEPTH = 2;

function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function formatPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

interface JsonNodeProps {
  /** The key/index this value is stored under in its parent, or `null` for the root. */
  label: string | null;
  value: unknown;
  depth: number;
}

/**
 * One node in the tree, recursing into its own children. Each expandable
 * node (object/array) owns its own `open` state -- a lighter-weight
 * per-node toggle than reaching for `CollapsibleSection` (see
 * `components/primitives/collapsible-section.tsx`), which is styled as a
 * full bordered/padded section rather than a compact tree twiddle and would
 * look wrong repeated at every nesting level.
 */
function JsonNode({ label, value, depth }: JsonNodeProps) {
  const expandable = isExpandable(value);
  const [open, setOpen] = useState(depth < DEFAULT_EXPANDED_DEPTH);

  if (!expandable) {
    return (
      <div data-slot="json-tree-leaf" className="flex gap-1.5 py-0.5 text-sm">
        {label !== null && <span className="font-medium text-foreground">{label}:</span>}
        <span className={cn(typeof value === "string" ? "text-primary" : "text-muted-foreground")}>
          {formatPrimitive(value)}
        </span>
      </div>
    );
  }

  const entries: Array<readonly [string, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div data-slot="json-tree-node" className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1 py-0.5 text-left font-medium text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        {label !== null ? `${label}: ` : ""}
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open && (
        <div className="border-l border-border pl-3">
          {entries.map(([key, item]) => (
            <JsonNode key={key} label={key} value={item} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible tree view for a `kind: "json"` artifact's `data` payload.
 * Objects/arrays render as expand/collapse toggles (see `DEFAULT_EXPANDED_DEPTH`
 * for the default-open policy); primitives (string/number/boolean/null)
 * render as leaf `key: value` rows.
 */
function JsonTree({ name, data, className }: JsonTreeProps) {
  return (
    <div data-slot="json-tree" className={cn("flex flex-col gap-2", className)}>
      {name !== undefined && <h3 className="text-sm font-medium text-foreground">{name}</h3>}
      <JsonNode label={null} value={data} depth={0} />
    </div>
  );
}

export { JsonTree };
