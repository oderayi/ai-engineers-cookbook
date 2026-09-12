/** Display metadata for a single provider API key env var. */
export interface ProviderMetadata {
  /** Human-readable name shown next to the key field, e.g. "OpenAI". */
  label: string;
  /** Optional link to the provider's key-management docs/dashboard. */
  docsUrl?: string;
}

/**
 * Known provider env keys -> display metadata, keyed by the exact
 * `recipe.env` key name (e.g. "OPENAI_API_KEY"). The global settings screen
 * iterates this map to render one key field per known provider.
 *
 * This is expected to grow as the v1 recipe set locks in which providers are
 * actually needed — see SPEC-settings.md Open Question 6. OpenAI is seeded
 * here as the confirmed minimum.
 */
export const PROVIDER_METADATA: Record<string, ProviderMetadata> = {
  OPENAI_API_KEY: {
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
  },
};
