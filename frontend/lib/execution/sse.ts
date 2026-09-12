/**
 * Hand-rolled Server-Sent-Events (SSE) wire parser.
 *
 * The backend streams `text/event-stream` over a `POST` response. Browsers'
 * native `EventSource` can't POST, so the real client (`run-client.ts`, a
 * later task) reads the response body via `fetch` + a `ReadableStream`
 * reader instead — which means nothing in the platform parses the SSE
 * framing for us. This module does that parsing by hand, against the real
 * spec (not a simplified guess):
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 *
 * ## Signature choice
 *
 * `parseSSEStream(stream: ReadableStream<Uint8Array>, signal?: AbortSignal)`
 * was chosen over an `AsyncIterable<Uint8Array | string>` input because the
 * real caller (`run-client.ts`) gets a `ReadableStream<Uint8Array>` directly
 * from `Response.body` — taking that shape means the caller hands us the
 * stream as-is instead of wrapping it in an adapter first.
 *
 * ## What this module decided about the spec's grey areas
 *
 * - **Line endings**: the spec (and this backend) terminate lines with a
 *   bare `\n`, but real SSE also allows `\r\n` and a bare `\r`. All three are
 *   handled here (see `splitLines`) even though only `\n` is expected in
 *   practice, because a proxy or a different backend in front of this same
 *   client could normalize differently. A trailing lone `\r` at the very end
 *   of a chunk is treated as "wait for more data" (it might be the first
 *   half of a `\r\n` split across a network chunk boundary) unless the
 *   stream has actually ended.
 * - **Empty `data:` payload**: a `data:` line with nothing after the colon
 *   (or just `data`) is valid SSE and means "this event's payload is the
 *   empty string" — distinct from an event block with *no* `data:` line at
 *   all, which fires nothing. So a blank-line-terminated block containing
 *   one bare `data:` line yields `""`, not "nothing".
 * - **Trailing unterminated data at end-of-stream**: per spec, a line is
 *   only recognized once its terminator arrives, and an event only ever
 *   dispatches on its terminating *blank* line. If the stream ends with
 *   buffered `data:` content that never received its blank-line terminator
 *   (e.g. a connection drop mid-event), this parser discards that partial
 *   data rather than guessing it was actually complete — matching real
 *   `EventSource` behavior, where a truncated trailing event never fires.
 *   In practice this backend always closes the stream right after a blank
 *   line, so this path should never be exercised for a well-behaved stream;
 *   it only guards against a malformed/truncated one.
 *
 * ## AbortSignal handling
 *
 * If `signal` is provided, the generator races each pending `reader.read()`
 * against the signal's `abort` event. When the signal fires mid-stream, the
 * generator stops iterating on its own *before* awaiting another chunk —
 * callers don't need to `break` out of a `for await` loop to stop it — and
 * the underlying reader is cancelled in a `finally` block so the network
 * request/stream is released promptly rather than left dangling. An
 * already-aborted signal causes the generator to cancel the reader and
 * return immediately without reading anything.
 */

/** One line-splitting pass over buffered decoded text. */
function splitLines(buffer: string, streamEnded: boolean): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    const nextCr = buffer.indexOf("\r", pos);
    const nextLf = buffer.indexOf("\n", pos);

    if (nextCr === -1 && nextLf === -1) {
      // No terminator in what's left — wait for more data.
      break;
    }

    let idx: number;
    let terminatorLength: number;

    if (nextLf !== -1 && (nextCr === -1 || nextLf < nextCr)) {
      idx = nextLf;
      terminatorLength = 1;
    } else {
      idx = nextCr;
      if (idx === buffer.length - 1) {
        // A lone `\r` at the very end of buffered data might be the first
        // half of a `\r\n` pair split across a chunk boundary. Only treat
        // it as a terminator once we know no more data is coming.
        if (!streamEnded) break;
        terminatorLength = 1;
      } else if (buffer[idx + 1] === "\n") {
        terminatorLength = 2;
      } else {
        terminatorLength = 1;
      }
    }

    lines.push(buffer.slice(pos, idx));
    pos = idx + terminatorLength;
  }

  return { lines, rest: buffer.slice(pos) };
}

/**
 * Applies one SSE field line to the in-progress `data:` buffer for the
 * current event block. Returns the joined payload string if `line` was the
 * blank line that terminates an event block with at least one `data:` line
 * in it, or `null` if nothing should be dispatched yet.
 */
function processLine(line: string, dataLines: string[]): string | null {
  if (line === "") {
    if (dataLines.length === 0) {
      // Blank line with no buffered `data:` — no event fires (spec: an
      // event block with an empty data buffer doesn't dispatch).
      return null;
    }
    const payload = dataLines.join("\n");
    dataLines.length = 0;
    return payload;
  }

  if (line.startsWith(":")) {
    // Comment line — ignored entirely.
    return null;
  }

  const colonIndex = line.indexOf(":");
  const field = colonIndex === -1 ? line : line.slice(0, colonIndex);

  if (field !== "data") {
    // event: / id: / retry: / anything unrecognized — not our concern.
    return null;
  }

  let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  if (value.startsWith(" ")) {
    value = value.slice(1);
  }
  dataLines.push(value);
  return null;
}

/**
 * Parses a raw SSE byte stream and yields each event's `data:` payload, in
 * order, as soon as its terminating blank line arrives. See the module doc
 * comment above for the input shape rationale, line-ending handling, empty
 * `data:` semantics, and `AbortSignal` behavior.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dataLines: string[] = [];

  let onAbort: (() => void) | undefined;
  const aborted: Promise<"abort"> | undefined = signal
    ? new Promise<"abort">((resolve) => {
        onAbort = () => resolve("abort");
        signal.addEventListener("abort", onAbort, { once: true });
      })
    : undefined;

  try {
    while (!signal?.aborted) {
      const readPromise = reader.read();
      // If we abandon this read below (because abort won the race), let it
      // settle silently rather than becoming an unhandled rejection.
      readPromise.catch(() => {});

      const outcome = aborted ? await Promise.race([readPromise, aborted]) : await readPromise;
      if (outcome === "abort") {
        break;
      }

      const { done, value } = outcome;

      if (done) {
        buffer += decoder.decode();
        // Only fully-terminated lines are processed here. Any leftover text
        // with no terminator at all (a truncated final line) is discarded —
        // see the module doc's "Trailing unterminated data" note.
        const { lines } = splitLines(buffer, true);
        buffer = "";
        for (const line of lines) {
          const payload = processLine(line, dataLines);
          if (payload !== null) yield payload;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = splitLines(buffer, false);
      buffer = rest;
      for (const line of lines) {
        const payload = processLine(line, dataLines);
        if (payload !== null) yield payload;
      }
    }
  } finally {
    if (onAbort && signal) {
      signal.removeEventListener("abort", onAbort);
    }
    await reader.cancel().catch(() => {});
  }
}
