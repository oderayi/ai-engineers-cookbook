"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface SliderFieldProps {
  field: FieldDescriptor;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * `Controller`-based, not `register`-based, unlike the other three fields
 * in this set. Confirmed by reading `components/ui/slider.tsx`'s real prop
 * API (backed by `@base-ui/react`'s `Slider.Root`): it is a controlled
 * component driven by `value`/`onValueChange`, not a native element with an
 * `onChange` DOM event react-hook-form's uncontrolled `register` can attach
 * a ref to -- exactly the case react-hook-form's own docs point at
 * `Controller` for.
 *
 * `@base-ui/react`'s `Slider.Root` is generic over `Value extends number |
 * readonly number[]` and accepts a bare `number` for a single-thumb slider
 * -- but the installed `components/ui/slider.tsx` wrapper only reads the
 * *array* branch to decide how many thumbs to render
 * (`Array.isArray(value) ? value : ... : [min, max]`); passing a bare
 * `number` as `value` would fall through to that `[min, max]` fallback and
 * render two thumbs instead of one. So this component always wraps the
 * field's single numeric value in a one-element array (`[currentValue]`)
 * when talking to `Slider`, and unwraps `onValueChange`'s `value[0]` back
 * to a plain number before handing it to react-hook-form -- the field's
 * own value in the form (and the zod validator `compileForm` builds for a
 * `"slider"` control) stays a plain `number` throughout.
 */
function SliderField({ field, control, errors, className }: SliderFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const fallbackValue = typeof field.default === "number" ? field.default : min;

  return (
    <div data-slot="slider-field" className={cn("flex flex-col gap-1.5", className)}>
      <Controller
        name={field.name as FieldPath<Record<string, unknown>>}
        control={control}
        defaultValue={fallbackValue}
        render={({ field: controllerField }) => {
          const currentValue =
            typeof controllerField.value === "number" ? controllerField.value : fallbackValue;
          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={inputId}>{field.label}</Label>
                <span className="text-sm text-muted-foreground">{currentValue}</span>
              </div>
              <Slider
                id={inputId}
                min={min}
                max={max}
                step={step}
                value={[currentValue]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  controllerField.onChange(next);
                }}
                onBlur={controllerField.onBlur}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
              />
            </>
          );
        }}
      />
      {field.help ? <p className="text-sm text-muted-foreground">{field.help}</p> : null}
      {hasError ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {String(error?.message ?? "")}
        </p>
      ) : null}
    </div>
  );
}

export { SliderField };
