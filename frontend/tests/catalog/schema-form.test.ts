import { describe, expect, it } from "vitest";

import { compileForm, type FieldDescriptor, type JsonSchema } from "@/lib/catalog/schema-form";

/**
 * Every schema fixture below is REAL `model_json_schema()` output, generated
 * against `../backend`'s actual `skillet.recipe.params.Params` base class and
 * `UploadedFile` type (never hand-typed), per this task's own instructions.
 * Generation commands (`cd backend && uv run python -c "..."`) and their raw
 * output are reproduced in the PR/task report, not here — this file only
 * pastes the resulting JSON as fixture input.
 *
 * Three findings from generating this output that shaped the implementation
 * (see `schema-form.ts` for the full writeup):
 *
 * 1. `Optional[str] = None` → `{"anyOf": [{"type": "string"}, {"type":
 *    "null"}], "default": null, "title": "..."}` — never a bare
 *    `{"type": "string", "nullable": true}`.
 * 2. `Optional[str]` with NO default (no `= None`) is still `anyOf`-wrapped
 *    but ALSO lands in the schema's top-level `required` array (Pydantic v2
 *    doesn't implicitly default an `Optional` with no explicit default) —
 *    this genuinely surprised us; it means "unwrap anyOf → required: false
 *    always" cannot be skipped as a redundant case ("it's never in
 *    `required` anyway"). See `requiredOptionalNoDefault` below.
 * 3. `Field(json_schema_extra={"accept": [...], "max_files": N})` on a
 *    `list[UploadedFile]` field puts `accept`/`max_files` FLAT on the
 *    property object, snake_case, with no alias-casing applied (that
 *    generator only wraps `api/schemas.py`'s own response models).
 */

const plainRequiredString: JsonSchema = {
  additionalProperties: false,
  properties: {
    question: { title: "Question", type: "string" },
  },
  required: ["question"],
  title: "P1",
  type: "object",
};

const enumAndIntWithMinMax: JsonSchema = {
  additionalProperties: false,
  properties: {
    tokenizer: { enum: ["gpt-4", "claude", "llama"], title: "Tokenizer", type: "string" },
    max_tokens: { default: 512, maximum: 4096, minimum: 1, title: "Max Tokens", type: "integer" },
  },
  required: ["tokenizer"],
  title: "P2",
  type: "object",
};

const intMinMaxWithDefaultNotRequired: JsonSchema = {
  additionalProperties: false,
  properties: {
    keyword_weight: { default: 50, maximum: 100, minimum: 0, title: "Keyword Weight", type: "integer" },
  },
  title: "P3",
  type: "object",
};

const floatMinMaxWithDefault: JsonSchema = {
  additionalProperties: false,
  properties: {
    temperature: { default: 0.7, maximum: 2.0, minimum: 0.0, title: "Temperature", type: "number" },
  },
  title: "P4",
  type: "object",
};

const boolWithDefault: JsonSchema = {
  additionalProperties: false,
  properties: {
    use_cache: { default: true, title: "Use Cache", type: "boolean" },
  },
  title: "P5",
  type: "object",
};

const optionalStringWithDefaultNull: JsonSchema = {
  additionalProperties: false,
  properties: {
    note: {
      anyOf: [{ type: "string" }, { type: "null" }],
      default: null,
      title: "Note",
    },
  },
  title: "P6",
  type: "object",
};

const uploadedFileList: JsonSchema = {
  additionalProperties: false,
  properties: {
    documents: {
      accept: [".txt", ".md"],
      items: { format: "binary", type: "string" },
      max_files: 3,
      title: "Documents",
      type: "array",
    },
  },
  required: ["documents"],
  title: "P7",
  type: "object",
};

const intWithOnlyMinBound: JsonSchema = {
  additionalProperties: false,
  properties: {
    threshold: { default: 5, minimum: 0, title: "Threshold", type: "integer" },
  },
  title: "P8",
  type: "object",
};

const stringWithDescription: JsonSchema = {
  additionalProperties: false,
  properties: {
    label: { description: "A helpful description shown to the user.", title: "Label", type: "string" },
  },
  required: ["label"],
  title: "P9",
  type: "object",
};

const optionalEnumWithDefaultNull: JsonSchema = {
  additionalProperties: false,
  properties: {
    note: {
      anyOf: [{ enum: ["a", "b"], type: "string" }, { type: "null" }],
      default: null,
      title: "Note",
    },
  },
  title: "P10",
  type: "object",
};

const optionalConstrainedIntWithDefaultNull: JsonSchema = {
  additionalProperties: false,
  properties: {
    count: {
      anyOf: [{ maximum: 10, minimum: 0, type: "integer" }, { type: "null" }],
      default: null,
      title: "Count",
    },
  },
  title: "P11",
  type: "object",
};

/** The surprising case (finding #2 above): `Optional[str]` with NO default
 * is `anyOf`-wrapped but STILL appears in the top-level `required` array. */
const requiredOptionalNoDefault: JsonSchema = {
  additionalProperties: false,
  properties: {
    note: {
      anyOf: [{ type: "string" }, { type: "null" }],
      title: "Note",
    },
  },
  required: ["note"],
  title: "P12",
  type: "object",
};

/**
 * `list[str]` (plain, non-file) — real generated shape confirmed while
 * closing a gap flagged after Task 5's own report: this codebase's
 * `embeddings-101` catalog fixture (`tests/fixtures/catalog/recipes.ts`)
 * has a `texts: list[str]` field with no mapping rule originally given.
 * Repurposes `"textarea"` (one item per line), the only control in the
 * union that fits, rather than inventing a new one.
 */
const plainStringList: JsonSchema = {
  additionalProperties: false,
  properties: {
    texts: { items: { type: "string" }, title: "Texts", type: "array" },
  },
  required: ["texts"],
  title: "P13",
  type: "object",
};

const emptySchema: JsonSchema = {
  additionalProperties: false,
  properties: {},
  title: "Empty",
  type: "object",
};

/** A 6-field model exercising every control type at once, to check that
 * `fields` output order matches `properties` declaration order (not
 * alphabetical — note `mode`/`query` are NOT alphabetically first). */
const combinedMultiField: JsonSchema = {
  additionalProperties: false,
  properties: {
    query: { title: "Query", type: "string" },
    mode: { enum: ["fast", "accurate"], title: "Mode", type: "string" },
    temperature: { default: 0.7, maximum: 2.0, minimum: 0.0, title: "Temperature", type: "number" },
    use_cache: { default: true, title: "Use Cache", type: "boolean" },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
      default: null,
      title: "Notes",
    },
    attachments: {
      accept: [".pdf"],
      items: { format: "binary", type: "string" },
      max_files: 2,
      title: "Attachments",
      type: "array",
    },
  },
  required: ["query", "mode", "attachments"],
  title: "Combined",
  type: "object",
};

describe("compileForm — field mapping (table-driven, real Pydantic schemas)", () => {
  const cases: Array<{ name: string; schema: JsonSchema; expected: FieldDescriptor[] }> = [
    {
      name: "plain string, required",
      schema: plainRequiredString,
      expected: [{ name: "question", label: "Question", control: "text", required: true }],
    },
    {
      name: "string enum -> select, int with min+max -> slider",
      schema: enumAndIntWithMinMax,
      expected: [
        { name: "tokenizer", label: "Tokenizer", control: "select", options: ["gpt-4", "claude", "llama"], required: true },
        { name: "max_tokens", label: "Max Tokens", control: "slider", min: 1, max: 4096, step: 1, required: false, default: 512 },
      ],
    },
    {
      name: "int with min+max and a default -> slider, not required (defaulted, absent from top-level required)",
      schema: intMinMaxWithDefaultNotRequired,
      expected: [
        { name: "keyword_weight", label: "Keyword Weight", control: "slider", min: 0, max: 100, step: 1, required: false, default: 50 },
      ],
    },
    {
      name: "number (float) with min+max -> slider with a reasoned (non-integer) step",
      schema: floatMinMaxWithDefault,
      expected: [
        { name: "temperature", label: "Temperature", control: "slider", min: 0, max: 2, step: 0.1, required: false, default: 0.7 },
      ],
    },
    {
      name: "boolean with default -> switch",
      schema: boolWithDefault,
      expected: [{ name: "use_cache", label: "Use Cache", control: "switch", required: false, default: true }],
    },
    {
      name: "Optional[str] = None -> text, unwrapped, required: false, default: null preserved",
      schema: optionalStringWithDefaultNull,
      expected: [{ name: "note", label: "Note", control: "text", required: false, default: null }],
    },
    {
      name: "list[UploadedFile] with accept/max_files -> files, snake_case read into camelCase",
      schema: uploadedFileList,
      expected: [
        { name: "documents", label: "Documents", control: "files", accept: [".txt", ".md"], maxFiles: 3, required: true },
      ],
    },
    {
      name: "int with only a minimum -> number (not slider), min set, max absent",
      schema: intWithOnlyMinBound,
      expected: [{ name: "threshold", label: "Threshold", control: "number", min: 0, required: false, default: 5 }],
    },
    {
      name: "string with a description -> help set from description",
      schema: stringWithDescription,
      expected: [
        { name: "label", label: "Label", help: "A helpful description shown to the user.", control: "text", required: true },
      ],
    },
    {
      name: "Optional[Literal[...]] = None -> select, unwrapped, required: false",
      schema: optionalEnumWithDefaultNull,
      expected: [
        { name: "note", label: "Note", control: "select", options: ["a", "b"], required: false, default: null },
      ],
    },
    {
      name: "Optional[int] with min+max = None -> slider, unwrapped, required: false",
      schema: optionalConstrainedIntWithDefaultNull,
      expected: [
        { name: "count", label: "Count", control: "slider", min: 0, max: 10, step: 1, required: false, default: null },
      ],
    },
    {
      name: "Optional[str] with NO default, present in top-level required -> still required: false",
      schema: requiredOptionalNoDefault,
      expected: [{ name: "note", label: "Note", control: "text", required: false }],
    },
    {
      name: "list[str] (plain, non-file) -> textarea, one item per line",
      schema: plainStringList,
      expected: [{ name: "texts", label: "Texts", control: "textarea", required: true }],
    },
    {
      name: "empty schema -> no fields",
      schema: emptySchema,
      expected: [],
    },
  ];

  for (const { name, schema, expected } of cases) {
    it(name, () => {
      const { fields } = compileForm(schema);
      expect(fields).toEqual(expected);
    });
  }

  it("never sets help when description is absent (no 'help: undefined' key)", () => {
    const { fields } = compileForm(plainRequiredString);
    expect(fields[0] && "help" in fields[0]).toBe(false);
  });

  it("never sets a default key when the schema property has no default", () => {
    const { fields } = compileForm(plainRequiredString);
    expect(fields[0] && "default" in fields[0]).toBe(false);
  });

  it("preserves properties declaration order in the output fields array (not alphabetical)", () => {
    const { fields } = compileForm(combinedMultiField);
    expect(fields.map((f) => f.name)).toEqual([
      "query",
      "mode",
      "temperature",
      "use_cache",
      "notes",
      "attachments",
    ]);
  });

  it("maps every control type correctly within one combined schema", () => {
    const { fields } = compileForm(combinedMultiField);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.query?.control).toBe("text");
    expect(byName.mode?.control).toBe("select");
    expect(byName.temperature?.control).toBe("slider");
    expect(byName.use_cache?.control).toBe("switch");
    expect(byName.notes?.control).toBe("text");
    expect(byName.attachments?.control).toBe("files");

    expect(byName.query?.required).toBe(true);
    expect(byName.mode?.required).toBe(true);
    expect(byName.attachments?.required).toBe(true);
    expect(byName.temperature?.required).toBe(false);
    expect(byName.use_cache?.required).toBe(false);
    expect(byName.notes?.required).toBe(false);
  });
});

describe("compileForm — validator", () => {
  it("empty/no-properties schema compiles to a validator that accepts {}", () => {
    const { fields, validator } = compileForm(emptySchema);

    expect(fields).toEqual([]);
    expect(validator.safeParse({}).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { validator } = compileForm(plainRequiredString);

    expect(validator.safeParse({}).success).toBe(false);
    expect(validator.safeParse({ question: "hi" }).success).toBe(true);
  });

  it("rejects a value of the wrong type for a required string field", () => {
    const { validator } = compileForm(plainRequiredString);

    expect(validator.safeParse({ question: 42 }).success).toBe(false);
  });

  it("applies min/max bounds for a slider (int) field and rejects out-of-range values", () => {
    const { validator } = compileForm(enumAndIntWithMinMax);
    const valid = { tokenizer: "gpt-4", max_tokens: 2048 };

    expect(validator.safeParse(valid).success).toBe(true);
    expect(validator.safeParse({ ...valid, max_tokens: 4097 }).success).toBe(false);
    expect(validator.safeParse({ ...valid, max_tokens: 0 }).success).toBe(false);
    // Non-integer number for an `integer`-typed field must be rejected.
    expect(validator.safeParse({ ...valid, max_tokens: 10.5 }).success).toBe(false);
  });

  it("applies min/max bounds for a slider (number/float) field", () => {
    const { validator } = compileForm(floatMinMaxWithDefault);

    expect(validator.safeParse({ temperature: 1.5 }).success).toBe(true);
    expect(validator.safeParse({ temperature: 2.1 }).success).toBe(false);
    expect(validator.safeParse({ temperature: -0.1 }).success).toBe(false);
    // Non-integer floats are fine for a `number`-typed (not `integer`) field.
    expect(validator.safeParse({ temperature: 1.23 }).success).toBe(true);
  });

  it("treats an Optional field as accepting BOTH omission and explicit null", () => {
    const { validator } = compileForm(optionalStringWithDefaultNull);

    expect(validator.safeParse({}).success).toBe(true);
    expect(validator.safeParse({ note: null }).success).toBe(true);
    expect(validator.safeParse({ note: "hello" }).success).toBe(true);
    expect(validator.safeParse({ note: 42 }).success).toBe(false);
  });

  it("treats the surprising required-but-Optional field (finding #2) as NOT required by the validator either", () => {
    const { validator } = compileForm(requiredOptionalNoDefault);

    expect(validator.safeParse({}).success).toBe(true);
    expect(validator.safeParse({ note: null }).success).toBe(true);
    expect(validator.safeParse({ note: "hello" }).success).toBe(true);
  });

  it("validates a select (enum) field, rejecting values outside the enum", () => {
    const { validator } = compileForm(enumAndIntWithMinMax);

    expect(validator.safeParse({ tokenizer: "claude", max_tokens: 1 }).success).toBe(true);
    expect(validator.safeParse({ tokenizer: "not-a-real-option", max_tokens: 1 }).success).toBe(false);
  });

  it("validates a boolean (switch) field, rejecting non-booleans", () => {
    const { validator } = compileForm(boolWithDefault);

    expect(validator.safeParse({ use_cache: false }).success).toBe(true);
    expect(validator.safeParse({ use_cache: "false" }).success).toBe(false);
  });

  it("validates a files field: required means at least one File, and caps at maxFiles", () => {
    const { validator } = compileForm(uploadedFileList);
    const file = new File(["hello"], "a.txt", { type: "text/plain" });

    expect(validator.safeParse({ documents: [file] }).success).toBe(true);
    expect(validator.safeParse({ documents: [] }).success).toBe(false);
    expect(validator.safeParse({ documents: [file, file, file, file] }).success).toBe(false);
    expect(validator.safeParse({ documents: ["not-a-file"] }).success).toBe(false);
  });

  it("validates a list[str] (textarea) field as an array of strings, not a plain string", () => {
    const { validator } = compileForm(plainStringList);

    expect(validator.safeParse({ texts: ["a", "b"] }).success).toBe(true);
    expect(validator.safeParse({ texts: [] }).success).toBe(true); // required means present, not non-empty
    expect(validator.safeParse({ texts: "a single string" }).success).toBe(false);
    expect(validator.safeParse({}).success).toBe(false); // required field, must be present
  });

  it("validates the full combined schema end to end for a realistic valid submission", () => {
    const { validator } = compileForm(combinedMultiField);
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    const valid = {
      query: "hello",
      mode: "fast",
      temperature: 1.1,
      use_cache: true,
      notes: null,
      attachments: [file],
    };
    expect(validator.safeParse(valid).success).toBe(true);

    // Omitting the always-optional `notes` key entirely is also valid.
    const withoutNotes: Partial<typeof valid> = { ...valid };
    delete withoutNotes.notes;
    expect(validator.safeParse(withoutNotes).success).toBe(true);

    // Missing a required field fails.
    const withoutQuery: Partial<typeof valid> = { ...valid };
    delete withoutQuery.query;
    expect(validator.safeParse(withoutQuery).success).toBe(false);
  });
});
