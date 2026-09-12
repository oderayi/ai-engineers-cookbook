"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { InheritanceBadge } from "@/components/settings/inheritance-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResolvedConfig } from "@/hooks/use-resolved-config";
import type { ResolvedField } from "@/lib/settings/resolve";
import type { RecipeEnvDecl } from "@/lib/settings/types";
import { cn } from "@/lib/cn";

/**
 * The exact prop shape `catalog`'s `RunForm` mounts this with — see
 * `SPEC-catalog.md`'s Code Style sample: `<RecipeOverrides recipe={recipe} />`
 * where `recipe: RecipeDetail`. `RecipeDetail.env` is `EnvVar[]`, structurally
 * identical to `RecipeEnvDecl` here (both `{ key, provider, required,
 * description }`), so a real `RecipeDetail` satisfies this prop with no
 * adapter once `catalog` exists — this is the module's one deliverable other
 * modules embed directly, so the shape is deliberately this narrow: nothing
 * beyond `slug` and `env` is required.
 */
export interface RecipeOverridesProps {
  recipe: { slug: string; env: RecipeEnvDecl[] };
  className?: string;
}

/**
 * A fixed-width mask, not a length-preserving one: the global value's actual
 * length is itself information about the key, so the placeholder never
 * reflects it.
 */
const MASKED_PLACEHOLDER = "••••••••";

/**
 * The per-recipe overrides panel embedded in `catalog`'s run form — one row
 * per key `recipe.env` declares (never any other key, per SPEC-settings.md
 * Confirmed Decision 4: "only declared keys are overridable"), each showing
 * its resolved source via `InheritanceBadge` and an editable override field.
 *
 * A recipe declaring no env vars renders nothing rather than an empty panel.
 */
export function RecipeOverrides({ recipe, className }: RecipeOverridesProps) {
  const [resolved, actions] = useResolvedConfig(recipe);

  if (recipe.env.length === 0) return null;

  const declByKey = new Map(recipe.env.map((decl) => [decl.key, decl]));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {resolved.fields.map((field) => (
        <OverrideRow
          key={field.key}
          slug={recipe.slug}
          field={field}
          label={declByKey.get(field.key)?.provider ?? field.key}
          onSetOverride={actions.setOverride}
          onClearOverride={actions.clearOverride}
        />
      ))}
    </div>
  );
}

interface OverrideRowProps {
  slug: string;
  field: ResolvedField;
  label: string;
  onSetOverride: (slug: string, envKey: string, value: string) => void;
  onClearOverride: (slug: string, envKey: string) => void;
}

function OverrideRow({ slug, field, label, onSetOverride, onClearOverride }: OverrideRowProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `recipe-override-${slug}-${field.key}`;

  // The input is fully controlled by the resolved field itself, not a local
  // draft: it shows the real override text when one exists, and is empty
  // otherwise (an inherited global value is never copied into the override
  // field — that would silently turn "inheriting" into "overridden with the
  // same value" the moment the user touched the field).
  const value = field.source === "override" ? (field.value ?? "") : "";
  const placeholder = field.source === "global" ? MASKED_PLACEHOLDER : undefined;

  function handleChange(next: string) {
    if (next.trim() === "") {
      onClearOverride(slug, field.key);
    } else {
      onSetOverride(slug, field.key, next);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <InheritanceBadge source={field.source} required={field.required} />
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            placeholder={placeholder}
            onChange={(event) => handleChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="pr-8"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-0.5 -translate-y-1/2"
            aria-label={visible ? "Hide key" : "Show key"}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        </div>
        {field.source === "override" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onClearOverride(slug, field.key)}>
            Reset to global
          </Button>
        ) : null}
      </div>
    </div>
  );
}
