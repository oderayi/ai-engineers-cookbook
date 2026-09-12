"use client";

import * as React from "react";
import type { FieldErrors, FieldPath, UseFormRegister } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface TextFieldProps {
  field: FieldDescriptor;
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * Uncontrolled `<input type="text">` wired via `register` -- react-hook-form
 * handles native `<input>` elements itself, so no `Controller` is needed
 * here (see `slider-field.tsx` for the one control in this set that does
 * need it, and why).
 */
function TextField({ field, register, errors, className }: TextFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);

  return (
    <div data-slot="text-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{field.label}</Label>
      <Input
        id={inputId}
        type="text"
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        {...register(field.name as FieldPath<Record<string, unknown>>)}
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

export { TextField };
