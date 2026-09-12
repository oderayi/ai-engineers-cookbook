import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postRun, RunRequestError, type RunPayload } from "@/lib/execution/run-client";

const BACKEND = "https://backend.example.com";

/** Builds a `ReadableStream<Uint8Array>` from a raw SSE-framed string, matching what `parseSSEStream` expects. */
function sseStream(raw: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(raw));
      controller.close();
    },
  });
}

/** One `data:`-framed SSE event block for a given JS value, JSON-encoded. */
function sseEvent(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(raw: string, status = 200): Response {
  return new Response(sseStream(raw), {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const event of iterable) {
    out.push(event);
  }
  return out;
}

const BASE_PAYLOAD: RunPayload = {
  params: { question: "what is 2+2?" },
  config: { OPENAI_API_KEY: "sk-test" },
};

describe("postRun", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the right URL (slug-encoded) with method POST and the given signal", async () => {
    fetchMock.mockResolvedValue(sseResponse(""));
    const controller = new AbortController();

    await collect(postRun(BACKEND, "weird slug/x", BASE_PAYLOAD, controller.signal));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/recipes/${encodeURIComponent("weird slug/x")}/run`);
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
  });

  it("sends params and config as JSON-stringified form fields", async () => {
    fetchMock.mockResolvedValue(sseResponse(""));

    await collect(
      postRun(BACKEND, "recipe", { params: { a: 1, b: "two" }, config: { KEY: "value" } }, new AbortController().signal),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("params")).toBe(JSON.stringify({ a: 1, b: "two" }));
    expect(form.get("config")).toBe(JSON.stringify({ KEY: "value" }));
  });

  it("sends uploaded files as files[<fieldName>][] parts, one per file", async () => {
    fetchMock.mockResolvedValue(sseResponse(""));

    const file1 = new File(["hello"], "a.txt", { type: "text/plain" });
    const file2 = new File(["world"], "b.txt", { type: "text/plain" });

    await collect(
      postRun(
        BACKEND,
        "recipe",
        { ...BASE_PAYLOAD, files: { documents: [file1, file2] } },
        new AbortController().signal,
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const uploaded = form.getAll("files[documents][]");
    expect(uploaded).toHaveLength(2);
    expect(uploaded[0]).toBeInstanceOf(File);
    expect((uploaded[0] as File).name).toBe("a.txt");
    expect((uploaded[1] as File).name).toBe("b.txt");
  });

  it("sends no file parts for a field with no files selected", async () => {
    fetchMock.mockResolvedValue(sseResponse(""));

    await collect(postRun(BACKEND, "recipe", { ...BASE_PAYLOAD, files: {} }, new AbortController().signal));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const keys = Array.from(form.keys());
    expect(keys.every((k) => !k.startsWith("files["))).toBe(true);
  });

  it("yields correctly parsed events, in order, from a real 2xx SSE body", async () => {
    const stepStart = { type: "step", id: "s1", name: "Thinking", status: "start", detail: null, ts: 0.1 };
    const token = { type: "token", text: "hello" };
    const result = { type: "result", data: { ok: true }, ts: 1.0 };
    const raw = sseEvent(stepStart) + sseEvent(token) + sseEvent(result);

    fetchMock.mockResolvedValue(sseResponse(raw));

    const events = await collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal));

    expect(events).toEqual([stepStart, token, result]);
  });

  it("throws RunRequestError with status and parsed body on a 422, without iterating anything", async () => {
    const errorBody = { detail: [{ loc: ["params", "x"], msg: "field required" }] };
    fetchMock.mockResolvedValue(jsonResponse(422, errorBody));

    const iterator = postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal)[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      name: "RunRequestError",
      status: 422,
      body: errorBody,
    });
  });

  it("throws RunRequestError with status 429 and the rate-limit contract body", async () => {
    const rateLimitBody = {
      error: "rate_limited",
      scope: "trial_daily",
      message: "You've used your 2 free runs today.",
      retry_after_seconds: 34567,
      cta: "add_key",
    };
    fetchMock.mockResolvedValue(jsonResponse(429, rateLimitBody));

    let caught: unknown;
    try {
      await collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RunRequestError);
    expect((caught as RunRequestError).status).toBe(429);
    expect((caught as RunRequestError).body).toEqual(rateLimitBody);
  });

  it("falls back to an undefined body when a non-2xx response isn't valid JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("not json", { status: 500, headers: { "content-type": "text/plain" } }),
    );

    let caught: unknown;
    try {
      await collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RunRequestError);
    expect((caught as RunRequestError).status).toBe(500);
    expect((caught as RunRequestError).body).toBeUndefined();
  });

  it("throws when a stream event's JSON payload doesn't match any of the 7 event schemas", async () => {
    const goodEvent = { type: "token", text: "hi" };
    const badEvent = { type: "not_a_real_event", whatever: 1 };
    const raw = sseEvent(goodEvent) + sseEvent(badEvent);
    fetchMock.mockResolvedValue(sseResponse(raw));

    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const event of postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal)) {
          seen.push(event);
        }
      })(),
    ).rejects.toMatchObject({ name: "RunRequestError" });

    expect(seen).toEqual([goodEvent]);
  });

  it("throws when a stream event's data: payload isn't valid JSON at all", async () => {
    const raw = "data: {not valid json\n\n";
    fetchMock.mockResolvedValue(sseResponse(raw));

    await expect(collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal))).rejects.toMatchObject({
      name: "RunRequestError",
    });
  });

  it("throws a clear error rather than crashing when a 2xx response has a null body", async () => {
    const response = new Response(null, { status: 200 });
    fetchMock.mockResolvedValue(response);

    await expect(collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, new AbortController().signal))).rejects.toMatchObject({
      name: "RunRequestError",
      status: 200,
    });
  });

  it("does not swallow an already-aborted signal — fetch's own AbortError propagates", async () => {
    const controller = new AbortController();
    controller.abort();

    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      if (init.signal?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return Promise.resolve(sseResponse(""));
    });

    await expect(collect(postRun(BACKEND, "recipe", BASE_PAYLOAD, controller.signal))).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("stops iteration when the signal aborts mid-stream, without swallowing or altering the abort", async () => {
    const controller = new AbortController();
    const stepStart = { type: "step", id: "s1", name: "Thinking", status: "start", detail: null, ts: 0.1 };

    // A stream that yields one event, then stalls (never closes) — abort
    // must be what ends iteration, not stream completion.
    const encoder = new TextEncoder();
    let pull: ((c: ReadableStreamDefaultController<Uint8Array>) => void) | undefined;
    const stalling = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(sseEvent(stepStart)));
        pull = () => {
          // Never enqueue more, never close — simulates a long-lived stream.
        };
      },
      pull(c) {
        pull?.(c);
      },
    });

    fetchMock.mockResolvedValue(new Response(stalling, { status: 200 }));

    const seen: unknown[] = [];
    const iterationPromise = (async () => {
      for await (const event of postRun(BACKEND, "recipe", BASE_PAYLOAD, controller.signal)) {
        seen.push(event);
        controller.abort();
      }
    })();

    await iterationPromise;
    expect(seen).toEqual([stepStart]);
  });
});
