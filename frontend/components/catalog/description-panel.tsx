import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CollapsibleSection } from "@/components/primitives/collapsible-section";
import type { RecipeDetail } from "@/lib/api/models";
import { cn } from "@/lib/cn";

export interface DescriptionPanelProps {
  recipe: Pick<RecipeDetail, "summary" | "useCases" | "readmeMarkdown">;
  className?: string;
}

/**
 * Collapsible "Description" region for a recipe's detail page: its
 * `summary` as prose, `useCases` as a bullet list, and (when present) its
 * `readmeMarkdown` rendered with GFM support (tables, task lists,
 * strikethrough).
 *
 * `readmeMarkdown: null` (e.g. `tokens-and-context`) omits the README
 * sub-section entirely -- no empty heading, no empty box -- rather than
 * rendering a heading over nothing.
 *
 * Deliberately does NOT pass `rehype-raw` (or anything else that would
 * enable raw-HTML passthrough): `react-markdown`'s default behavior
 * renders any literal HTML in the markdown source as escaped text instead
 * of executing it, which is exactly the safe behavior wanted for
 * recipe-authored content.
 *
 * Open by default -- unlike a "more details" aside, this is a recipe
 * detail page's primary content, so it shouldn't start hidden behind an
 * extra click.
 */
function DescriptionPanel({ recipe, className }: DescriptionPanelProps) {
  return (
    <CollapsibleSection title="Description" defaultOpen className={className}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-foreground">{recipe.summary}</p>

        {recipe.useCases.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">Use cases</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {recipe.useCases.map((useCase) => (
                <li key={useCase}>{useCase}</li>
              ))}
            </ul>
          </div>
        )}

        {recipe.readmeMarkdown !== null && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">README</h3>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{recipe.readmeMarkdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export { DescriptionPanel };
