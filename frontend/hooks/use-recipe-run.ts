"use client";

import { useCallback, useReducer, useRef } from "react";

import { useBackendBaseUrl } from "@/lib/execution/backend-url";
import type { ErrorEvent, RecipeEvent, ResultEvent } from "@/lib/execution/events";
import { RateLimitPayload } from "@/lib/execution/rate-limit";
import { postRun, RunRequestError, type RunPayload } from "@/lib/execution/run-client";

export type RunStatus = "idle" | "running" | "done" | "error";

/**
 * A run can fail three distinct ways, and a caller (`<RunOutput>`, a later
 * task) needs to render each differently:
 * - `"rate_limit"`: a `429` whose body matched the rate-limit contract —
 *   renders `<RateLimitNotice>`, never `<RunError>` (an explicit spec
 *   requirement, not just a style choice).
 * - `"transport"`: any other non-2xx status or network-level failure
 *   before/without a usable event stream.
 * - `"stream"`: the connection succeeded and events streamed, but the run
 *   itself ended in a terminal `ErrorEvent` (a real `error_type` from
 *   `recipe-framework`'s executor) — `events` still holds everything
 *   streamed before it, so partial output stays available to render
 *   alongside this.
 */
export interface RunFailure {
  kind: "rate_limit" | "transport" | "stream";
  message: string;
  status?: number;
  rateLimit?: RateLimitPayload;
  errorType?: ErrorEvent["error_type"];
  recoverable?: boolean;
}

interface RunState {
  status: RunStatus;
  events: RecipeEvent[];
  result: ResultEvent | null;
  error: RunFailure | null;
}

const initialState: RunState = { status: "idle", events: [], result: null, error: null };

type Action =
  | { t: "start" }
  | { t: "event"; ev: RecipeEvent }
  | { t: "failure"; error: RunFailure }
  | { t: "reset" };

function runReducer(state: RunState, action: Action): RunState {
  switch (action.t) {
    case "start":
      return { status: "running", events: [], result: null, error: null };
    case "reset":
      return initialState;
    case "event": {
      const events = [...state.events, action.ev];
      if (action.ev.type === "result") {
        return { status: "done", events, result: action.ev, error: null };
      }
      if (action.ev.type === "error") {
        return {
          status: "error",
          events,
          result: null,
          error: {
            kind: "stream",
            message: action.ev.message,
            errorType: action.ev.error_type,
            recoverable: action.ev.recoverable,
          },
        };
      }
      return { ...state, events };
    }
    case "failure":
      return { ...state, status: "error", error: action.error };
    default:
      return state;
  }
}

function classifyFailure(e: unknown): RunFailure {
  if (e instanceof RunRequestError) {
    if (e.status === 429) {
      const parsed = RateLimitPayload.safeParse(e.body);
      if (parsed.success) {
        return { kind: "rate_limit", message: parsed.data.message, status: 429, rateLimit: parsed.data };
      }
    }
    return { kind: "transport", message: e.message, status: e.status };
  }
  if (e instanceof Error) {
    return { kind: "transport", message: e.message };
  }
  return { kind: "transport", message: "An unknown error occurred while starting the run." };
}

export interface UseRecipeRunResult {
  status: RunStatus;
  events: RecipeEvent[];
  result: ResultEvent | null;
  error: RunFailure | null;
  start: (payload: RunPayload) => void;
  cancel: () => void;
}

/**
 * `useRecipeRun(slug)` — per `SPEC-execution.md`'s Code Style sample. Targets
 * `useBackendBaseUrl()` (`settings.customBackendUrl` or the default backend).
 *
 * `start()` while a run is already in flight aborts the previous one first
 * (cancel-and-restart, per Open Question 5's leaning — no queueing, no
 * blocking) rather than running two streams concurrently. `cancel()` aborts
 * the in-flight run and resets to `"idle"` — a user-initiated cancel is not
 * a failure and must not render as one; an abort-driven rejection from
 * `postRun` is recognized via the *locally captured* `AbortController` (not
 * whatever `ctrl.current` happens to point at by the time the rejection is
 * observed) and swallowed rather than dispatched as a `"failure"`.
 */
export function useRecipeRun(slug: string): UseRecipeRunResult {
  const backend = useBackendBaseUrl();
  const [state, dispatch] = useReducer(runReducer, initialState);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(
    (payload: RunPayload) => {
      ctrl.current?.abort();
      const controller = new AbortController();
      ctrl.current = controller;
      dispatch({ t: "start" });

      void (async () => {
        try {
          for await (const ev of postRun(backend, slug, payload, controller.signal)) {
            if (controller.signal.aborted) return;
            dispatch({ t: "event", ev });
          }
        } catch (e) {
          if (controller.signal.aborted) return; // user-initiated cancel, not a real failure
          dispatch({ t: "failure", error: classifyFailure(e) });
        }
      })();
    },
    [backend, slug],
  );

  const cancel = useCallback(() => {
    if (ctrl.current) {
      ctrl.current.abort();
      dispatch({ t: "reset" });
    }
  }, []);

  return { ...state, start, cancel };
}
