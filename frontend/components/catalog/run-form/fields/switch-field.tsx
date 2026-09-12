"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface SwitchFieldProps {
  field: FieldDescriptor;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * `Controller`-based: this codebase's `Switch` (`components/ui/switch.tsx`)
 * wraps `@base-ui/react`'s `Switch.Root`, a controlled component driven by
 * `checked`/`onCheckedChange` -- not a native element `register` can attach
 * a ref to.
 *
 * Unlike the other fields in this set, the label sits BESIDE the control
 * (a toggle reads as "Label [switch]", not "Label" above the control) --
 * `justify-between` puts the switch at the end of the row.
 *
 * `Switch.Root`'s own type (read from `@base-ui/react`'s
 * `switch/root/SwitchRoot.d.ts`) documents `id` as "The id of the hidden
 * input element" (by default -- `nativeButton` is false here, matching
 * `components/ui/switch.tsx`, which never sets it). That hidden `<input>`
 * is a real native form control, so the browser's own `HTMLInputElement
 * .labels` lookup finds a `<label htmlFor>` pointing at it; reading
 * `@base-ui/react`'s own `useAriaLabelledBy` confirms it uses exactly that
 * lookup to wire the visible `role="switch"` element's `aria-labelledby`
 * automatically. So plain `htmlFor`/`id` association works here too, same
 * as a native input -- it just resolves through the hidden input rather
 * than the visible element directly.
 */
function SwitchField({ field, control, errors, className }: SwitchFieldProps) {
  const switchId = React.useId();
  const errorId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);

  return (
    <div data-slot="switch-field" className={cn("flex flex-col gap-1.5", className)}>
      <Controller
        name={field.name as FieldPath<Record<string, unknown>>}
        control={control}
        render={({ field: controllerField }) => (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={switchId}>{field.label}</Label>
            <Switch
              id={switchId}
              checked={Boolean(controllerField.value)}
              onCheckedChange={(checked) => controllerField.onChange(checked)}
              onBlur={controllerField.onBlur}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
            />
          </div>
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

export { SwitchField };
