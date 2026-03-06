/**
 * Shared provider definitions — single source of truth for all AI provider config.
 *
 * Consumed by:
 *   - Settings page (provider cards)
 *   - Setup wizard (provider selection step)
 *   - gateway.ts (PROVIDER_ENV_MAP for env injection)
 *   - provider-keys.ts (PROVIDER_ENV_MAP for plist injection)
 */

import type { ComponentType } from "react";

export interface ProviderConfig {
  /** Internal provider ID used in auth-profiles.json and API routes */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description shown in UI cards */
  description: string;
  /** API key placeholder text */
  placeholder: string;
  /** Link to the provider's API key management page */
  docsUrl: string;
  /** Environment variable name used by the gateway daemon */
  envVar: string;
  /** Whether this provider supports OAuth/subscription login */
  supportsSubscription: boolean;
  /** Label for the subscription section (e.g. "Claude Subscription") */
  subscriptionLabel?: string;
  /** Label shown when subscription is connected */
  subscriptionConnectedLabel?: string;
  /** CTA text for the connect button */
  connectLabel?: string;
  /** Placeholder for manual token paste input */
  tokenPlaceholder?: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models — Opus, Sonnet, Haiku",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    envVar: "ANTHROPIC_API_KEY",
    supportsSubscription: true,
    subscriptionLabel: "Claude Subscription",
    subscriptionConnectedLabel: "Connected via setup token",
    connectLabel: "Sign in with your Claude account",
    tokenPlaceholder: "sk-ant-oat01-...",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, o3, o4-mini and more",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    envVar: "OPENAI_API_KEY",
    supportsSubscription: true,
    subscriptionLabel: "Codex Subscription",
    subscriptionConnectedLabel: "Connected via OAuth",
    connectLabel: "Sign in with your ChatGPT account",
    tokenPlaceholder: "sk-...",
  },
];

/** Map provider IDs → environment variable names (used by gateway and plist injection) */
export const PROVIDER_ENV_MAP: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.envVar])
);

/** Look up a provider config by ID */
export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
