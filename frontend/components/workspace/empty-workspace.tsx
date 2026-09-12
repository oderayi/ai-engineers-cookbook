import Link from "next/link";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface EmptyWorkspaceProps {
  className?: string;
}

/**
 * Shown when zero tabs are open (`SPEC-workspace.md` Open Question 3,
 * resolved: `<EmptyWorkspace>` with a link into the catalog index) — fills
 * `app-shell`'s main slot in place of `<TabPanels>` at Task 9's composition
 * point, keeping the tab strip's own empty state visually distinct from
 * ordinary browsing.
 *
 * The catalog index is `app/page.tsx` (`<CatalogIndex>` mounted at `/`), not
 * guessed — confirmed by reading that file directly.
 *
 * Styles a plain `<Link>` with `buttonVariants` rather than composing
 * `Button` via Base UI's `render` prop, mirroring `FileDownload`'s own
 * documented reasoning (`components/execution/artifact/file-download.tsx`):
 * Base UI's `useButton` forces `role="button"` on whatever a non-native
 * `Button` renders as, which would misrepresent a plain in-app navigation
 * link as a button to assistive tech.
 */
function EmptyWorkspace({ className }: EmptyWorkspaceProps) {
  return (
    <EmptyState
      icon={Compass}
      message="No recipes open yet — browse the catalog to get started."
      action={
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Browse the catalog
        </Link>
      }
      className={className}
    />
  );
}

export { EmptyWorkspace };
