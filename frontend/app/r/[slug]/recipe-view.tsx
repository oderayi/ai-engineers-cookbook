"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { DescriptionPanel } from "@/components/catalog/description-panel";
import { ExamplesPanel } from "@/components/catalog/examples-panel";
import { RunForm, type RunFormHandle } from "@/components/catalog/run-form/run-form";
import { SourceViewer } from "@/components/catalog/source-viewer";
import { EmptyState } from "@/components/primitives/empty-state";
import { Skeleton } from "@/components/primitives/skeleton";
import { useRecipe, useSource } from "@/hooks/use-recipes";
import { cn } from "@/lib/cn";

/**
 * Stub, not an authoritative type: `execution` (built after `catalog`) owns
 * the real `useRecipeRun` hook this status comes from. Defined locally here
 * so `RecipeView`'s `onStatusChange` prop has a real type today rather than
 * `unknown`/`any` — matches the literal state list `SPEC-catalog.md`'s own
 * `workspace` amendment describes (`idle → running → done | error`, back to
 * `idle` on cancel-and-restart). Superseded once `execution` exists; nothing
 * here currently produces a value other than never calling the callback at
 * all.
 */
export type RecipeRunStatus = "idle" | "running" | "done" | "error";

/**
 * The `workspace` cross-module contract (`SPEC-catalog.md`, amendment
 * approved 2026-09-11): `RecipeView` is wrapped in `forwardRef` and exposes
 * `cancelRun()`, which `workspace` calls when a tab hosting this view is
 * closed. `execution` (which would own an actual in-flight run to cancel)
 * doesn't exist yet, so this is a documented no-op, not fabricated
 * behavior — added now so `workspace` doesn't need to modify this file
 * later, per that amendment's own framing.
 */
export interface RecipeViewHandle {
  cancelRun: () => void;
}

export interface RecipeViewProps {
  slug: string;
  /** Unused today — see `RecipeRunStatus`'s own doc comment. */
  onStatusChange?: (status: RecipeRunStatus) => void;
  className?: string;
}

/**
 * The recipe detail page's actual content: fetches its own data client-side
 * (`useRecipe`/`useSource`) rather than taking a pre-fetched `RecipeDetail`
 * prop, so `workspace` can mount `<RecipeView slug={…} />` as tab content
 * without a server round trip per mount (`app/r/[slug]/page.tsx` is a thin
 * server-component wrapper around this).
 *
 * Browsing (description, examples, source) is never gated by the run form's
 * own validity/state — all four regions render unconditionally once the
 * recipe itself has loaded (SPEC-catalog.md: rate limits and keyless-trial
 * state affect only the Run action, not the page).
 */
export const RecipeView = forwardRef<RecipeViewHandle, RecipeViewProps>(function RecipeView(
  { slug, className },
  ref
) {
  const recipeQuery = useRecipe(slug);
  const sourceQuery = useSource(slug);
  const runFormRef = useRef<RunFormHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      cancelRun: () => {
        // TODO(execution): no in-flight run exists to cancel until
        // execution's useRecipeRun exists for this component to delegate
        // to. Documented no-op, not fabricated behavior.
      },
    }),
    []
  );

  if (recipeQuery.isPending) {
    return (
      <div data-testid="recipe-view-loading" className={cn("flex flex-col gap-4", className)}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (recipeQuery.isError) {
    if (recipeQuery.error.status === 404) {
      notFound();
      return null; // unreachable in production (`notFound()` never returns)
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        message="Couldn't load this recipe. Check that the backend is running, then reload."
        className={className}
      />
    );
  }

  const recipe = recipeQuery.data;

  function handleTryExample(params: Record<string, unknown>) {
    runFormRef.current?.fillExample(params);
    runFormRef.current?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {/* `recipe.summary` itself is NOT repeated here -- `DescriptionPanel`
          below is its one home, so the two don't show duplicate text. */}
      <header className="flex flex-col gap-1">
        <h1 data-testid="recipe-view-title" className="text-2xl font-semibold text-foreground">
          {recipe.title}
        </h1>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {recipe.groupTitle} · {recipe.difficulty}
        </p>
      </header>

      <DescriptionPanel recipe={recipe} />
      <ExamplesPanel examples={recipe.examples} onTryExample={handleTryExample} />

      {sourceQuery.data ? (
        <SourceViewer bundle={sourceQuery.data} />
      ) : sourceQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        // A failed source fetch never blocks the rest of the page -- it's
        // just not shown, with a small note rather than a hard error.
        <p className="text-sm text-muted-foreground">Source is unavailable right now.</p>
      )}

      <RunForm ref={runFormRef} recipe={recipe} />
    </div>
  );
});
