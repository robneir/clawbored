import { readAuthProfiles, writeAuthProfiles, propagateAuthToAgents, triggerGatewayAuthReload } from "./provider-keys";

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const ANTHROPIC_CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";

interface OAuthProfile {
  provider?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  [k: string]: unknown;
}

export interface OAuthHealth {
  provider: "openai" | "anthropic";
  expiresAt: number;
  refreshable: boolean;
  status: "healthy" | "expiring" | "expired";
}

function resolveProvider(profileKey: string, profile: OAuthProfile): "openai" | "anthropic" | null {
  if (
    profile.provider === "openai-codex" ||
    profile.provider === "openai" ||
    profileKey.startsWith("openai")
  ) {
    return "openai";
  }
  if (profile.provider === "anthropic" || profileKey.startsWith("anthropic:")) {
    return "anthropic";
  }
  return null;
}

async function refreshOpenAI(refreshToken: string): Promise<{ access: string; refresh: string; expiresAt: number }> {
  const res = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OPENAI_CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("OpenAI refresh response missing fields");
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

async function refreshAnthropic(refreshToken: string): Promise<{ access: string; refresh: string; expiresAt: number }> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("Anthropic refresh response missing fields");
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

export async function refreshExpiredOAuthTokens(profileDir: string): Promise<{ refreshed: string[]; errors: string[] }> {
  const auth = readAuthProfiles(profileDir);
  const now = Date.now();
  const refreshed: string[] = [];
  const errors: string[] = [];
  let changed = false;

  for (const [profileKey, raw] of Object.entries(auth.profiles)) {
    const profile = raw as OAuthProfile;
    if (!profile.refresh || typeof profile.expires !== "number") continue;

    // Refresh if expired or expiring within 2 minutes.
    if (profile.expires > now + 2 * 60 * 1000) continue;

    const provider = resolveProvider(profileKey, profile);
    if (!provider) continue;

    try {
      const updated =
        provider === "openai"
          ? await refreshOpenAI(profile.refresh)
          : await refreshAnthropic(profile.refresh);

      auth.profiles[profileKey] = {
        ...profile,
        access: updated.access,
        refresh: updated.refresh,
        expires: updated.expiresAt,
      };
      changed = true;
      refreshed.push(provider);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Failed to refresh ${provider}`);
    }
  }

  if (changed) {
    writeAuthProfiles(profileDir, auth as { version: number; profiles: Record<string, { [k: string]: unknown }> });
    propagateAuthToAgents(profileDir);
    triggerGatewayAuthReload(profileDir);
  }

  return { refreshed, errors };
}

export function getOAuthTokenHealth(profileDir: string): OAuthHealth[] {
  const auth = readAuthProfiles(profileDir);
  const now = Date.now();
  const results: OAuthHealth[] = [];

  for (const [profileKey, raw] of Object.entries(auth.profiles)) {
    const profile = raw as OAuthProfile;
    if (typeof profile.expires !== "number") continue;
    const provider = resolveProvider(profileKey, profile);
    if (!provider) continue;

    const refreshable = !!profile.refresh;
    const status =
      profile.expires <= now
        ? "expired"
        : profile.expires <= now + 10 * 60 * 1000
        ? "expiring"
        : "healthy";

    // Keep latest expiry per provider if multiple entries exist.
    const existingIdx = results.findIndex((r) => r.provider === provider);
    if (existingIdx >= 0) {
      if (results[existingIdx].expiresAt < profile.expires) {
        results[existingIdx] = {
          provider,
          expiresAt: profile.expires,
          refreshable,
          status,
        };
      }
      continue;
    }

    results.push({
      provider,
      expiresAt: profile.expires,
      refreshable,
      status,
    });
  }

  return results;
}
