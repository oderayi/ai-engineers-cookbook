"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
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
import { useResolvedConfig } from "@/hooks/use-resolved-config";
import { compileForm } from "@/lib/catalog/schema-form";
import type { RecipeDetail } from "@/lib/api/models";

export interface RunFormSubmitPayload {
  params: Record<string, unknown>;
  recipeSlug: string;
  /**
   * `RecipeOverrides`' resolved config (`useResolvedConfig`, called here —
   * `RecipeOverrides` itself calls its own copy for rendering, but has no
   * prop through which to hand the result back up, so this is a second,
   * independent subscription to the same underlying settings store, not a
   * duplicated source of truth). Sent verbatim as the run's `config`
   * (`execution`'s Confirmed Decision 2: the server never recomputes it).
   */
  config: Record<string, string>;
  /**
   * Every `control: "files"` field's real `File[]` value, keyed by field
   * name — split out of `params` because `execution`'s wire contract sends
   * files as their own multipart parts, never JSON-embedded (a browser
   * `File` object doesn't survive `JSON.stringify` meaningfully).
   */
  files: Record<string, File[]>;
}

export interface RunFormProps {
  recipe: RecipeDetail;
  /**
   * Receives `{ params, recipeSlug, config, files }` on a valid submit. An
   * unset `onSubmit` no-ops rather than this component inventing a fake
   * destination for the data.
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
 *
 * `focus` moves keyboard focus into the form (its first focusable field) —
 * `recipe-view.tsx` calls this right after `fillExample`, since success
 * criterion 6 requires "Try this example" to both pre-fill AND focus the
 * form, not just silently update it out of view.
 */
export interface RunFormHandle {
  fillExample: (params: Record<string, unknown>) => void;
  focus: () => void;
}

/**
 * The recipe run form (`SPEC-catalog.md`'s Code Style sample): generated
 * entirely from `recipe.inputSchema` via `compileForm` (never hand-coded
 * fields), embeds `settings`' `<RecipeOverrides recipe={recipe} />` verbatim
 * — no adapter, the whole point of `RecipeDetail`/`RecipeEnvDecl`'s
 * structural compatibility — and hands a valid submission's `{ params,
 * recipeSlug, config, files }` upward via `onSubmit` (see
 * `RunFormSubmitPayload`'s own doc comments for `config`/`files`).
 */
export const RunForm = forwardRef<RunFormHandle, RunFormProps>(function RunForm(
  { recipe, onSubmit },
  ref
) {
  const { fields, validator } = useMemo(() => compileForm(recipe.inputSchema), [recipe]);
  const [resolved] = useResolvedConfig(recipe);

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
  const formRef = useRef<HTMLFormElement>(null);

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
      focus: () => {
        const firstField = formRef.current?.querySelector<HTMLElement>(
          "input, textarea, select, button[role='combobox'], [role='switch'], [role='slider']"
        );
        firstField?.focus();
      },
    }),
    [reset, trigger]
  );

  function onValidSubmit(values: Record<string, unknown>) {
    if (!onSubmit) return;

    // File-control fields hold real browser `File[]` values in `values`
    // (same object react-hook-form validated against) -- split those out
    // into their own map rather than leaving them in `params`, matching
    // `RunFormSubmitPayload.files`'s doc comment on why.
    const fileFieldNames = new Set(
      fields.filter((field) => field.control === "files").map((field) => field.name)
    );
    const params: Record<string, unknown> = {};
    const files: Record<string, File[]> = {};
    for (const [key, value] of Object.entries(values)) {
      if (fileFieldNames.has(key)) {
        files[key] = (value as File[] | undefined) ?? [];
      } else {
        params[key] = value;
      }
    }

    onSubmit({ params, recipeSlug: recipe.slug, config: resolved.config, files });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => void handleSubmit(onValidSubmit)(event)}
      className="flex flex-col gap-4"
      noValidate
    >
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
