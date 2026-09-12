"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";

import { Label } from "@/components/ui/label";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";
import { cn } from "@/lib/cn";

export interface FileDropzoneFieldProps {
  field: FieldDescriptor;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
  className?: string;
}

/**
 * `Controller`-based: a native `<input type="file">`'s `value` can't be set
 * programmatically (browsers only ever let it be the empty string or a
 * user's real filesystem pick, for security reasons), so this field never
 * passes react-hook-form's value back to the `<input>` -- it stays
 * uncontrolled for the browser's own purposes. Instead, `Controller`'s
 * `field.onChange(files)` is called by hand from this component's own
 * `onChange` (native picker) and `onDrop` (drag-and-drop) handlers, each
 * converting the browser's `FileList` to a plain `File[]` first (matching
 * `buildFieldValidator`'s `z.array(z.instanceof(File))` in
 * `lib/catalog/schema-form.ts`).
 *
 * No `react-dropzone` (or similar) dependency: per this module's own
 * architecture decision (`tasks/plan-catalog.md`, "no control type not
 * derivable from JSON Schema ... no dependency for bundle size"),
 * drag-and-drop is wired directly with `onDragOver`/`onDragLeave`/`onDrop`
 * native handlers, each calling `event.preventDefault()` so the browser
 * doesn't navigate away to render the dropped file.
 *
 * `field.maxFiles` is enforced here, client-side, on every new selection
 * (picker or drop): a selection over the limit shows a validation message
 * and is discarded outright -- `Controller`'s `onChange` is never called
 * with it, so the form's value simply stays whatever it already was
 * (nothing to "truncate", nothing silently dropped from a partially-applied
 * selection).
 */
function FileDropzoneField({ field, control, errors, className }: FileDropzoneFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const limitMessageId = React.useId();
  const error = errors[field.name];
  const hasError = Boolean(error);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [limitMessage, setLimitMessage] = React.useState<string | null>(null);
  const acceptAttribute = field.accept && field.accept.length > 0 ? field.accept.join(",") : undefined;
  const describedBy = hasError ? errorId : limitMessage ? limitMessageId : undefined;

  const applySelection = React.useCallback(
    (files: File[], onChange: (value: File[]) => void) => {
      if (field.maxFiles !== undefined && files.length > field.maxFiles) {
        setLimitMessage(
          `You can select up to ${field.maxFiles} file${field.maxFiles === 1 ? "" : "s"}, but ${files.length} were selected. The previous selection was kept.`
        );
        return;
      }
      setLimitMessage(null);
      onChange(files);
    },
    [field.maxFiles]
  );

  return (
    <div data-slot="file-dropzone-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{field.label}</Label>
      <Controller
        name={field.name as FieldPath<Record<string, unknown>>}
        control={control}
        render={({ field: controllerField }) => {
          const selectedFiles: File[] = Array.isArray(controllerField.value)
            ? (controllerField.value as File[])
            : [];

          return (
            <div
              data-slot="file-dropzone"
              data-dragging={isDraggingOver ? "true" : undefined}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border border-dashed border-input p-3 transition-colors",
                "text-sm",
                isDraggingOver && "border-ring bg-accent/50",
                hasError && "border-destructive"
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDraggingOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingOver(false);
                const dropped = Array.from(event.dataTransfer.files);
                if (dropped.length === 0) return;
                applySelection(dropped, controllerField.onChange);
              }}
            >
              <input
                id={inputId}
                type="file"
                multiple
                accept={acceptAttribute}
                aria-invalid={hasError}
                aria-describedby={describedBy}
                className="w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
                onBlur={controllerField.onBlur}
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  applySelection(selected, controllerField.onChange);
                  // The native input stays uncontrolled -- reset its own
                  // display value so picking the same file(s) again still
                  // fires `onChange`, and so a rejected over-limit pick
                  // doesn't linger in the browser's own "N files" label.
                  event.target.value = "";
                }}
              />
              <p className="text-muted-foreground">Drag and drop files here, or choose files above.</p>
              {selectedFiles.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="text-foreground">
                      {file.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        }}
      />
      {field.help ? <p className="text-sm text-muted-foreground">{field.help}</p> : null}
      {limitMessage ? (
        <p id={limitMessageId} className="text-sm text-destructive" role="alert">
          {limitMessage}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {String(error?.message ?? "")}
        </p>
      ) : null}
    </div>
  );
}

export { FileDropzoneField };
