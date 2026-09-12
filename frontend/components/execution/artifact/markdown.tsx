import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";

export interface ArtifactMarkdownProps {
  /** The artifact's `kind: "markdown"` `data` payload -- expected to be a string. */
  data: unknown;
  className?: string;
}

/**
 * Character cap applied before rendering, per this codebase's
 * artifact-rendering guidance (SPEC-execution.md Open Question 3: truncate
 * large payloads with a visible note rather than rendering unbounded
 * content). 20,000 characters is generous for a recipe-authored summary/
 * report while still bounding how much markdown a single artifact can force
 * `react-markdown` to parse and mount.
 */
const MAX_CHARS = 20_000;

/**
 * Renders a `kind: "markdown"` artifact's `data` string via `react-markdown`
 * + `remark-gfm`, mirroring `components/catalog/description-panel.tsx`'s
 * prose styling and safety posture exactly: no `rehype-raw` (or anything
 * else enabling raw-HTML passthrough) is passed, so `react-markdown`'s
 * default behavior renders any literal HTML in the artifact's markdown
 * source as escaped text instead of executing it -- the same safe posture
 * used for recipe-authored README content elsewhere in the app, applied
 * here to recipe-authored artifact content.
 *
 * Guards against non-string `data` (the fixture's `data` is a string, but
 * `ArtifactEvent.data` is `z.unknown()`) with a graceful fallback rather
 * than crashing -- `ReactMarkdown` expects string children.
 */
function ArtifactMarkdown({ data, className }: ArtifactMarkdownProps) {
  if (typeof data !== "string") {
    return (
      <p data-slot="artifact-markdown-fallback" className={cn("text-sm text-muted-foreground", className)}>
        Unable to render this content.
      </p>
    );
  }

  const truncated = data.length > MAX_CHARS;
  const content = truncated ? data.slice(0, MAX_CHARS) : data;

  return (
    <div data-slot="artifact-markdown" className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "text-sm text-foreground",
          "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:first:mt-0",
          "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:first:mt-0",
          "[&_p]:my-2 [&_p]:leading-relaxed",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:my-1",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
          "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3",
          "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
          "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {truncated && (
        <p data-slot="artifact-markdown-truncated-note" className="text-xs text-muted-foreground">
          Truncated to the first {MAX_CHARS.toLocaleString()} characters.
        </p>
      )}
    </div>
  );
}

export { ArtifactMarkdown };
