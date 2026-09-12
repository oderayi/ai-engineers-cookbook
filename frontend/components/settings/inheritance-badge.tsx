import { Badge } from "@/components/ui/badge";
import type { FieldSource } from "@/lib/settings/resolve";

export interface InheritanceBadgeProps {
  source: FieldSource;
  /** Styled distinctly (destructive) when `source` is `"unset"` and this is true. */
  required?: boolean;
  className?: string;
}

const LABEL: Record<FieldSource, string> = {
  global: "Inherited from global",
  override: "Overridden",
  unset: "Not set",
};

/**
 * Small badge reflecting a resolved field's `FieldSource` — the same
 * `"global" | "override" | "unset"` union `resolveConfig` itself produces,
 * so the badge and the resolved value can never disagree about where a
 * field's value came from (see SPEC-settings.md, Confirmed Decision 7:
 * "derived, never stored").
 */
export function InheritanceBadge({ source, required = false, className }: InheritanceBadgeProps) {
  const variant =
    source === "override" ? "default" : source === "global" ? "secondary" : required ? "destructive" : "outline";

  return (
    <Badge variant={variant} className={className}>
      {LABEL[source]}
    </Badge>
  );
}
