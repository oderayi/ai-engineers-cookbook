import { z } from "zod";

/**
 * Compiles a recipe's `inputSchema` (raw JSON Schema, as emitted by Pydantic
 * v2's `model_json_schema()` for a `Params` subclass — see
 * `backend/src/skillet/recipe/params.py`) into a form descriptor plus a zod
 * validator, for the run form (SPEC-catalog.md).
 *
 * Every shape this file's mapping logic depends on was verified by actually
 * running small `Params` subclasses through
 * `cd backend && uv run python -c "..."` and reading the real
 * `model_json_schema()` output (never hand-guessed) — see
 * `tests/catalog/schema-form.test.ts`'s fixtures and header comment for the
 * exact schemas generated and what each one proved. The load-bearing
 * findings from that exercise, in one place:
 *
 * 1. `Optional[X] = None` compiles to
 *    `{"anyOf": [{...X's schema...}, {"type": "null"}], "default": null,
 *    "title": "..."}` on the property — never a bare
 *    `{"type": "string", "nullable": true}` shape some other JSON Schema
 *    dialects use. `title`/`description`/`default` always live on the
 *    OUTER property object, not inside either `anyOf` branch.
 * 2. An `Optional[X]` field with NO explicit default (no `= None`) is
 *    STILL `anyOf`-wrapped the same way, but — surprisingly — it ALSO
 *    lands in the schema's top-level `required` array, because Pydantic v2
 *    does not implicitly give an `Optional` annotation a `None` default the
 *    way Pydantic v1 did. This means "unwrap `anyOf` → treat as not
 *    required" can't be skipped as redundant with the `required` array;
 *    both signals have to be checked, and the spec's own rule ("an
 *    `Optional` field is never required regardless of whether it's in the
 *    top-level `required` array") is the one that must win.
 * 3. A `Literal["a", "b"]` field compiles to
 *    `{"type": "string", "enum": ["a", "b"], "title": "...", ...}` inlined
 *    directly on the property — no `$defs`/`$ref` indirection (Pydantic
 *    only does that for real `enum.Enum` subclasses, which this codebase
 *    doesn't use for recipe params).
 * 4. `Field(json_schema_extra={"accept": [...], "max_files": N})` on a
 *    `list[UploadedFile]` field puts `accept`/`max_files` FLAT on the
 *    property object, exactly as written — snake_case, no camelCase
 *    conversion. Pydantic's camelCase alias generator (used elsewhere in
 *    this codebase, e.g. `api/schemas.py`'s `CamelModel`) does not touch
 *    `json_schema_extra` content at all. `FieldDescriptor.accept`/
 *    `.maxFiles` are camelCase in OUR output type; this file is what does
 *    that translation, reading the raw snake_case keys itself.
 * 5. There is no signal anywhere in a bare `{"type": "string"}` property —
 *    no `format`, no `maxLength` threshold, nothing — that distinguishes
 *    "should render as a `<textarea>`" from "should render as a single-line
 *    `<input>`". Nothing in `SPEC-catalog.md` or `SPEC-recipe-framework.md`
 *    defines such a convention either (e.g. a `json_schema_extra` hint).
 *    So `"textarea"` is a real member of `FieldDescriptor["control"]` (per
 *    this task's required type) but is UNREACHABLE from `compileForm` as
 *    currently specified — every bare string schema maps to `"text"`. If a
 *    later task wants multiline input, it needs a real signal added on the
 *    Python side first (e.g. a `json_schema_extra={"multiline": true}`
 *    convention) rather than this file inventing one that doesn't reflect
 *    anything the backend actually emits.
 * 6. Property key order in `properties` matches the Python class's field
 *    declaration order (verified directly — Pydantic does NOT alphabetize
 *    `properties`' own keys, even though it alphabetizes the *keys within*
 *    each individual property object, e.g. `default`/`maximum`/`minimum`/
 *    `title`/`type`). JS object key order for string keys is insertion
 *    order, so `Object.entries(schema.properties)` naturally preserves
 *    declaration order with no extra bookkeeping.
 */

/**
 * A single JSON Schema property, restricted to the shapes this file's
 * mapping rules understand (Pydantic `Params` output). Left permissive
 * (`[key: string]: unknown`) rather than exhaustively typed, since a raw
 * JSON Schema property can carry arbitrary additional keywords this module
 * has no reason to model.
 */
export interface JsonSchemaProperty {
  type?: "string" | "integer" | "number" | "boolean" | "array" | "object" | "null";
  title?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: JsonSchemaProperty;
  format?: string;
  anyOf?: JsonSchemaProperty[];
  /** `json_schema_extra={"accept": [...]}` on a `list[UploadedFile]` field. */
  accept?: string[];
  /** `json_schema_extra={"max_files": N}` on a `list[UploadedFile]` field. */
  max_files?: number;
  [key: string]: unknown;
}

/** The subset of a Pydantic-generated JSON Schema object this module reads. */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface FieldDescriptor {
  name: string;
  label: string;
  help?: string;
  control: "text" | "textarea" | "number" | "slider" | "select" | "switch" | "files";
  options?: string[]; // for select (JSON Schema enum)
  min?: number;
  max?: number;
  step?: number; // number/slider
  accept?: string[];
  maxFiles?: number; // files (from json_schema_extra)
  required: boolean;
  default?: unknown;
}

/**
 * Unwraps a Pydantic `Optional[X]` property (`anyOf: [X, {type: "null"}]`)
 * to `X`'s own schema for control-mapping purposes. `title`/`description`/
 * `default` live on the outer property in both the wrapped and unwrapped
 * case, so callers should keep reading those from the ORIGINAL property,
 * not from the object this function returns.
 */
function unwrapOptional(prop: JsonSchemaProperty): { schema: JsonSchemaProperty; optional: boolean } {
  if (!prop.anyOf) {
    return { schema: prop, optional: false };
  }
  const nullBranch = prop.anyOf.find((branch) => branch.type === "null");
  const valueBranch = prop.anyOf.find((branch) => branch.type !== "null");
  if (nullBranch && valueBranch) {
    return { schema: valueBranch, optional: true };
  }
  // An `anyOf` without a null branch isn't Pydantic's `Optional[X]` shape
  // and isn't produced by this codebase's `Params` subclasses; fall back to
  // treating the property opaquely rather than guessing further.
  return { schema: prop, optional: false };
}

function isUploadedFileArray(schema: JsonSchemaProperty): boolean {
  return schema.type === "array" && schema.items?.type === "string" && schema.items.format === "binary";
}

function resolveControl(schema: JsonSchemaProperty): FieldDescriptor["control"] {
  if (isUploadedFileArray(schema)) {
    return "files";
  }
  if (schema.type === "boolean") {
    return "switch";
  }
  if (schema.type === "string") {
    return schema.enum ? "select" : "text";
  }
  if (schema.type === "integer" || schema.type === "number") {
    return schema.minimum !== undefined && schema.maximum !== undefined ? "slider" : "number";
  }
  // No other type is produced by a `Params`-derived schema (see file header
  // finding #5/#6 area); default to a plain text field rather than throwing,
  // so an unanticipated shape still renders as *something* usable.
  return "text";
}

/**
 * A slider's `step` for an `integer` field is always 1. For a `number`
 * (float) field, Pydantic's JSON Schema carries no `multipleOf`/step hint at
 * all for a plain `Field(ge=..., le=...)` — there is no real signal to
 * derive one from beyond the bounds themselves. This is a documented
 * heuristic, not something Pydantic emits: a range wider than 10 units gets
 * whole-number steps, a tighter range (e.g. a 0.0-2.0 temperature) gets
 * one-decimal-place steps, which is fine granularity for the kind of
 * bounded float knobs recipe params actually use.
 */
function reasonedNumberStep(min: number, max: number): number {
  const range = max - min;
  return range > 10 ? 1 : 0.1;
}

function applyControlSpecifics(field: FieldDescriptor, schema: JsonSchemaProperty): void {
  switch (field.control) {
    case "select":
      field.options = schema.enum ?? [];
      break;
    case "number":
    case "slider":
      if (schema.minimum !== undefined) field.min = schema.minimum;
      if (schema.maximum !== undefined) field.max = schema.maximum;
      if (field.control === "slider") {
        field.step = schema.type === "integer" ? 1 : reasonedNumberStep(schema.minimum ?? 0, schema.maximum ?? 0);
      }
      break;
    case "files":
      if (schema.accept) field.accept = schema.accept;
      if (schema.max_files !== undefined) field.maxFiles = schema.max_files;
      break;
    case "text":
    case "textarea":
    case "switch":
      break;
  }
}

/**
 * Builds the zod schema for one field. Deliberately does NOT call `.default()`
 * on the returned schema — this validator only checks shape/bounds (what a
 * submitted value must look like to be accepted), the same job Pydantic's
 * own JSON Schema validation would do server-side; filling in a default
 * value into the form's initial state is the run form UI's job (a later
 * task), not this compiler's.
 *
 * An optional field is wrapped `.nullable().optional()` (rather than only
 * `.optional()`) so it accepts BOTH omission and an explicit `null` —
 * matching Pydantic's own `Optional[X] = None`, which accepts both a
 * missing key and an explicit `null` in the JSON body.
 */
function buildFieldValidator(field: FieldDescriptor, schema: JsonSchemaProperty): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (field.control) {
    case "text":
    case "textarea":
      base = z.string();
      break;
    case "select": {
      const options = field.options ?? [];
      base = options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string();
      break;
    }
    case "switch":
      base = z.boolean();
      break;
    case "number":
    case "slider": {
      let numberValidator = z.number();
      if (schema.type === "integer") numberValidator = numberValidator.int();
      if (field.min !== undefined) numberValidator = numberValidator.min(field.min);
      if (field.max !== undefined) numberValidator = numberValidator.max(field.max);
      base = numberValidator;
      break;
    }
    case "files": {
      let filesValidator = z.array(z.instanceof(File));
      if (field.maxFiles !== undefined) filesValidator = filesValidator.max(field.maxFiles);
      base = field.required ? filesValidator.min(1) : filesValidator;
      break;
    }
    default: {
      const exhaustive: never = field.control;
      throw new Error(`Unhandled control: ${String(exhaustive)}`);
    }
  }

  return field.required ? base : base.nullable().optional();
}

/**
 * Compiles a recipe's `inputSchema` into the run form's field descriptors
 * and a matching zod validator. See this file's header comment for the
 * real-Pydantic-output findings behind every mapping rule below.
 */
export function compileForm(inputSchema: JsonSchema): { fields: FieldDescriptor[]; validator: z.ZodTypeAny } {
  const properties = inputSchema.properties ?? {};
  const requiredNames = new Set(inputSchema.required ?? []);
  const fields: FieldDescriptor[] = [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, rawProperty] of Object.entries(properties)) {
    const { schema: effective, optional } = unwrapOptional(rawProperty);
    // An `Optional` field (anyOf-with-null) is never required, regardless
    // of whether it also appears in the schema's top-level `required`
    // array (finding #2 above) — that array-membership check only matters
    // for a non-Optional field.
    const required = !optional && requiredNames.has(name);

    const field: FieldDescriptor = {
      name,
      label: rawProperty.title ?? name,
      control: resolveControl(effective),
      required,
    };
    if (rawProperty.description !== undefined) {
      field.help = rawProperty.description;
    }
    if ("default" in rawProperty) {
      field.default = rawProperty.default;
    }
    applyControlSpecifics(field, effective);

    fields.push(field);
    shape[name] = buildFieldValidator(field, effective);
  }

  return { fields, validator: z.object(shape) };
}
