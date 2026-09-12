"use client";

import * as React from "react";
import type { FieldErrors, FieldPath, UseFormRegister } from "react-hook-form";

import { Label } from "@/components/ui/label";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface TextareaFieldProps {
  field: FieldDescriptor;
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * Uncontrolled `<textarea>` wired via `register`. There is no shadcn
 * Textarea installed in this codebase (checked `components/ui/`), so this
 * is a plain native `<textarea>` styled by hand to match `Input`'s own
 * classes (`components/ui/input.tsx`) rather than pulling in a new
 * dependency for one element.
 *
 * Per `schema-form.ts`'s header comment (finding #5 / `isStringArray`),
 * the `"textarea"` control represents a `list[str]` field, one item per
 * line -- the newline-to-array split happens in the zod validator
 * `compileForm` already builds, not here. This component only renders the
 * textarea and wires register/errors; it never parses or joins lines
 * itself.
 */
function TextareaField({ field, register, errors, className }: TextareaFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);

  return (
    <div data-slot="textarea-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{field.label}</Label>
      <textarea
        id={inputId}
        rows={4}
        className={cn(
          "min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        )}
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

export { TextareaField };
