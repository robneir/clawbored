import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MC_DIR = join(homedir(), ".clawboard");
const LEGACY_DIR = join(homedir(), ".mission-control");
const STATE_FILE = join(MC_DIR, "state.json");

export interface GatewayState {
  port: number;
  token: string | null;
  profileDir: string;
  profileName: string;
  pid: number | null;
  status: string; // "not_setup" | "setup" | "running" | "stopped" | "error"
  setupAt: string | null;
  deployId: string | null;
  displayName: string;
}

export interface AuthState {
  authMethod: string | null; // "api-key" | "subscription"
  provider: string | null;
  configuredAt: string | null;
  subscriptionType: string | null;
  claudeCliPath: string | null;
}

/** Keys saved before a profile exists (during setup wizard) */
export interface PendingKey {
  provider: string;
  apiKey: string;
  savedAt: string;
}

/** OAuth tokens saved before a profile exists (during setup wizard) */
export interface PendingOAuthToken {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  savedAt: string;
}

export interface McState {
  activeProfile: GatewayState;
  auth: AuthState;
  pendingKeys?: PendingKey[];
  pendingOAuthTokens?: PendingOAuthToken[];
}

const DEFAULT_GATEWAY: GatewayState = {
  port: 19100,
  token: null,
  profileDir: "",
  profileName: "",
  pid: null,
  status: "not_setup",
  setupAt: null,
  deployId: null,
  displayName: "",
};

const DEFAULT_AUTH: AuthState = {
  authMethod: null,
  provider: null,
  configuredAt: null,
  subscriptionType: null,
  claudeCliPath: null,
};

const DEFAULT_STATE: McState = {
  activeProfile: { ...DEFAULT_GATEWAY },
  auth: { ...DEFAULT_AUTH },
};

function ensureDir(): void {
  if (!existsSync(MC_DIR)) {
    // Auto-migrate from legacy ~/.mission-control/ if it exists
    if (existsSync(LEGACY_DIR)) {
      try {
        renameSync(LEGACY_DIR, MC_DIR);
      } catch {
        // Rename failed (cross-device, permissions, etc.) — just create fresh
        mkdirSync(MC_DIR, { recursive: true });
      }
    } else {
      mkdirSync(MC_DIR, { recursive: true });
    }
  }
}

export function readState(): McState {
  ensureDir();
  if (!existsSync(STATE_FILE)) return structuredClone(DEFAULT_STATE);
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return {
      activeProfile: { ...DEFAULT_GATEWAY, ...raw.activeProfile },
      auth: { ...DEFAULT_AUTH, ...raw.auth },
      pendingKeys: raw.pendingKeys || [],
      pendingOAuthTokens: raw.pendingOAuthTokens || [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function writeState(state: McState): void {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function getGatewayState(): GatewayState {
  return readState().activeProfile;
}

export function updateGatewayState(updates: Partial<GatewayState>): GatewayState {
  const state = readState();
  state.activeProfile = { ...state.activeProfile, ...updates };
  writeState(state);
  return state.activeProfile;
}

export function getAuthState(): AuthState {
  return readState().auth;
}

export function updateAuthState(updates: Partial<AuthState>): AuthState {
  const state = readState();
  state.auth = { ...state.auth, ...updates };
  writeState(state);
  return state.auth;
}

export function getMcDir(): string {
  ensureDir();
  return MC_DIR;
}

/** Save a provider key to pending (used when no profile exists yet) */
export function addPendingKey(provider: string, apiKey: string): void {
  const state = readState();
  const pending = (state.pendingKeys || []).filter((k) => k.provider !== provider);
  pending.push({ provider, apiKey, savedAt: new Date().toISOString() });
  state.pendingKeys = pending;
  writeState(state);
}

/** Get a pending key for a provider */
export function getPendingKey(provider: string): string | null {
  const state = readState();
  const match = (state.pendingKeys || []).find((k) => k.provider === provider);
  return match?.apiKey ?? null;
}

/** Get all pending keys */
export function getPendingKeys(): PendingKey[] {
  return readState().pendingKeys || [];
}

/** Clear all pending keys (after they've been written to auth-profiles.json) */
export function clearPendingKeys(): void {
  const state = readState();
  state.pendingKeys = [];
  writeState(state);
}

/** Save an OAuth token to pending (used when no profile exists yet during setup wizard) */
export function addPendingOAuthToken(
  provider: string,
  creds: { access: string; refresh: string; expires: number; accountId?: string },
): void {
  const state = readState();
  const pending = (state.pendingOAuthTokens || []).filter((t) => t.provider !== provider);
  pending.push({ provider, ...creds, savedAt: new Date().toISOString() });
  state.pendingOAuthTokens = pending;
  writeState(state);
}

/** Get all pending OAuth tokens */
export function getPendingOAuthTokens(): PendingOAuthToken[] {
  return readState().pendingOAuthTokens || [];
}

/** Clear all pending OAuth tokens (after they've been written to auth-profiles.json) */
export function clearPendingOAuthTokens(): void {
  const state = readState();
  state.pendingOAuthTokens = [];
  writeState(state);
}
