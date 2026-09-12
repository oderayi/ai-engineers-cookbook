"use client";

import { BackendUrlField } from "@/components/settings/backend-url-field";
import { ClearAllButton } from "@/components/settings/clear-all-button";
import { KeysSafetyNote } from "@/components/settings/keys-safety-note";
import { ProviderKeyField } from "@/components/settings/provider-key-field";
import { useSettings } from "@/hooks/use-settings";
import { PROVIDER_METADATA } from "@/lib/settings/providers";

/**
 * The global settings screen (SPEC-settings.md Phase 4, Task 11): the one
 * place provider API keys and the custom backend URL are set as defaults for
 * every recipe. Mounted in `app-shell`'s main slot at `/settings` by a later
 * task (12) -- this component owns only its own content, not the page frame
 * (width constraint/padding come from `Shell`, see
 * `components/shell/shell.tsx`).
 *
 * `useSettings()` is called exactly once here, at the top; every field below
 * is a controlled view over that single source of truth, so typing into any
 * field round-trips through `useLocalStorage` and is visible to every other
 * consumer of `useSettings()` (e.g. `RecipeOverrides`'s inheritance badges).
 *
 * Renders identically whether the store is empty (first visit) or populated
 * -- per SPEC-settings.md Confirmed Decision 10 ("empty state is first-class"),
 * an empty store is just every field showing its own empty value, never an
 * error or a blocking screen.
 */
export function SettingsScreen() {
  const [settings, actions] = useSettings();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          These apply as defaults across every recipe. Any recipe&apos;s own
          run form can still override a value just for that run.
        </p>
      </header>

      <KeysSafetyNote />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-foreground">Provider API keys</h2>
          <p className="text-sm text-muted-foreground">
            Saved here once, used by default everywhere a recipe needs it.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {Object.entries(PROVIDER_METADATA).map(([envKey, metadata]) => (
            <ProviderKeyField
              key={envKey}
              envKey={envKey}
              label={metadata.label}
              docsUrl={metadata.docsUrl}
              value={settings.global[envKey] ?? ""}
              onChange={(value) => actions.setGlobalKey(envKey, value)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-foreground">Backend</h2>
          <p className="text-sm text-muted-foreground">
            Point recipes at a self-hosted backend instead of the default.
          </p>
        </div>
        <BackendUrlField value={settings.customBackendUrl} onChange={actions.setBackendUrl} />
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-foreground">Danger zone</h2>
          <p className="text-sm text-muted-foreground">
            Removes every saved key, backend URL, and per-recipe override from
            this browser.
          </p>
        </div>
        <div>
          <ClearAllButton onConfirm={actions.clearAll} />
        </div>
      </section>
    </div>
  );
}
