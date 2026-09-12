import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface FileDownloadProps {
  /** The artifact's `name` -- rendered as the visible label. */
  name: string;
  /** The artifact's `url` -- used as the link's `href`. */
  url: string;
  className?: string;
}

/**
 * Labeled link for a `kind: "file"` artifact (the fixture's
 * `{"name":"full-report.pdf","url":"/artifacts/runs/run-42/full-report.pdf"}`
 * example): links out to `url` rather than fetching/previewing the file
 * inline, per SPEC-execution.md Open Question 3's "inline + truncate for
 * v1" leaning -- file artifacts are out of scope for inline preview here.
 *
 * Deliberately styles a plain `<a href>` with `buttonVariants` (exported
 * from `components/ui/button.tsx`) rather than composing the `Button`
 * component itself via Base UI's `render` prop: Base UI's `useButton`
 * unconditionally forces `role="button"` on whatever element a non-native
 * `Button` renders as (confirmed by reading
 * `node_modules/@base-ui/react/internals/use-button/useButton.js`), which
 * would make this a real navigable `<a href>` that assistive tech
 * announces as a "button" instead of a "link" -- wrong semantics for what
 * is, underneath, a plain outbound link. Applying `buttonVariants`
 * directly gets the same visible styling with correct, unmodified link
 * semantics (`getByRole("link")` in the test, real right-click/"copy
 * link"/middle-click-to-open-in-new-tab behavior).
 */
function FileDownload({ name, url, className }: FileDownloadProps) {
  return (
    <a
      href={url}
      data-slot="file-download"
      className={cn(buttonVariants({ variant: "outline" }), className)}
    >
      <Download aria-hidden="true" />
      {name}
    </a>
  );
}

export { FileDownload };
