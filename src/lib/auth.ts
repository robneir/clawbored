import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const MC_STATE = join(HOME, ".mission-control");
const AUTH_FILE = join(MC_STATE, "auth.json");

interface AuthConfig {
  anthropicApiKey?: string;
  authMethod?: string; // "api-key" | "subscription"
  provider?: string;
  configuredAt?: string;
  subscriptionType?: string; // "Pro" | "Max" | "Team"
  claudeCliPath?: string;
}

function ensureState() {
  if (!existsSync(MC_STATE)) mkdirSync(MC_STATE, { recursive: true });
}

export function getAuthConfig(): AuthConfig {
  ensureState();
  if (!existsSync(AUTH_FILE)) return {};
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveAuthConfig(config: Partial<AuthConfig>): void {
  ensureState();
  const existing = getAuthConfig();
  const merged = { ...existing, ...config, configuredAt: new Date().toISOString() };
  writeFileSync(AUTH_FILE, JSON.stringify(merged, null, 2));
}

export function hasApiKey(): boolean {
  const config = getAuthConfig();
  return !!config.anthropicApiKey || config.authMethod === "subscription";
}

export function getApiKey(): string | null {
  const config = getAuthConfig();
  return config.anthropicApiKey || null;
}

export function getAuthMethod(): string | null {
  const config = getAuthConfig();
  return config.authMethod || null;
}

export function isSubscriptionAuth(): boolean {
  return getAuthConfig().authMethod === "subscription";
}
