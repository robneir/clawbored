import { getAuthState, updateAuthState, getGatewayState } from "./mc-state";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AuthConfig {
  authMethod?: string; // "api-key" | "subscription"
  provider?: string;
  configuredAt?: string;
  subscriptionType?: string; // "Pro" | "Max" | "Team"
  claudeCliPath?: string;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const state = getAuthState();
  return {
    authMethod: state.authMethod ?? undefined,
    provider: state.provider ?? undefined,
    configuredAt: state.configuredAt ?? undefined,
    subscriptionType: state.subscriptionType ?? undefined,
    claudeCliPath: state.claudeCliPath ?? undefined,
  };
}

export async function saveAuthConfig(config: Partial<AuthConfig>): Promise<void> {
  updateAuthState({
    ...(config.authMethod !== undefined && { authMethod: config.authMethod ?? null }),
    ...(config.provider !== undefined && { provider: config.provider ?? null }),
    ...(config.subscriptionType !== undefined && { subscriptionType: config.subscriptionType ?? null }),
    ...(config.claudeCliPath !== undefined && { claudeCliPath: config.claudeCliPath ?? null }),
    configuredAt: new Date().toISOString(),
  });
}

export async function clearAuthConfig(): Promise<void> {
  updateAuthState({
    authMethod: null,
    provider: null,
    configuredAt: null,
    subscriptionType: null,
    claudeCliPath: null,
  });
}

export async function hasApiKey(): Promise<boolean> {
  const config = getAuthState();
  // Check auth-profiles.json on disk
  const key = await getApiKey();
  return !!key || config.authMethod === "subscription";
}

export async function getApiKey(): Promise<string | null> {
  // Read from active profile's auth-profiles.json
  const gw = getGatewayState();
  if (gw.profileDir) {
    const authPath = join(gw.profileDir, "agents", "main", "agent", "auth-profiles.json");
    if (existsSync(authPath)) {
      try {
        const data = JSON.parse(readFileSync(authPath, "utf-8"));
        const profiles = data?.profiles || {};
        for (const [key, value] of Object.entries(profiles)) {
          const entry = value as { provider?: string; key?: string; token?: string };
          const apiKey = entry.key || entry.token;
          if (apiKey && (key.startsWith("anthropic:") || entry.provider === "anthropic")) {
            return apiKey;
          }
        }
      } catch {}
    }
  }
  return null;
}

export async function getAuthMethod(): Promise<string | null> {
  return getAuthState().authMethod;
}

export async function isSubscriptionAuth(): Promise<boolean> {
  return getAuthState().authMethod === "subscription";
}
