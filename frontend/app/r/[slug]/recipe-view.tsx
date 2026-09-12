"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { DescriptionPanel } from "@/components/catalog/description-panel";
import { ExamplesPanel } from "@/components/catalog/examples-panel";
import { RunForm, type RunFormHandle, type RunFormSubmitPayload } from "@/components/catalog/run-form/run-form";
import { SourceViewer } from "@/components/catalog/source-viewer";
import { RunOutput, type RunOutputHandle } from "@/components/execution/run-output";
import { EmptyState } from "@/components/primitives/empty-state";
import { Skeleton } from "@/components/primitives/skeleton";
import { useRecipe, useSource } from "@/hooks/use-recipes";
import type { RunStatus } from "@/hooks/use-recipe-run";
import { cn } from "@/lib/cn";

/**
 * `execution`'s own `useRecipeRun` status literal, re-exported under this
 * module's established name (`onStatusChange`'s existing prop type) rather
 * than changing the prop's type now that a real one exists -- avoids a
 * churn-only rename for `workspace`, the one other consumer of this type.
 */
export type RecipeRunStatus = RunStatus;

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
  /**
   * Still unused: `<RunOutput>` (mounted below) owns `useRecipeRun`
   * internally and doesn't report its status upward — only `start`/`cancel`,
   * via `RunOutputHandle`. Wiring this through (an `onStatusChange` prop on
   * `RunOutput` itself, forwarding `useRecipeRun`'s `status`) is `workspace`
   * cross-module wiring, out of `execution`'s own scope; kept here,
   * unwired, so `workspace` doesn't need to touch this file's prop surface
   * later, per the same amendment that added this prop.
   */
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
  const runOutputRef = useRef<RunOutputHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      cancelRun: () => {
        runOutputRef.current?.cancel();
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

  function handleRunSubmit(payload: RunFormSubmitPayload) {
    runOutputRef.current?.start({
      params: payload.params,
      config: payload.config,
      files: payload.files,
    });
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

      <RunForm ref={runFormRef} recipe={recipe} onSubmit={handleRunSubmit} />
      <RunOutput ref={runOutputRef} slug={recipe.slug} />
    </div>
  );
});
