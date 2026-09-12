import { z } from "zod";

import { RecipeDetail, RecipeSummary, SourceBundle } from "@/lib/api/models";

/**
 * Fixed for this module's lifetime — read once at module load, never
 * re-read per-call. `settings.customBackendUrl` (a per-session, user-
 * editable override) is deliberately NOT consulted here: per the plan's
 * architecture decision, threading a runtime-configurable base URL through
 * fetches is `execution`'s concern (it already composes with `useSettings`),
 * not this read-only catalog client's.
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/**
 * Thrown by every function in this module instead of a raw `fetch` rejection
 * or `ZodError` — callers (react-query's `useQuery`, and anything unwrapping
 * its `error`) get one catchable, typed shape no matter whether the failure
 * was a network error, a non-2xx status, or a response that parsed as JSON
 * but didn't match the expected schema.
 *
 * `status` is the distinguishing signal: `0` for a request that never got a
 * response (network failure), otherwise the HTTP status code. A caller that
 * needs to special-case "not found" (e.g. `app/r/[slug]/page.tsx` calling
 * Next's `notFound()`) checks `error.status === 404`.
 */
export class RecipeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecipeApiError";
    this.status = status;
  }
}

interface FetchedJson {
  data: unknown;
  status: number;
}

/**
 * Runs the actual `fetch`, wrapping every way it can fail (network failure,
 * non-2xx status, a 2xx body that isn't valid JSON) into a `RecipeApiError`.
 * Never returns anything but a successfully-decoded JSON value alongside the
 * status it arrived with, so callers only have to handle schema validation.
 */
async function fetchJson(url: string): Promise<FetchedJson> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (cause) {
    throw new RecipeApiError(`Network error while requesting ${url}`, 0, { cause });
  }

  if (!response.ok) {
    throw new RecipeApiError(
      `Request to ${url} failed with status ${response.status}`,
      response.status,
    );
  }

  try {
    const data: unknown = await response.json();
    return { data, status: response.status };
  } catch (cause) {
    throw new RecipeApiError(
      `Response from ${url} was not valid JSON`,
      response.status,
      { cause },
    );
  }
}

/**
 * Parses `data` through `schema`, wrapping a validation failure in a
 * `RecipeApiError` rather than letting a raw `ZodError` escape to callers.
 */
function parse<T>(schema: z.ZodType<T>, data: unknown, url: string, status: number): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new RecipeApiError(
      `Response from ${url} did not match the expected shape`,
      status,
      { cause: result.error },
    );
  }
  return result.data;
}

export async function listRecipes(): Promise<RecipeSummary[]> {
  const url = `${BACKEND_URL}/recipes`;
  const { data, status } = await fetchJson(url);
  return parse(z.array(RecipeSummary), data, url, status);
}

export async function getRecipe(slug: string): Promise<RecipeDetail> {
  const url = `${BACKEND_URL}/recipes/${encodeURIComponent(slug)}`;
  const { data, status } = await fetchJson(url);
  return parse(RecipeDetail, data, url, status);
}

export async function getSource(slug: string): Promise<SourceBundle> {
  const url = `${BACKEND_URL}/recipes/${encodeURIComponent(slug)}/source`;
  const { data, status } = await fetchJson(url);
  return parse(SourceBundle, data, url, status);
}
