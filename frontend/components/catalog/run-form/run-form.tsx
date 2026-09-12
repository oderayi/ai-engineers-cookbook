"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";

import { RecipeOverrides } from "@/components/settings/recipe-overrides";
import { Button } from "@/components/ui/button";
import { FileDropzoneField } from "@/components/catalog/run-form/fields/file-dropzone-field";
import { NumberField } from "@/components/catalog/run-form/fields/number-field";
import { SelectField } from "@/components/catalog/run-form/fields/select-field";
import { SliderField } from "@/components/catalog/run-form/fields/slider-field";
import { SwitchField } from "@/components/catalog/run-form/fields/switch-field";
import { TextField } from "@/components/catalog/run-form/fields/text-field";
import { TextareaField } from "@/components/catalog/run-form/fields/textarea-field";
import { compileForm } from "@/lib/catalog/schema-form";
import type { RecipeDetail } from "@/lib/api/models";

export interface RunFormSubmitPayload {
  params: Record<string, unknown>;
  recipeSlug: string;
}

export interface RunFormProps {
  recipe: RecipeDetail;
  /**
   * Receives `{ params, recipeSlug }` on a valid submit. `execution` (built
   * after `catalog`) is the real destination for this — no such consumer
   * exists yet, so an unset `onSubmit` no-ops rather than this component
   * inventing a fake destination for the data.
   */
  onSubmit?: (payload: RunFormSubmitPayload) => void;
}

/**
 * Lets `recipe-view.tsx` (Task 15) pre-fill the form from an example's
 * `params` (`examples-panel.tsx`'s "Try this example") without either
 * component reaching into the other's internal state. `fillExample` resets
 * every compiled field to the given values in one pass (so partial/stale
 * values from a prior manual edit don't linger) and re-validates
 * immediately, so the Run button's enabled state reflects the newly-filled
 * form right away rather than waiting for the user's next keystroke.
 */
export interface RunFormHandle {
  fillExample: (params: Record<string, unknown>) => void;
}

/**
 * The recipe run form (`SPEC-catalog.md`'s Code Style sample): generated
 * entirely from `recipe.inputSchema` via `compileForm` (never hand-coded
 * fields), embeds `settings`' `<RecipeOverrides recipe={recipe} />` verbatim
 * — no adapter, the whole point of `RecipeDetail`/`RecipeEnvDecl`'s
 * structural compatibility — and hands a valid submission's `{ params,
 * recipeSlug }` upward via `onSubmit`.
 */
export const RunForm = forwardRef<RunFormHandle, RunFormProps>(function RunForm(
  { recipe, onSubmit },
  ref
) {
  const { fields, validator } = useMemo(() => compileForm(recipe.inputSchema), [recipe]);

  const form = useForm<Record<string, unknown>>({
    // `mode: "onChange"` so `formState.isValid` (the Run button's enabled
    // state) updates live as the user types, not only on submit attempt.
    //
    // `compileForm`'s `validator` is typed as the generic `z.ZodTypeAny`,
    // whose own `_input` is `unknown` -- not known to satisfy zodResolver's
    // `FieldValues`-constrained parameter type, and react-hook-form's own
    // `Resolver<T>` is invariant in `T` regardless (the same cast Task 13's
    // field-component tests already needed against their own concrete
    // schemas). `zodResolver`'s own first-parameter type is the escape
    // hatch here (rather than a bare `any`, which the project's own
    // convention disallows), then the whole thing is cast to the
    // `Resolver<Record<string, unknown>>` shape `useForm` below expects.
    resolver: zodResolver(validator as Parameters<typeof zodResolver>[0]) as unknown as Resolver<
      Record<string, unknown>
    >,
    mode: "onChange",
  });
  const { register, control, handleSubmit, formState, reset, trigger } = form;

  // react-hook-form's `formState.isValid` starts out `true` until the first
  // validation pass actually runs (it doesn't validate on mount by itself) —
  // without this, a recipe with a required field would show an *enabled*
  // Run button for a brief (or, with no interaction at all, indefinite)
  // window despite an empty required field. Re-run whenever the compiled
  // validator itself changes (a different recipe).
  useEffect(() => {
    void trigger();
  }, [trigger, validator]);

  useImperativeHandle(
    ref,
    () => ({
      fillExample: (params) => {
        reset(params);
        void trigger();
      },
    }),
    [reset, trigger]
  );

  function onValidSubmit(values: Record<string, unknown>) {
    if (onSubmit) {
      onSubmit({ params: values, recipeSlug: recipe.slug });
    }
    // TODO(execution): no run form consumer exists yet. Once `execution`
    // exists, its own hook is expected to be the thing callers actually
    // pass as `onSubmit` — this component has nowhere real to send a
    // submission on its own.
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onValidSubmit)(event)} className="flex flex-col gap-4" noValidate>
      {fields.map((field) => {
        switch (field.control) {
          case "text":
            return <TextField key={field.name} field={field} register={register} errors={formState.errors} />;
          case "textarea":
            return (
              <TextareaField key={field.name} field={field} register={register} errors={formState.errors} />
            );
          case "number":
            return <NumberField key={field.name} field={field} register={register} errors={formState.errors} />;
          case "slider":
            return <SliderField key={field.name} field={field} control={control} errors={formState.errors} />;
          case "select":
            return <SelectField key={field.name} field={field} control={control} errors={formState.errors} />;
          case "switch":
            return <SwitchField key={field.name} field={field} control={control} errors={formState.errors} />;
          case "files":
            return (
              <FileDropzoneField key={field.name} field={field} control={control} errors={formState.errors} />
            );
          default: {
            const exhaustive: never = field.control;
            throw new Error(`Unhandled control: ${String(exhaustive)}`);
          }
        }
      })}

      <RecipeOverrides recipe={recipe} />

      <Button type="submit" disabled={!formState.isValid} className="self-start">
        Run
      </Button>
    </form>
  );
});
