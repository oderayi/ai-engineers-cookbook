import { describe, expect, it } from "vitest";

import { parseSSEStream } from "@/lib/execution/sse";

/**
 * Builds a `ReadableStream<Uint8Array>` that enqueues `chunks` in order and
 * then closes. Each chunk is either a raw string (UTF-8 encoded here) or an
 * already-encoded `Uint8Array` — the latter lets tests split a multi-byte
 * UTF-8 codepoint's bytes across two chunks, which a plain string split
 * can't represent.
 */
function makeStream(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

/** Drains the generator into a plain array of yielded payloads. */
async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<string[]> {
  const out: string[] = [];
  for await (const payload of parseSSEStream(stream, signal)) {
    out.push(payload);
  }
  return out;
}

describe("parseSSEStream", () => {
  it("parses a single simple event", async () => {
    const stream = makeStream(["data: hello\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["hello"]);
  });

  it("parses a payload split across multiple data: lines, joined with \\n", async () => {
    const stream = makeStream(["data: line1\ndata: line2\ndata: line3\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["line1\nline2\nline3"]);
  });

  it("reassembles a line split across two separate input chunks", async () => {
    // The word "hello" is split mid-word across the chunk boundary.
    const stream = makeStream(["data: hel", "lo world\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["hello world"]);
  });

  it("reassembles a data: field name itself split across chunks", async () => {
    // The boundary lands before the field's colon even appears.
    const stream = makeStream(["da", "ta: split-field\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["split-field"]);
  });

  it("reassembles a multibyte UTF-8 codepoint split across chunks", async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode("data: héllo 😀 世界\n\n");
    // Split in the middle of the (multi-byte) emoji codepoint.
    const splitPoint = full.indexOf(0x9f); // inside the F0 9F 98 80 emoji sequence
    const stream = makeStream([full.slice(0, splitPoint), full.slice(splitPoint)]);
    await expect(collect(stream)).resolves.toEqual(["héllo 😀 世界"]);
  });

  it("ignores comment lines and non-data fields without erroring or emitting", async () => {
    const stream = makeStream([
      ":this is a comment, ignore me\n",
      "event: message\n",
      "id: 42\n",
      "retry: 1000\n",
      "data: payload\n",
      "\n",
    ]);
    await expect(collect(stream)).resolves.toEqual(["payload"]);
  });

  it("emits nothing for an event block with only comments/fields and no data:", async () => {
    const stream = makeStream([":comment only\n", "event: ping\n", "\n"]);
    await expect(collect(stream)).resolves.toEqual([]);
  });

  it("strips exactly one leading space after data: and preserves the rest verbatim", async () => {
    const stream = makeStream([
      "data:no-space\n",
      "\n",
      "data: one-space\n",
      "\n",
      "data:  two-spaces\n",
      "\n",
    ]);
    // "data:  two-spaces" has one space stripped, leaving " two-spaces".
    await expect(collect(stream)).resolves.toEqual(["no-space", "one-space", " two-spaces"]);
  });

  it("preserves internal whitespace and unicode verbatim", async () => {
    const stream = makeStream(["data: café   \t résumé — 你好\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["café   \t résumé — 你好"]);
  });

  it("yields an empty string for a bare `data:` line (valid, distinct from no event)", async () => {
    const stream = makeStream(["data:\n\n"]);
    await expect(collect(stream)).resolves.toEqual([""]);
  });

  it("yields an empty string for a `data: ` line with only the stripped space", async () => {
    const stream = makeStream(["data: \n\n"]);
    await expect(collect(stream)).resolves.toEqual([""]);
  });

  it("parses multiple sequential events in order", async () => {
    const stream = makeStream(["data: one\n\ndata: two\n\ndata: three\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["one", "two", "three"]);
  });

  it("handles an event whose terminating blank line arrives in a later chunk", async () => {
    const stream = makeStream(["data: partial-event", "\n", "\n", "data: next\n\n"]);
    await expect(collect(stream)).resolves.toEqual(["partial-event", "next"]);
  });

  it("discards a truncated trailing event that never got its blank-line terminator", async () => {
    // No trailing blank line and no trailing newline at all after "data: x"
    // — the stream just ends. Per spec, an event only fires on its
    // terminating blank line, so this buffered-but-never-terminated data
    // is dropped rather than guessed to be complete (matches EventSource).
    const stream = makeStream(["data: x"]);
    await expect(collect(stream)).resolves.toEqual([]);
  });

  it("still dispatches a fully-terminated event even if a truncated one follows it", async () => {
    const stream = makeStream(["data: complete\n\ndata: truncated"]);
    await expect(collect(stream)).resolves.toEqual(["complete"]);
  });

  it("does not hang or throw on a completely empty stream", async () => {
    const stream = makeStream([]);
    await expect(collect(stream)).resolves.toEqual([]);
  });

  it("stops promptly when the AbortSignal fires mid-stream, without hanging", async () => {
    const controller = new AbortController();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamController = c;
      },
    });
    const encoder = new TextEncoder();

    const generator = parseSSEStream(stream, controller.signal);

    streamController.enqueue(encoder.encode("data: first\n\n"));
    const first = await generator.next();
    expect(first).toEqual({ value: "first", done: false });

    controller.abort();
    // The stream is never closed and no further chunk is ever enqueued —
    // without abort handling this `next()` call would hang forever.
    const afterAbort = await generator.next();
    expect(afterAbort.done).toBe(true);
  });

  it("returns immediately and yields nothing when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = makeStream(["data: never-seen\n\n"]);
    await expect(collect(stream, controller.signal)).resolves.toEqual([]);
  });

  it("also handles CRLF line endings (documented spec allowance beyond bare \\n)", async () => {
    const stream = makeStream(["data: crlf-one\r\ndata: crlf-two\r\n\r\n"]);
    await expect(collect(stream)).resolves.toEqual(["crlf-one\ncrlf-two"]);
  });

  it("also handles bare CR line endings (documented spec allowance beyond bare \\n)", async () => {
    const stream = makeStream(["data: cr-one\rdata: cr-two\r\r"]);
    await expect(collect(stream)).resolves.toEqual(["cr-one\ncr-two"]);
  });

  it("does not misparse a CRLF terminator split across a chunk boundary as two lines", async () => {
    // The \r ends one chunk and the \n begins the next — must be read as a
    // single CRLF terminator, not a bare-CR line plus an extra blank LF line.
    const stream = makeStream(["data: split-crlf\r", "\ndata: next\r\n\r\n"]);
    await expect(collect(stream)).resolves.toEqual(["split-crlf\nnext"]);
  });
});
