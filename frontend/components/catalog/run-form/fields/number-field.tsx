"use client";

import * as React from "react";
import type { FieldErrors, FieldPath, UseFormRegister } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface NumberFieldProps {
  field: FieldDescriptor;
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * Uncontrolled `<input type="number">` wired via `register(name,
 * { valueAsNumber: true })` so react-hook-form coerces the raw string input
 * value to a number itself. `field.min`/`field.max`/`field.step` are also
 * applied as native `min`/`max`/`step` HTML attributes (not only enforced by
 * the zod validator `compileForm` builds) so the browser's own affordances
 * -- spinner clamping, native "value out of range" hinting -- still work.
 */
function NumberField({ field, register, errors, className }: NumberFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);

  return (
    <div data-slot="number-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{field.label}</Label>
      <Input
        id={inputId}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        {...register(field.name as FieldPath<Record<string, unknown>>, { valueAsNumber: true })}
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

export { NumberField };
