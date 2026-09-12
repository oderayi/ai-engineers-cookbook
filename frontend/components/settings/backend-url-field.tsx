"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

export interface BackendUrlFieldProps {
  /** Current field value. Empty string means "use the app's default backend". */
  value: string;
  /** Called with the raw, untransformed value on every keystroke. */
  onChange: (value: string) => void;
  className?: string;
}

const HTTP_URL_PATTERN = /^https?:\/\/.+/;

/**
 * Mirrors `frontend/lib/settings/schema.ts`'s `backendUrl` refinement: an
 * empty (trimmed) value is valid -- it falls back to the app's default
 * backend on read -- and a non-empty value must match `/^https?:\/\/.+/`.
 *
 * This component only validates and reports validity; trailing-slash
 * normalization is the schema's job when the value is persisted/read, not
 * this field's.
 */
function isValidBackendUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || HTTP_URL_PATTERN.test(trimmed);
}

/**
 * Controlled text input for the custom backend URL setting. Purely
 * presentational/validating -- it does not read or write `localStorage`
 * itself; whoever composes this in (`useSettings`, wired up in a later
 * task) owns persistence.
 */
function BackendUrlField({ value, onChange, className }: BackendUrlFieldProps) {
  const inputId = React.useId();
  const errorId = React.useId();
  const isValid = isValidBackendUrl(value);
  const showError = value !== "" && !isValid;

  return (
    <div data-slot="backend-url-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>Custom backend URL</Label>
      <Input
        id={inputId}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://api.example.com (leave empty to use the default)"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={showError}
        aria-describedby={showError ? errorId : undefined}
      />
      {showError ? (
        <p id={errorId} className="text-sm text-destructive">
          Must be an http(s) URL
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Leave empty to use the default backend.
        </p>
      )}
    </div>
  );
}

export { BackendUrlField };
