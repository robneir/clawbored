/**
 * Gateway lifecycle management — start, stop, disconnect, profile switching.
 *
 * The gateway is an OpenClaw daemon managed via launchd (macOS). Key operations:
 *   - startGateway(): Installs service, injects env vars into plist, starts daemon
 *   - stopGateway(): Stops daemon via CLI + kills lingering processes
 *   - disconnectGateway(): Full teardown — stop, nuke launchd service, optionally delete files
 *   - switchProfile(): Points the gateway singleton at a different profile directory
 *   - buildGatewayEnv(): Reads API keys from auth-profiles.json and injects them as env vars
 *   - injectPlistEnvVars(): Writes API keys into the launchd plist XML so the daemon has them
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import {
  getGatewayState,
  updateGatewayState,
  type GatewayState,
} from "./mc-state";
import { PROVIDER_ENV_MAP } from "./providers";

const HOME = homedir();

export interface Gateway {
  port: number;
  token: string | null;
  profileDir: string;
  profileName: string;
  pid: number | null;
  status: string;
  setupAt: string | null;
  deployId: string | null;
  displayName: string;
  live?: boolean;
}

/** Build the --profile flag for openclaw CLI. Always requires a named profile. */
export function profileFlag(profileName: string): string {
  if (!profileName || profileName === "default") {
    throw new Error("Cannot use the default profile. All profiles must be named.");
  }
  return `--profile ${profileName}`;
}

/** Build args array for spawn. Always requires a named profile. */
export function profileArgs(profileName: string): string[] {
  if (!profileName || profileName === "default") {
    throw new Error("Cannot use the default profile. All profiles must be named.");
  }
  return ["--profile", profileName];
}

/** Kill a process by PID, but never kill the current Node process or its parent. */
export function safeKill(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  if (!pid || pid <= 1 || pid === process.pid || pid === process.ppid) return;
  try { process.kill(pid, signal); } catch {}
}

/** Kill all processes on a port, excluding the current Node process tree. */
export function safeKillPort(port: number, signal: string = "TERM") {
  if (!port || port < 1024) return;
  try {
    const pids = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (!pids) return;
    for (const p of pids.split("\n")) {
      const pid = Number(p);
      safeKill(pid, `SIG${signal}` as NodeJS.Signals);
    }
  } catch {}
}

/**
 * Completely remove a profile's launchd service so macOS never respawns it.
 * This MUST be called before deleting a profile's files.
 */
function nukelaunchdService(profileName: string): void {
  if (!profileName) return;

  const plistPath = join(HOME, "Library", "LaunchAgents", `ai.openclaw.${profileName}.plist`);

  // Step 1: Unload the service (tells launchd to stop managing it)
  try {
    execSync(`launchctl unload ${JSON.stringify(plistPath)} 2>/dev/null`, {
      stdio: "pipe",
      timeout: 5000,
    });
  } catch {}

  // Step 2: Also try bootout (newer launchd API, more aggressive)
  try {
    execSync(`launchctl bootout gui/$(id -u) ${JSON.stringify(plistPath)} 2>/dev/null`, {
      stdio: "pipe",
      timeout: 5000,
    });
  } catch {}

  // Step 3: Delete the plist file so it can never be loaded again
  if (existsSync(plistPath)) {
    try { rmSync(plistPath, { force: true }); } catch {}
  }

  // Step 4: Kill any lingering openclaw-gateway processes for this profile
  try {
    const pids = execSync(
      `ps aux | grep 'openclaw.*--profile.*${profileName}' | grep -v grep | awk '{print $2}'`,
      { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (pids) {
      for (const p of pids.split("\n")) {
        const pid = Number(p);
        safeKill(pid, "SIGKILL");
      }
    }
  } catch {}
}

function stateToGateway(s: GatewayState): Gateway {
  return { ...s, live: undefined };
}

/**
 * Get the active gateway. Reads from state file, enriches from disk.
 */
export async function getGateway(): Promise<Gateway> {
  const s = getGatewayState();
  const gw: Gateway = { ...s, live: undefined };

  // If not set up, clear any stale fields and return clean
  if (gw.status === "not_setup") {
    gw.profileDir = "";
    gw.profileName = "";
    gw.displayName = "";
    gw.token = null;
    gw.pid = null;
    gw.live = false;
    return gw;
  }

  // If the profile directory no longer exists on disk, fully reset to not_setup
  // Skip this check during deployment (status "setup") — config file hasn't been created yet
  if (gw.status !== "setup" && gw.profileDir && !existsSync(join(gw.profileDir, "openclaw.json"))) {
    updateGatewayState({
      status: "not_setup",
      profileDir: "",
      profileName: "",
      displayName: "",
      token: null,
      pid: null,
    });
    gw.status = "not_setup";
    gw.profileDir = "";
    gw.profileName = "";
    gw.displayName = "";
    gw.token = null;
    gw.pid = null;
    gw.live = false;
    return gw;
  }

  // Fill in missing token from config file on disk
  if (!gw.token && gw.profileDir) {
    const configPath = join(gw.profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const token = config?.gateway?.auth?.token || config?.gateway?.token || null;
        if (token) {
          gw.token = token;
          updateGatewayState({ token });
        }
      } catch {}
    }
  }

  // Fix stale display name
  if (gw.displayName === "Default" && gw.profileName && gw.profileName !== "clawboard") {
    gw.displayName = gw.profileName;
    updateGatewayState({ displayName: gw.profileName });
  }

  // Fix workspace config if it points outside the profile dir
  if (gw.profileDir) ensureGatewayConfig(gw.profileDir);

  // Clean up ghost ~/.openclaw/ dir (CLI creates it as side-effect)
  cleanupGhostDirs();

  // Enrich with live check
  gw.live = await checkGatewayAlive(gw.port);

  return gw;
}

export async function updateGateway(updates: Partial<Gateway>): Promise<Gateway> {
  // Strip the `live` field — it's ephemeral, not persisted
  const { live: _, ...persistable } = updates;
  const s = updateGatewayState(persistable);
  return stateToGateway(s);
}

export async function checkGatewayAlive(port?: number): Promise<boolean> {
  const p = port || 19100;
  try {
    const resp = await fetch(`http://127.0.0.1:${p}/`, {
      signal: AbortSignal.timeout(500),
    });
    return resp.status < 500;
  } catch {
    return false;
  }
}

/** Build an env object with provider API keys injected. */
async function buildGatewayEnv(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Read provider keys from auth-profiles.json (via provider-keys lib)
  try {
    const { listProviderKeysRaw } = await import("./provider-keys");
    const keys = await listProviderKeysRaw();
    for (const k of keys) {
      const envName = PROVIDER_ENV_MAP[k.provider];
      if (envName) env[envName] = k.apiKey;
    }
  } catch {}

  return env;
}

export async function startGateway(): Promise<Gateway> {
  const gw = await getGateway();

  if (gw.status === "not_setup") {
    throw new Error("Gateway is not set up. Run setup first.");
  }

  const alive = await checkGatewayAlive(gw.port);
  if (alive) return { ...gw, live: true };

  let ocPath: string;
  try {
    ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("openclaw CLI not found");
  }

  // Ensure anti-idle config is present
  ensureGatewayConfig(gw.profileDir);

  const pFlag = profileFlag(gw.profileName);
  const pArgs = profileArgs(gw.profileName);

  // Build env with provider API keys
  const gwEnv = await buildGatewayEnv();

  // Install gateway service
  try {
    execSync(`${ocPath} ${pFlag} gateway install`.replace(/\s+/g, " ").trim(), {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      env: gwEnv,
    });
  } catch {}

  // Inject provider API keys into the launchd plist
  injectPlistEnvVars(gw.profileName, gwEnv);

  // Doctor --fix
  try {
    execSync(`${ocPath} ${pFlag} doctor --fix`.replace(/\s+/g, " ").trim(), {
      encoding: "utf-8",
      timeout: 15000,
      stdio: "pipe",
      env: gwEnv,
    });
  } catch {}

  // Start gateway
  try {
    execSync(`${ocPath} ${pFlag} gateway start`.replace(/\s+/g, " ").trim(), {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      env: gwEnv,
    });
  } catch {
    // Fall back to running in foreground detached
    const child = spawn(ocPath, [...pArgs, "gateway", "run", "--port", String(gw.port)], {
      detached: true,
      stdio: "ignore",
      env: gwEnv,
    });
    child.unref();
    await updateGateway({ pid: child.pid || null });
  }

  // Wait for gateway to be ready (poll quickly — localhost is fast)
  let live = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 750));
    live = await checkGatewayAlive(gw.port);
    if (live) break;
  }

  if (live) {
    await updateGateway({ status: "running" });
  }

  // Clean up ghost ~/.openclaw/ dir that CLI commands create as a side-effect
  cleanupGhostDirs();

  return { ...gw, live };
}

export async function stopGateway(): Promise<Gateway> {
  const gw = await getGateway();

  const pFlag = profileFlag(gw.profileName);

  try {
    const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
    execSync(`${ocPath} ${pFlag} gateway stop`.replace(/\s+/g, " ").trim(), {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
  } catch {}

  if (gw.pid) {
    safeKill(gw.pid);
  }
  safeKillPort(gw.port);

  await updateGateway({ pid: null, status: "stopped" });
  return { ...gw, live: false };
}

/**
 * Disconnect the gateway: stop it, reset to not_setup.
 */
export async function disconnectGateway(options?: { deleteFiles?: boolean }): Promise<void> {
  const gw = await getGateway();

  // Stop gateway if running
  if (gw.status !== "not_setup") {
    try {
      await stopGateway();
    } catch {}
  }

  // Force-kill any remaining processes on the port
  if (gw.port) {
    safeKillPort(gw.port, "KILL");
  }
  if (gw.pid) {
    safeKill(gw.pid, "SIGKILL");
  }

  // CRITICAL: If deleting files, nuke the launchd service first so macOS
  // doesn't respawn the gateway and recreate the directory.
  if (options?.deleteFiles && gw.profileName) {
    nukelaunchdService(gw.profileName);
  }

  // Optionally delete profile directory — retry to handle launchd respawn race
  if (options?.deleteFiles && gw.profileDir) {
    await deleteDirectoryWithRetry(gw.profileDir);
  }

  // Reset gateway AFTER deletion so if deletion fails, user can retry
  updateGatewayState({
    port: 19100,
    token: null,
    profileDir: "",
    profileName: "",
    pid: null,
    status: "not_setup",
    setupAt: null,
    deployId: null,
    displayName: "",
  });
}

/**
 * Delete a directory with retry — handles the launchd respawn race condition.
 * After nuking the launchd service, macOS may still briefly respawn the process
 * which recreates the directory. We delete, wait, check, and retry if needed.
 */
async function deleteDirectoryWithRetry(dir: string, maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (!existsSync(dir)) return; // Already gone

    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}

    // Wait briefly for any launchd respawn to settle
    await new Promise((r) => setTimeout(r, 500));

    if (!existsSync(dir)) return; // Confirmed gone

    // Directory reappeared — kill any process that recreated it and retry
    try {
      const pids = execSync(
        `lsof +D ${JSON.stringify(dir)} 2>/dev/null | awk 'NR>1{print $2}' | sort -u`,
        { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      if (pids) {
        for (const p of pids.split("\n")) {
          safeKill(Number(p), "SIGKILL");
        }
      }
    } catch {}
  }

  // Final attempt
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Profile Detection & Switching ───────────────────────────────────

export interface DetectedProfile {
  name: string;
  dir: string;
  port: number | null;
  hasToken: boolean;
  agentCount: number;
  isRunning: boolean;
  isActive: boolean;
}

/**
 * Scan the home directory for OpenClaw profiles.
 * Returns all ~/.openclaw-* named profile directories that contain openclaw.json.
 */
export async function detectProfiles(): Promise<DetectedProfile[]> {
  // Use state directly — avoid getGateway() which does a health check
  const gwState = getGatewayState();
  const activeDir = gwState.profileDir || "";

  let entries: string[];
  try {
    entries = readdirSync(HOME);
  } catch {
    return [];
  }

  // Only detect named profiles (.openclaw-*), never the bare .openclaw default
  const candidates = entries.filter(
    (e) => e.startsWith(".openclaw-")
  );

  // Collect profile metadata from disk (no network calls)
  const profileData: Array<{
    name: string;
    dir: string;
    port: number | null;
    hasToken: boolean;
    agentCount: number;
  }> = [];

  for (const entry of candidates) {
    const dir = join(HOME, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const configPath = join(dir, "openclaw.json");
      if (!existsSync(configPath)) continue;

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const port = config?.gateway?.port ?? config?.gateway?.bind?.port ?? null;
      const hasToken = !!(config?.gateway?.auth?.token);
      const agentCount = (config?.agents?.list || []).length;
      const name = entry.replace(/^\.openclaw-/, "");

      profileData.push({ name, dir, port, hasToken, agentCount });
    } catch {
      // Malformed config or permission error — skip
    }
  }

  // Health-check all profiles in parallel (not sequential)
  const healthResults = await Promise.all(
    profileData.map((p) => (p.port ? checkGatewayAlive(p.port) : Promise.resolve(false)))
  );

  const profiles: DetectedProfile[] = profileData.map((p, i) => ({
    ...p,
    isRunning: healthResults[i],
    isActive: p.dir === activeDir,
  }));

  // Sort: active first, then running, then alphabetical
  profiles.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return profiles;
}

/**
 * Switch the active gateway to a different profile directory.
 * Just updates the gateway singleton pointer — agents are read from filesystem automatically.
 */
export async function switchProfile(profileDir: string): Promise<Gateway> {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) {
    throw new Error(`No openclaw.json found at ${profileDir}`);
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const dirName = basename(profileDir);
  if (dirName === ".openclaw") {
    throw new Error("Cannot switch to the default profile. Only named profiles are supported.");
  }
  const profileName = dirName.replace(/^\.openclaw-/, "");
  const port = config?.gateway?.port ?? config?.gateway?.bind?.port ?? 19100;
  const token = config?.gateway?.auth?.token ?? config?.gateway?.token ?? null;

  // Stop current gateway if running on a different profile
  const currentState = getGatewayState();
  if (currentState.status !== "not_setup" && currentState.profileDir !== profileDir) {
    try { await stopGateway(); } catch {}
  }

  // Enable HTTP endpoints if needed
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.http?.endpoints?.chatCompletions?.enabled) {
    config.gateway.http = {
      ...config.gateway.http,
      endpoints: {
        chatCompletions: { enabled: true },
        responses: { enabled: true },
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // Apply anti-idle settings
  ensureGatewayConfig(profileDir);

  // Update gateway singleton to point at new profile
  await updateGateway({
    profileDir,
    profileName,
    displayName: profileName,
    port,
    token,
    status: "stopped",
    setupAt: new Date().toISOString(),
    deployId: null,
    pid: null,
  });

  // Check if already running, start if not
  let live = await checkGatewayAlive(port);
  if (!live) {
    try {
      const started = await startGateway();
      live = started.live ?? false;
    } catch {}
  } else {
    await updateGateway({ status: "running" });
  }

  // Clean up ghost ~/.openclaw/ dir that CLI commands create as a side-effect
  cleanupGhostDirs();

  // Return directly — avoid another getGateway() health check round-trip
  const finalState = getGatewayState();
  return { ...finalState, live } as Gateway;
}

/**
 * Delete a profile from disk. If it's the active profile, switch to another
 * available profile or disconnect cleanly.
 */
export async function deleteProfile(profileDir: string): Promise<void> {
  const gw = await getGateway().catch(() => null);
  const isActive = gw && gw.profileDir === profileDir;

  // Derive profile name from the directory path — works even if openclaw.json is missing
  const dirName = basename(profileDir);
  const profileName = dirName.startsWith(".openclaw-")
    ? dirName.replace(/^\.openclaw-/, "")
    : "";

  // Kill gateway processes on the profile's port
  try {
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const port = config?.gateway?.port ?? config?.gateway?.bind?.port;
      if (port) safeKillPort(port, "KILL");
    }
  } catch {}

  // CRITICAL: Unload and delete the launchd plist BEFORE deleting files.
  // If we don't, macOS will keep restarting the service and recreating the directory.
  nukelaunchdService(profileName);

  // Delete the directory with retry to handle launchd respawn race
  await deleteDirectoryWithRetry(profileDir);

  // If this was the active profile, try to switch to another one
  if (isActive) {
    const remaining = await detectProfiles();
    if (remaining.length > 0) {
      await switchProfile(remaining[0].dir);
    } else {
      await disconnectGateway();
    }
  }
}

/**
 * Inject provider API keys into the launchd plist for the gateway.
 */
function injectPlistEnvVars(profileName: string, env: NodeJS.ProcessEnv) {
  const plistPath = join(HOME, "Library", "LaunchAgents", `ai.openclaw.${profileName}.plist`);
  if (!existsSync(plistPath)) return;

  const keysToInject: Record<string, string> = {};
  if (env.ANTHROPIC_API_KEY) keysToInject["ANTHROPIC_API_KEY"] = env.ANTHROPIC_API_KEY;
  if (env.OPENAI_API_KEY) keysToInject["OPENAI_API_KEY"] = env.OPENAI_API_KEY;
  if (Object.keys(keysToInject).length === 0) return;

  try {
    let plist = readFileSync(plistPath, "utf-8");
    for (const [key, value] of Object.entries(keysToInject)) {
      if (plist.includes(`<key>${key}</key>`)) continue;
      const envDictEnd = plist.lastIndexOf("</dict>", plist.lastIndexOf("</dict>") - 1);
      if (envDictEnd !== -1) {
        const insertion = `    <key>${key}</key>\n    <string>${value}</string>\n`;
        plist = plist.slice(0, envDictEnd) + insertion + plist.slice(envDictEnd);
      }
    }
    writeFileSync(plistPath, plist);
  } catch {}
}

/**
 * Ensure the openclaw.json config has heartbeat and session settings
 * to prevent idle gateway disconnection.
 */
export function ensureGatewayConfig(profileDir: string) {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    let dirty = false;

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.heartbeat || !config.agents.defaults.heartbeat.every) {
      config.agents.defaults.heartbeat = { ...config.agents.defaults.heartbeat, every: "5m" };
      dirty = true;
    }

    if (!config.session) config.session = {};
    if (!config.session.reset || config.session.reset.idleMinutes === undefined) {
      config.session.reset = { ...config.session.reset, idleMinutes: 1440 };
      dirty = true;
    }

    // Fix workspace path if it points outside the profile dir.
    // OpenClaw defaults workspace to ~/.openclaw/workspace-{name} which is a ghost dir.
    // Force it inside the profile directory.
    const currentWorkspace: string | undefined = config.agents?.defaults?.workspace;
    const correctWorkspace = join(profileDir, "workspace");
    if (!currentWorkspace || !currentWorkspace.startsWith(profileDir)) {
      config.agents.defaults.workspace = correctWorkspace;
      dirty = true;

      // Move files from the old workspace to the new one if they exist
      if (currentWorkspace && existsSync(currentWorkspace) && !existsSync(correctWorkspace)) {
        try {
          const { mkdirSync, renameSync } = require("node:fs");
          mkdirSync(join(profileDir), { recursive: true });
          renameSync(currentWorkspace, correctWorkspace);
        } catch {}
      }
    }

    if (dirty) writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {}
}

/**
 * Remove the ghost ~/.openclaw/ directory if it's not a real profile.
 * OpenClaw CLI creates this directory as a side-effect of many commands,
 * even when using --profile. It can contain stale workspace-* dirs,
 * logs, etc. Safe to remove if it has no openclaw.json (not a real profile).
 */
export function cleanupGhostDirs() {
  const ghostDir = join(HOME, ".openclaw");
  try {
    if (!existsSync(ghostDir)) return;
    // If it contains openclaw.json, it's a real default profile — don't touch it
    if (existsSync(join(ghostDir, "openclaw.json"))) return;
    rmSync(ghostDir, { recursive: true, force: true });
  } catch {}
}
