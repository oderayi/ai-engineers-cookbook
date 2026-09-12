import type { TokenEvent } from "@/lib/execution/events";
import { cn } from "@/lib/cn";

export interface TokenPaneProps {
  /**
   * Raw `TokenEvent`s, not a pre-joined string: the caller (the
   * orchestrator accumulating the raw `RecipeEvent[]` stream) hands over
   * whatever `token` events it has seen so far, and this component owns
   * turning them into displayable text. That keeps the "how do token
   * fragments become a string" concern in one place rather than
   * duplicated at every call site.
   *
   * Concatenation is a single `events.map(e => e.text).join("")` computed
   * directly in the render body -- O(n) per render over whatever `events`
   * currently is, not accumulated by mutating state across renders. React
   * only re-renders this component when its own props change, so this
   * does not become O(n^2) across a growing stream: each render does one
   * pass over the array it was actually given. What must be (and is)
   * avoided is generating a brand-new DOM subtree with a new key/identity
   * per token -- the text lives in one stable container element whose
   * text content simply grows, so React patches the existing text node
   * instead of remounting anything.
   */
  events: TokenEvent[];
  className?: string;
}

/** Renders the accumulated token stream as a single growing block of text. */
function TokenPane({ events, className }: TokenPaneProps) {
  const text = events.map((event) => event.text).join("");

  return (
    <div
      data-slot="token-pane"
      className={cn("text-sm whitespace-pre-wrap text-foreground", className)}
    >
      {text}
    </div>
  );
}

export { TokenPane };
