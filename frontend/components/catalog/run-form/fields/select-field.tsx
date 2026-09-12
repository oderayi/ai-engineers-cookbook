"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface SelectFieldProps {
  field: FieldDescriptor;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * `Controller`-based: this codebase's `Select` (`components/ui/select.tsx`)
 * wraps `@base-ui/react`'s `Select.Root`, a controlled component driven by
 * `value`/`onValueChange` -- not a native element `register` can attach a
 * ref to.
 *
 * `SelectTrigger` (read directly from `components/ui/select.tsx` and its
 * underlying `@base-ui/react` type: `SelectTriggerProps extends
 * NativeButtonProps, BaseUIComponentProps<'button', ...>`) renders a real
 * `<button>` and passes through plain HTML button props, `id` included --
 * so `Label htmlFor`/`id` association works exactly like a native input,
 * no `aria-labelledby`/wrapping workaround needed.
 *
 * Options come from `field.options` (a plain `string[]`, per
 * `FieldDescriptor` -- these are always JSON Schema string enums, see
 * `lib/catalog/schema-form.ts`), rendered one `SelectItem` per option with
 * the option string doubling as both `value` and label.
 */
function SelectField({ field, control, errors, className }: SelectFieldProps) {
  const triggerId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);
  const options = field.options ?? [];

  return (
    <div data-slot="select-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={triggerId}>{field.label}</Label>
      <Controller
        name={field.name as FieldPath<Record<string, unknown>>}
        control={control}
        render={({ field: controllerField }) => (
          <Select
            value={typeof controllerField.value === "string" ? controllerField.value : null}
            onValueChange={(value) => controllerField.onChange(value)}
          >
            <SelectTrigger
              id={triggerId}
              onBlur={controllerField.onBlur}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
            >
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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

export { SelectField };
