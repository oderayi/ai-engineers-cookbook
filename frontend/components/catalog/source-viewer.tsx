"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { codeToHtml } from "shiki";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SourceBundle, SourceFileWithContent } from "@/lib/api/models";
import { cn } from "@/lib/cn";

export interface SourceViewerProps {
  bundle: SourceBundle;
  className?: string;
}

/** Fixed so code blocks read consistently regardless of the app's own light/dark
 * theme -- the same call docs sites usually make for embedded code samples. */
const HIGHLIGHT_THEME = "github-dark";

/** Shiki's own no-grammar language -- used when `file.language` isn't one of
 * its bundled grammars, so a highlight failure never blocks rendering. */
const FALLBACK_LANGUAGE = "text";

/** How long the copy button shows its "copied" confirmation state. */
const COPY_CONFIRMATION_MS = 1500;

async function highlightFile(file: SourceFileWithContent): Promise<string> {
  try {
    return await codeToHtml(file.text, { lang: file.language, theme: HIGHLIGHT_THEME });
  } catch {
    // `file.language` isn't a language shiki bundles/recognizes -- fall back
    // to plain (still real, still shiki-rendered) text rather than crashing.
    return await codeToHtml(file.text, { lang: FALLBACK_LANGUAGE, theme: HIGHLIGHT_THEME });
  }
}

/**
 * Read-only, multi-file, shiki-highlighted source viewer with keyboard-
 * operable tabs (Base UI's `Tabs` primitive, which already implements the
 * ARIA tabs pattern -- `role="tablist"`/`"tab"`/`"tabpanel"`, roving
 * tabindex, and arrow-key navigation -- so this file only supplies markup
 * and styling, not a11y/keyboard behavior from scratch) and a copy button
 * per active file.
 *
 * `codeToHtml` is async, so a mount/active-file effect resolves each file's
 * highlighted HTML into state up front (all files at once -- these bundles
 * are a handful of small recipe files, not a large repo) and renders it via
 * `dangerouslySetInnerHTML`. That's the intended way to consume shiki's own
 * output: it's trusted, pre-escaped HTML shiki generates itself from source
 * text it never executes, not a shortcut around escaping untrusted input.
 * While highlighting is in flight (or for a file shiki fails to highlight
 * outright), a plain `<pre>` of the raw text is shown instead of blank
 * space -- never editable, same as the highlighted view.
 */
function SourceViewer({ bundle, className }: SourceViewerProps) {
  // Reset which tab is active and which highlighted HTML is shown whenever
  // `bundle` itself changes (a different recipe's source, not just a
  // re-render) -- done as a synchronous render-time state adjustment
  // (React's sanctioned "adjusting state when a prop changes" pattern, see
  // https://react.dev/learn/you-might-not-need-an-effect) rather than in a
  // `useEffect`, since an effect that unconditionally calls `setState` in
  // its body causes an extra, avoidable cascading render.
  const [prevBundle, setPrevBundle] = useState(bundle);
  const [activePath, setActivePath] = useState<string | undefined>(bundle.files[0]?.path);
  const [highlighted, setHighlighted] = useState<Record<string, string>>({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  if (bundle !== prevBundle) {
    setPrevBundle(bundle);
    setActivePath(bundle.files[0]?.path);
    setHighlighted({});
  }

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      bundle.files.map(async (file) => [file.path, await highlightFile(file)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setHighlighted(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [bundle]);

  useEffect(() => {
    if (copiedPath === null) return;
    const timer = setTimeout(() => setCopiedPath(null), COPY_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copiedPath]);

  if (bundle.files.length === 0) return null;

  const activeFile = bundle.files.find((file) => file.path === activePath) ?? bundle.files[0];

  async function handleCopy(file: SourceFileWithContent) {
    await navigator.clipboard.writeText(file.text);
    setCopiedPath(file.path);
  }

  return (
    <div
      data-slot="source-viewer"
      className={cn("flex flex-col overflow-hidden rounded-lg border border-border", className)}
    >
      <Tabs.Root
        value={activePath}
        onValueChange={(value) => setActivePath(value as string)}
        className="flex flex-col"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 pr-2 pl-1">
          <Tabs.List
            aria-label="Source files"
            className="flex items-center gap-1 overflow-x-auto py-1"
          >
            {bundle.files.map((file) => (
              <Tabs.Tab
                key={file.path}
                value={file.path}
                className="shrink-0 rounded-md px-2.5 py-1 font-mono text-xs text-muted-foreground outline-none transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground"
              >
                {file.path}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy ${activeFile.path}`}
            onClick={() => void handleCopy(activeFile)}
          >
            {copiedPath === activeFile.path ? <Check /> : <Copy />}
          </Button>
        </div>
        {bundle.files.map((file) => {
          const html = highlighted[file.path];
          return (
            <Tabs.Panel
              key={file.path}
              value={file.path}
              className="overflow-x-auto p-3 font-mono text-xs leading-relaxed [&_pre]:whitespace-pre [&_pre]:bg-transparent"
            >
              {html !== undefined ? (
                <div data-slot="source-viewer-code" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <pre className="whitespace-pre-wrap text-foreground">{file.text}</pre>
              )}
            </Tabs.Panel>
          );
        })}
      </Tabs.Root>
    </div>
  );
}

export { SourceViewer };
