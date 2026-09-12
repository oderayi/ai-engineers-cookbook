import { parseRecipeEvent, type RecipeEvent } from "@/lib/execution/events";
import { parseSSEStream } from "@/lib/execution/sse";

/**
 * The request body for `POST /recipes/{slug}/run` (see
 * `docs/SPEC-execution.md`'s "Confirmed decisions" #1-#4).
 *
 * - `params`: the recipe's input params (validated against the recipe's
 *   `Params` model server-side — this client does not re-validate them).
 * - `config`: the already-resolved `envKey -> value` map. Per the spec, "the
 *   server never computes config" — this client sends `payload.config`
 *   verbatim, exactly as handed to it. Resolving/validating which env keys a
 *   recipe declares, merging global vs. per-recipe overrides, etc. is
 *   `settings`'/the caller's job, not this module's.
 * - `files`: optional uploads, keyed by the recipe's declared file `Params`
 *   field name, each with the `File[]` selected for that field (a field can
 *   accept multiple files). Omit the key (or pass `[]`) for a field with no
 *   files selected.
 */
export interface RunPayload {
  params: Record<string, unknown>;
  config: Record<string, string>;
  files?: Record<string, File[]>;
}

/**
 * Thrown by `postRun` for anything that isn't a successfully-streamed 2xx
 * SSE response: a non-2xx HTTP status, a 2xx response with a null body, a
 * stream event whose payload isn't valid JSON, or JSON that doesn't match
 * any of the 7 `RecipeEvent` schemas.
 *
 * `status` is always the HTTP response's status code (there is no "0 for
 * network failure" case here, unlike `lib/api/recipes.ts`'s `RecipeApiError`
 * — a `fetch` rejection, e.g. from an aborted signal, propagates as-is
 * rather than being wrapped, since `postRun` must not interfere with the
 * caller's own `AbortSignal` handling; see the module doc comment below).
 *
 * `body` is the parsed JSON body of an error response when one was present
 * and valid (e.g. the `429` rate-limit contract's shape, or a `422`
 * validation error's shape) — `undefined` if the response had no body, an
 * unparseable body, or (for the malformed-event cases) is the offending raw
 * value instead: the raw string for invalid JSON, the parsed-but-invalid
 * JSON value for a schema mismatch.
 */
export class RunRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "RunRequestError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Streams a recipe run and yields its `RecipeEvent`s in order.
 *
 * ## Wire convention — file upload field names (the backend MUST match this)
 *
 * The request is `multipart/form-data` with exactly these parts:
 *   - `params`  — `JSON.stringify(payload.params)`, one text part.
 *   - `config`  — `JSON.stringify(payload.config)`, one text part.
 *   - one file part per uploaded file, named `files[<fieldName>][]` where
 *     `<fieldName>` is the recipe's declared file `Params` field name — e.g.
 *     two files uploaded for a field named `documents` produce two parts
 *     both named `files[documents][]`, each carrying one file (this is the
 *     traditional PHP/Rails-style "repeated bracket key" convention for a
 *     multi-value form field, chosen because it groups a field's files under
 *     one predictable, greppable key that's still one key per field — the
 *     backend parses it by reading `form.getlist("files[<fieldName>][]")`
 *     per declared file field, rather than needing a separate convention per
 *     field or a single flat `files` key it must disambiguate itself).
 *     A field with zero files selected has no parts at all (never an empty
 *     placeholder part).
 *
 * ## Error handling
 *
 * A non-2xx response is rejected via a thrown `RunRequestError` BEFORE its
 * body is ever treated as an event stream — an error response (422, 413,
 * 429, 5xx, ...) is a single JSON object, not `text/event-stream`, and
 * attempting `parseSSEStream` on it would silently produce nothing useful.
 * If the error body parses as JSON it's attached as `error.body`; otherwise
 * `body` is left `undefined` rather than throwing a second, confusing error
 * out of the error-handling path itself.
 *
 * Once inside the 2xx stream, each raw SSE payload is `JSON.parse`d and then
 * validated with `parseRecipeEvent` (`lib/execution/events.ts`). Either step
 * failing throws a `RunRequestError` rather than yielding `undefined` or
 * silently skipping the malformed event — a caller iterating with
 * `for await` should never have to guard against a bad value slipping
 * through.
 *
 * ## Abort handling
 *
 * `signal` is passed straight through to both the initiating `fetch` (so an
 * already-aborted signal rejects the request immediately, before any bytes
 * are sent) and to `parseSSEStream` (which races its own reads against the
 * signal — see that module's doc comment for details). This function adds
 * no abort handling of its own on top of that: it neither catches nor
 * rewraps an abort-driven rejection, so the caller's `AbortSignal` behaves
 * exactly as it would calling `fetch`/`parseSSEStream` directly.
 *
 * Returns an `AsyncIterable<RecipeEvent>` (backed by an async generator) so
 * callers can do `for await (const event of postRun(...))`.
 */
export function postRun(
  backend: string,
  slug: string,
  payload: RunPayload,
  signal: AbortSignal,
): AsyncIterable<RecipeEvent> {
  return streamRun(backend, slug, payload, signal);
}

async function* streamRun(
  backend: string,
  slug: string,
  payload: RunPayload,
  signal: AbortSignal,
): AsyncGenerator<RecipeEvent, void, void> {
  const url = `${backend}/recipes/${encodeURIComponent(slug)}/run`;

  const response = await fetch(url, {
    method: "POST",
    body: buildFormData(payload),
    signal,
  });

  if (!response.ok) {
    const body = await tryParseJson(response);
    throw new RunRequestError(
      `Request to ${url} failed with status ${response.status}`,
      response.status,
      body,
    );
  }

  if (response.body === null) {
    throw new RunRequestError(
      `Response from ${url} had status ${response.status} but no body to stream`,
      response.status,
    );
  }

  for await (const raw of parseSSEStream(response.body, signal)) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (cause) {
      throw new RunRequestError(
        `Received a malformed (non-JSON) event from ${url}`,
        response.status,
        raw,
        { cause },
      );
    }

    let event: RecipeEvent;
    try {
      event = parseRecipeEvent(json);
    } catch (cause) {
      throw new RunRequestError(
        `Received an event from ${url} that did not match any of the 7 recipe event schemas`,
        response.status,
        json,
        { cause },
      );
    }

    yield event;
  }
}

/** Builds the `multipart/form-data` body — see this file's doc comment for the wire convention. */
function buildFormData(payload: RunPayload): FormData {
  const form = new FormData();
  form.append("params", JSON.stringify(payload.params));
  form.append("config", JSON.stringify(payload.config));

  for (const [fieldName, files] of Object.entries(payload.files ?? {})) {
    for (const file of files) {
      form.append(`files[${fieldName}][]`, file, file.name);
    }
  }

  return form;
}

/** Best-effort JSON parse of an error response's body — `undefined` rather than throwing if it isn't valid JSON. */
async function tryParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
