import { Button } from "@/components/ui/button";
import type { Example } from "@/lib/api/models";
import { cn } from "@/lib/cn";

export interface ExamplesPanelProps {
  examples: Example[];
  onTryExample: (params: Record<string, unknown>) => void;
  className?: string;
}

/**
 * One card per `recipe.example`, each with a "Try this example" button that
 * hands that card's own `example.params` back to the caller via
 * `onTryExample`. Purely presentational: it never reaches into a run form
 * itself -- wiring `onTryExample` to an actual form's state is a later
 * task's job (Task 15).
 *
 * `expect` is rendered as plain prose describing what the learner should
 * see -- it is never fetched, run, or stored; it's just a string from the
 * recipe's TOML.
 *
 * Renders `null` for zero examples: no empty "Examples" heading, no empty
 * container.
 */
function ExamplesPanel({ examples, onTryExample, className }: ExamplesPanelProps) {
  if (examples.length === 0) return null;

  return (
    <div data-slot="examples-panel" className={cn("flex flex-col gap-3", className)}>
      {examples.map((example) => (
        <article
          key={example.title}
          className="flex flex-col gap-2 rounded-lg border border-border p-4"
        >
          <h3 className="text-sm font-medium text-foreground">{example.title}</h3>
          <p className="text-sm text-muted-foreground">{example.summary}</p>
          <p className="text-sm text-foreground">{example.expect}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onTryExample(example.params)}
          >
            Try this example
          </Button>
        </article>
      ))}
    </div>
  );
}

export { ExamplesPanel };
