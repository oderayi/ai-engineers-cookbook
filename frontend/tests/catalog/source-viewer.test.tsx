import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceViewer } from "@/components/catalog/source-viewer";
import { catalogFixtureSourceBundles } from "@/tests/fixtures/catalog/source-bundles";

// Real, unmocked shiki (`codeToHtml`) runs in every test below rather than a
// mocked module. Benchmarked directly (see task report) at ~30ms cold /
// ~1-2ms warm per call -- comfortably inside Vitest's default 5s test
// timeout even with jsdom -- and this is the only way a unit test actually
// proves the WASM highlighter integrates end to end rather than asserting
// against a hand-authored HTML fixture.
const twoFileBundle = catalogFixtureSourceBundles["embeddings-101"];
const oneFileBundle = catalogFixtureSourceBundles["prompt-basics"];

/**
 * Real shiki output wraps every file in a `<pre class="shiki ...">` root
 * (see `HIGHLIGHT_THEME` in the component). Waiting on that class, rather
 * than on textContent equality alone, matters because the component's own
 * plain-`<pre>` loading fallback already byte-matches the raw text -- a bare
 * textContent-equality `waitFor` would resolve on that fallback and never
 * actually observe shiki's async highlight completing.
 */
async function waitForHighlighted(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(".shiki");
    expect(el).toBeInTheDocument();
    return el as HTMLElement;
  });
}

/**
 * `userEvent.setup()` unconditionally installs its own in-memory Clipboard
 * stub on `window` (see `@testing-library/user-event`'s
 * `attachClipboardStubToView`), overriding anything defined beforehand --
 * a `beforeEach`-level `navigator.clipboard` mock gets silently clobbered
 * the moment a test calls `userEvent.setup()`. Spying on `writeText` *after*
 * `setup()` (on the stub `setup()` just installed) is what actually survives.
 */
function spyOnClipboardWriteText() {
  return vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
}

describe("SourceViewer", () => {
  it("renders one accessible tab per file, using each file's path as its label", () => {
    render(<SourceViewer bundle={twoFileBundle} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(twoFileBundle.files.length);
    for (const file of twoFileBundle.files) {
      expect(screen.getByRole("tab", { name: file.path })).toBeInTheDocument();
    }
  });

  it("shows the first file's highlighted content by default, byte-matching the raw text", async () => {
    render(<SourceViewer bundle={twoFileBundle} />);

    const highlighted = await waitForHighlighted();
    // Real shiki markup (not the plain-text loading fallback)...
    expect(highlighted.innerHTML).toContain("<span");
    // ...yet the actual characters round-trip exactly, with no loss/mangling.
    expect(screen.getByRole("tabpanel").textContent).toBe(twoFileBundle.files[0].text);
  });

  it("switches tabs on click, byte-matching the newly active file's raw text", async () => {
    const user = userEvent.setup();
    render(<SourceViewer bundle={twoFileBundle} />);
    await waitForHighlighted();

    const secondTab = screen.getByRole("tab", { name: twoFileBundle.files[1].path });
    await user.click(secondTab);

    await waitFor(() => {
      expect(screen.getByRole("tabpanel").textContent).toBe(twoFileBundle.files[1].text);
    });
    expect(screen.getByRole("tabpanel").innerHTML).toContain("<span");
    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("supports arrow-key keyboard navigation between tabs per the ARIA tabs pattern", async () => {
    const user = userEvent.setup();
    render(<SourceViewer bundle={twoFileBundle} />);
    await waitForHighlighted();

    const [firstTab, secondTab] = screen.getAllByRole("tab");
    firstTab.focus();

    await user.keyboard("{ArrowRight}");
    expect(secondTab).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(secondTab).toHaveAttribute("aria-selected", "true");
    });
    await waitFor(() => {
      expect(screen.getByRole("tabpanel").textContent).toBe(twoFileBundle.files[1].text);
    });
  });

  it("copies the active file's raw text (not the highlighted HTML) via navigator.clipboard.writeText", async () => {
    const user = userEvent.setup();
    const writeText = spyOnClipboardWriteText();
    render(<SourceViewer bundle={twoFileBundle} />);
    await waitForHighlighted();

    const copyButton = screen.getByRole("button", { name: /copy/i });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(twoFileBundle.files[0].text);
  });

  it("copies the second file's raw text after switching to its tab", async () => {
    const user = userEvent.setup();
    const writeText = spyOnClipboardWriteText();
    render(<SourceViewer bundle={twoFileBundle} />);
    await waitForHighlighted();

    await user.click(screen.getByRole("tab", { name: twoFileBundle.files[1].path }));
    await waitFor(() => {
      expect(screen.getByRole("tabpanel").textContent).toBe(twoFileBundle.files[1].text);
    });

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(twoFileBundle.files[1].text);
  });

  it("renders no editable surface for the source content", () => {
    const { container } = render(<SourceViewer bundle={twoFileBundle} />);

    expect(container.querySelector("textarea")).not.toBeInTheDocument();
    expect(container.querySelector("input")).not.toBeInTheDocument();
    expect(container.querySelector('[contenteditable="true"]')).not.toBeInTheDocument();
    expect(container.querySelector("[readonly]")).not.toBeInTheDocument();
  });

  it("renders a single tab for a single-file bundle and byte-matches its content", async () => {
    render(<SourceViewer bundle={oneFileBundle} />);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    await waitForHighlighted();
    expect(screen.getByRole("tabpanel").textContent).toBe(oneFileBundle.files[0].text);
  });

  it("applies a custom className to the root container", () => {
    const { container } = render(<SourceViewer bundle={twoFileBundle} className="custom-class" />);

    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });
});
