"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

export interface ProviderKeyFieldProps {
  /** e.g. "OPENAI_API_KEY" -- used for the input's id/name and testid. */
  envKey: string;
  /** Human-readable label text, e.g. "OpenAI". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Optional link to the provider's key-management docs. */
  docsUrl?: string;
  className?: string;
}

/**
 * A masked API-key input with a per-instance show/hide toggle.
 *
 * Visibility is local `useState`, not lifted -- each field owns its own
 * show/hide flag, so two instances rendered side by side never share state.
 * The raw key never leaves the input's own `value`: no console logging, and
 * nothing else in the markup (tooltip, aria-label, etc.) echoes it back.
 */
export function ProviderKeyField({
  envKey,
  label,
  value,
  onChange,
  docsUrl,
  className,
}: ProviderKeyFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const inputId = `provider-key-field-${envKey}`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
          >
            Get an API key
          </a>
        ) : null}
      </div>
      <div className="relative flex items-center">
        <Input
          id={inputId}
          name={envKey}
          data-testid={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="pr-8"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-0.5"
          aria-label={visible ? "Hide key" : "Show key"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
