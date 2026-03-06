/**
 * Provider key management — CRUD for API keys stored in auth-profiles.json.
 *
 * auth-profiles.json lives at: {profileDir}/agents/main/agent/auth-profiles.json
 * Format: { version: 1, profiles: { "anthropic:default": { type, provider, key }, ... } }
 *
 * Key concepts:
 *   - propagateAuthToAgents(): Copies main agent's auth-profiles.json to all sub-agents.
 *     Sub-agents share the same credentials as the main agent.
 *   - triggerGatewayAuthReload(): Touches openclaw.json to trigger the gateway daemon's
 *     config file watcher. The daemon watches openclaw.json (not auth-profiles.json) and
 *     re-reads auth-profiles.json from disk when it detects a change.
 *   - Pending keys: During setup wizard, keys are stored in mc-state before the profile
 *     directory exists. They're flushed to auth-profiles.json during deployment.
 */

import { getGatewayState, addPendingKey, getPendingKey, getPendingKeys } from "./mc-state";
import { PROVIDER_ENV_MAP } from "./providers";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ProviderKey {
  provider: string;
  displayName: string;
  validated: boolean;
  configuredAt: string;
  keyHint: string; // last 4 chars
}

export interface ProviderKeyRaw {
  provider: string;
  apiKey: string;
  displayName: string;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/** Map provider IDs to auth-profiles.json key prefixes and provider values */
export const PROVIDER_MAP: Record<string, { prefix: string; provider: string }> = {
  anthropic: { prefix: "anthropic:", provider: "anthropic" },
  openai: { prefix: "openai-codex:", provider: "openai-codex" },
};

/** Read auth-profiles.json from the main agent dir */
export function readAuthProfiles(profileDir: string): {
  version: number;
  profiles: Record<string, { type?: string; provider?: string; key?: string; token?: string; access?: string; refresh?: string; expires?: number; accountId?: string; [k: string]: unknown }>;
} {
  const authPath = join(profileDir, "agents", "main", "agent", "auth-profiles.json");
  if (!existsSync(authPath)) return { version: 1, profiles: {} };
  try {
    const data = JSON.parse(readFileSync(authPath, "utf-8"));
    return { version: data.version || 1, profiles: data.profiles || {} };
  } catch {
    return { version: 1, profiles: {} };
  }
}

/** Write auth-profiles.json to the main agent dir */
export function writeAuthProfiles(
  profileDir: string,
  data: { version: number; profiles: Record<string, { [k: string]: unknown }> }
): void {
  const agentDir = join(profileDir, "agents", "main", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "auth-profiles.json"), JSON.stringify(data, null, 2));
}

/** Extract provider entries from auth-profiles.json */
function extractProviderKeys(
  profiles: Record<string, { type?: string; provider?: string; key?: string; token?: string; access?: string; [k: string]: unknown }>
): Array<{ provider: string; apiKey: string; profileKey: string }> {
  const results: Array<{ provider: string; apiKey: string; profileKey: string }> = [];

  for (const [key, value] of Object.entries(profiles)) {
    // Support API key (key), setup token (token), and OAuth (access)
    const apiKey = value.key || value.token || value.access;
    if (!apiKey) continue;

    if (key.startsWith("anthropic:") || value.provider === "anthropic") {
      results.push({ provider: "anthropic", apiKey, profileKey: key });
    } else if (
      key.startsWith("openai") ||
      value.provider === "openai" ||
      value.provider === "openai-codex"
    ) {
      results.push({ provider: "openai", apiKey, profileKey: key });
    }
  }

  return results;
}

export async function listProviderKeys(): Promise<ProviderKey[]> {
  const gw = getGatewayState();
  const results: ProviderKey[] = [];

  // Read from auth-profiles.json if profile exists
  if (gw.profileDir) {
    const { profiles } = readAuthProfiles(gw.profileDir);
    const entries = extractProviderKeys(profiles);
    for (const e of entries) {
      results.push({
        provider: e.provider,
        displayName: PROVIDER_DISPLAY_NAMES[e.provider] || e.provider,
        validated: true,
        configuredAt: new Date().toISOString(),
        keyHint: e.apiKey.slice(-4),
      });
    }
  }

  // Also include pending keys (not yet written to a profile)
  const seen = new Set(results.map((r) => r.provider));
  for (const pk of getPendingKeys()) {
    if (seen.has(pk.provider)) continue;
    results.push({
      provider: pk.provider,
      displayName: PROVIDER_DISPLAY_NAMES[pk.provider] || pk.provider,
      validated: true,
      configuredAt: pk.savedAt,
      keyHint: pk.apiKey.slice(-4),
    });
  }

  return results;
}

export async function listProviderKeysRaw(): Promise<ProviderKeyRaw[]> {
  const gw = getGatewayState();
  const results: ProviderKeyRaw[] = [];

  if (gw.profileDir) {
    const { profiles } = readAuthProfiles(gw.profileDir);
    const entries = extractProviderKeys(profiles);
    for (const e of entries) {
      results.push({
        provider: e.provider,
        apiKey: e.apiKey,
        displayName: PROVIDER_DISPLAY_NAMES[e.provider] || e.provider,
      });
    }
  }

  // Include pending keys
  const seen = new Set(results.map((r) => r.provider));
  for (const pk of getPendingKeys()) {
    if (seen.has(pk.provider)) continue;
    results.push({
      provider: pk.provider,
      apiKey: pk.apiKey,
      displayName: PROVIDER_DISPLAY_NAMES[pk.provider] || pk.provider,
    });
  }

  return results;
}

export async function getKeyForProvider(provider: string): Promise<string | null> {
  const gw = getGatewayState();

  // Check auth-profiles.json if profile exists
  if (gw.profileDir) {
    const { profiles } = readAuthProfiles(gw.profileDir);
    const entries = extractProviderKeys(profiles);
    const match = entries.find((e) => e.provider === provider);
    if (match) return match.apiKey;
  }

  // Fall back to pending keys (saved during setup before profile exists)
  return getPendingKey(provider);
}

export async function saveProviderKey(
  provider: string,
  apiKey: string
): Promise<{ validated: boolean }> {
  const validated = await validateKey(provider, apiKey);

  const gw = getGatewayState();

  // If no profile exists yet (during setup wizard), store as pending
  if (!gw.profileDir) {
    addPendingKey(provider, apiKey);
    return { validated };
  }

  const mapping = PROVIDER_MAP[provider];
  if (!mapping) throw new Error(`Unknown provider: ${provider}`);

  // 1. Stop gateway FIRST — the daemon's graceful shutdown may flush its
  //    in-memory credential snapshot to disk, overwriting any fresh writes.
  //    By stopping before writing, we prevent the race condition.
  if (gw.profileName) {
    try {
      const { stopGateway } = await import("./gateway");
      await stopGateway();
    } catch {}
  }

  // 2. Write auth-profiles.json now that the daemon is dead
  const authData = readAuthProfiles(gw.profileDir);
  const profileId = `${mapping.prefix}default`;
  authData.profiles[profileId] = {
    type: "api_key",
    provider: mapping.provider,
    key: apiKey,
  };

  writeAuthProfiles(gw.profileDir, authData);
  propagateAuthToAgents(gw.profileDir);

  // 3. Inject the key into the launchd plist and start gateway
  await injectKeysAndStartGateway(gw.profileDir, gw.profileName);

  return { validated };
}

export async function deleteProviderKey(provider: string): Promise<void> {
  const gw = getGatewayState();
  if (!gw.profileDir) return;

  // Stop daemon first to prevent stale snapshot overwrites
  if (gw.profileName) {
    try {
      const { stopGateway } = await import("./gateway");
      await stopGateway();
    } catch {}
  }

  removeProviderAuth(gw.profileDir, provider);
  await injectKeysAndStartGateway(gw.profileDir, gw.profileName);
}

async function validateKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(10000),
        });
        return res.ok;
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        return res.ok;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ── Gateway restart after key changes ─────────────────────────────

/**
 * Touch openclaw.json to trigger the gateway daemon's config file watcher.
 * The gateway watches openclaw.json (NOT auth-profiles.json) for changes.
 * When it detects a change, it re-reads auth-profiles.json from disk,
 * refreshing its in-memory credential cache.
 */
export function triggerGatewayAuthReload(profileDir: string) {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return;
  try {
    const now = new Date();
    utimesSync(configPath, now, now);
  } catch {}
}

/**
 * Inject current API keys into the launchd plist and start the gateway.
 * Caller must stop the gateway BEFORE calling this to prevent the daemon's
 * graceful shutdown from overwriting auth-profiles.json with stale data.
 */
async function injectKeysAndStartGateway(profileDir: string, profileName: string): Promise<void> {
  if (!profileDir || !profileName) return;

  const HOME = homedir();
  const plistPath = join(HOME, "Library", "LaunchAgents", `ai.openclaw.${profileName}.plist`);

  // Read all current keys from auth-profiles.json
  const { profiles } = readAuthProfiles(profileDir);
  const entries = extractProviderKeys(profiles);
  const envKeys: Record<string, string> = {};
  for (const e of entries) {
    const envName = PROVIDER_ENV_MAP[e.provider];
    if (envName) envKeys[envName] = e.apiKey;
  }

  // Inject into plist
  if (existsSync(plistPath) && Object.keys(envKeys).length > 0) {
    try {
      let plist = readFileSync(plistPath, "utf-8");
      for (const [key, value] of Object.entries(envKeys)) {
        // Remove existing entry if present (update it)
        const keyRegex = new RegExp(
          `\\s*<key>${key}</key>\\s*<string>[^<]*</string>`, "g"
        );
        plist = plist.replace(keyRegex, "");
        // Insert fresh entry
        const envDictEnd = plist.lastIndexOf("</dict>", plist.lastIndexOf("</dict>") - 1);
        if (envDictEnd !== -1) {
          const insertion = `    <key>${key}</key>\n    <string>${value}</string>\n`;
          plist = plist.slice(0, envDictEnd) + insertion + plist.slice(envDictEnd);
        }
      }
      writeFileSync(plistPath, plist);
    } catch {}
  }

  // Touch openclaw.json so the daemon reads fresh credentials on start
  triggerGatewayAuthReload(profileDir);

  // Start the gateway (caller already stopped it)
  try {
    const { startGateway } = await import("./gateway");
    await startGateway();
  } catch {}
}

// ── Shared helpers (used by oauth route too) ──────────────────────

export function propagateAuthToAgents(profileDir: string): void {
  const mainAuthPath = join(profileDir, "agents", "main", "agent", "auth-profiles.json");
  if (!existsSync(mainAuthPath)) return;

  const agentsDir = join(profileDir, "agents");
  if (!existsSync(agentsDir)) return;

  try {
    const agents = readdirSync(agentsDir);
    const mainContent = readFileSync(mainAuthPath, "utf-8");

    for (const agentId of agents) {
      if (agentId === "main") continue;
      const agentAuthDir = join(agentsDir, agentId, "agent");
      if (!existsSync(agentAuthDir)) {
        mkdirSync(agentAuthDir, { recursive: true });
      }
      writeFileSync(join(agentAuthDir, "auth-profiles.json"), mainContent);
    }
  } catch {}
}

export function removeProviderAuth(profileDir: string, provider: string): void {
  const agentsDir = join(profileDir, "agents");
  if (!existsSync(agentsDir)) return;

  const providerPrefixes =
    provider === "openai"
      ? ["openai-codex:", "openai:"]
      : [`${provider}:`];

  try {
    const agents = readdirSync(agentsDir);
    for (const agentId of agents) {
      const authPath = join(agentsDir, agentId, "agent", "auth-profiles.json");
      if (!existsSync(authPath)) continue;

      try {
        const authData = JSON.parse(readFileSync(authPath, "utf-8"));
        if (!authData.profiles) continue;

        let changed = false;
        for (const key of Object.keys(authData.profiles)) {
          const profile = authData.profiles[key];
          const matchesPrefix = providerPrefixes.some((p) => key.startsWith(p));
          const matchesProvider =
            profile.provider === provider ||
            (provider === "openai" && profile.provider === "openai-codex");

          if (matchesPrefix || matchesProvider) {
            delete authData.profiles[key];
            changed = true;
          }
        }

        if (changed) {
          writeFileSync(authPath, JSON.stringify(authData, null, 2));
        }
      } catch {}
    }
  } catch {}
}
