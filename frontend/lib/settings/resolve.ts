import type { RecipeEnvDecl } from "@/lib/settings/types";

export type FieldSource = "override" | "global" | "unset";

export interface ResolvedField {
  key: string;
  value: string | null;
  source: FieldSource;
  required: boolean;
}

export interface ResolvedConfig {
  /** env key -> value, only keys that resolved to a non-empty string. */
  config: Record<string, string>;
  /** one entry per key the recipe declares, for the UI indicators. */
  fields: ResolvedField[];
  /** declared + required keys that resolved to nothing. */
  missingRequired: string[];
}

const clean = (v: string | undefined): string => (v ?? "").trim();

export function resolveConfig(
  recipe: { slug: string; env: RecipeEnvDecl[] },
  global: Record<string, string>,
  overrides: Record<string, string>, // overrides[recipe.slug] already selected
): ResolvedConfig {
  const fields = recipe.env.map<ResolvedField>((decl) => {
    const ov = clean(overrides[decl.key]);
    const gl = clean(global[decl.key]);
    if (ov) return { key: decl.key, value: ov, source: "override", required: decl.required };
    if (gl) return { key: decl.key, value: gl, source: "global", required: decl.required };
    return { key: decl.key, value: null, source: "unset", required: decl.required };
  });

  return {
    config: Object.fromEntries(
      fields.filter((f) => f.value !== null).map((f) => [f.key, f.value as string]),
    ),
    fields,
    missingRequired: fields.filter((f) => f.required && f.value === null).map((f) => f.key),
  };
}
