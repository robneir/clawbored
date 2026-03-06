/**
 * Gateway deployment — one-time setup flow for creating an OpenClaw instance.
 *
 * Deploy steps (runDeployDirect):
 *   1. Verify/install openclaw CLI
 *   2. Run `openclaw onboard` with non-interactive flags
 *   3. Configure openclaw.json (HTTP endpoints, anti-idle settings, workspace path)
 *   3b. Write auth credentials to auth-profiles.json (pending keys + pre-resolved key)
 *   4. Install gateway launchd service + inject API keys into plist
 *   5. Run `openclaw doctor --fix`
 *   6. Start gateway + verify it's alive
 *   7. Create default "main" agent
 *
 * All state is in-memory (Map<string, Deployment>) — survives for the process
 * lifetime but is lost on restart. This is acceptable for a one-time setup flow.
 * SSE listeners provide real-time progress updates to the deploy animation UI.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getGateway, updateGateway, safeKillPort, profileFlag, stopGateway, cleanupGhostDirs, ensureGatewayConfig } from "./gateway";
import { createAgent } from "./agents";
import { getApiKey, isSubscriptionAuth } from "./auth";
import { getKeyForProvider, readAuthProfiles, writeAuthProfiles, PROVIDER_MAP } from "./provider-keys";
import { PROVIDER_ENV_MAP } from "./providers";
import { getPendingKeys, clearPendingKeys, getPendingOAuthTokens, clearPendingOAuthTokens } from "./mc-state";
import crypto from "node:crypto";

const HOME = homedir();

export interface LogEntry {
  ts: number;
  message: string;
}

export interface Deployment {
  id: string;
  name: string;
  displayName: string;
  template: string;
  port: number;
  profileDir: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
  error: string | null;
  result: Record<string, unknown> | null;
}

// ── In-memory state ─────────────────────────────────────────────────

/** In-memory deployment records */
const deployments = new Map<string, Deployment>();

/** In-memory SSE listeners (ephemeral pub/sub) */
const sseListeners = new Map<string, Array<(entry: LogEntry) => void>>();

/** In-memory log buffer */
const logBuffers = new Map<string, LogEntry[]>();

// ── Public API ──────────────────────────────────────────────────────

export function getDeployment(id: string): Deployment | null {
  return deployments.get(id) || null;
}

export function getDeploymentLogs(id: string): LogEntry[] {
  return logBuffers.get(id) || [];
}

/** Replay logs from in-memory buffer, then register for live updates */
export function addSSEListener(
  deployId: string,
  callback: (entry: LogEntry) => void
): () => void {
  if (!sseListeners.has(deployId)) sseListeners.set(deployId, []);
  sseListeners.get(deployId)!.push(callback);

  const buffered = logBuffers.get(deployId) || [];
  for (const entry of buffered) {
    callback(entry);
  }

  return () => {
    const arr = sseListeners.get(deployId) || [];
    sseListeners.set(deployId, arr.filter((r) => r !== callback));
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function addLog(deployId: string, message: string) {
  const entry: LogEntry = { ts: Date.now(), message };

  if (!logBuffers.has(deployId)) logBuffers.set(deployId, []);
  logBuffers.get(deployId)!.push(entry);

  const listeners = sseListeners.get(deployId) || [];
  for (const listener of listeners) {
    try { listener(entry); } catch {}
  }
}

function updateDeployStatus(
  id: string,
  status: "running" | "complete" | "failed",
  extra?: { error?: string; result?: Record<string, unknown> }
) {
  const deploy = deployments.get(id);
  if (deploy) {
    deploy.status = status;
    if (extra?.error !== undefined) deploy.error = extra.error;
    if (extra?.result !== undefined) deploy.result = extra.result;
  }

  // Cleanup buffers 30s after terminal state
  if (status === "complete" || status === "failed") {
    setTimeout(() => {
      logBuffers.delete(id);
      sseListeners.delete(id);
      deployments.delete(id);
    }, 60000);
  }
}

// ── Gateway Setup ───────────────────────────────────────────────────

/**
 * One-time gateway setup. Sets up OpenClaw with the specified profile,
 * configures the gateway, and creates a default "main" agent.
 */
export async function setupGateway(options?: {
  profileName?: string;
  port?: number;
}): Promise<{ deployId: string }> {
  let gwProfileName = options?.profileName || "clawboard";
  // Never allow "default" — that creates ~/.openclaw which is a ghost directory trap
  if (gwProfileName === "default") gwProfileName = "clawboard";
  const gwPort = options?.port || 19100;
  const profileDir = join(HOME, `.openclaw-${gwProfileName}`);

  // Resolve provider keys from ALL sources BEFORE switching the gateway pointer.
  // Once we update the gateway singleton to point at the new (empty) profile dir,
  // getKeyForProvider() will read the new profile and find nothing.
  // Keys are optional — the gateway can start without them (--auth-choice skip).
  const apiKey = await getApiKey();
  const providerKey = await getKeyForProvider("anthropic");
  const envKey = process.env.ANTHROPIC_API_KEY || null;
  const resolvedKey = apiKey || providerKey || envKey;

  // Also capture OpenAI key if available
  const openaiKey = await getKeyForProvider("openai") || process.env.OPENAI_API_KEY || null;

  const gw = await getGateway();

  // If a gateway is already running, stop it before setting up the new one
  if (gw.status !== "not_setup" && gw.status !== "error") {
    try { await stopGateway(); } catch {}
    if (gw.port && gw.port !== gwPort) {
      safeKillPort(gw.port);
    }
  }

  const deployId = crypto.randomBytes(8).toString("hex");

  // Create in-memory deployment record
  deployments.set(deployId, {
    id: deployId,
    name: gwProfileName,
    displayName: "Clawboard Gateway",
    template: "gateway",
    port: gwPort,
    profileDir,
    status: "running",
    startedAt: new Date().toISOString(),
    error: null,
    result: null,
  });

  // Update gateway singleton
  await updateGateway({
    profileDir,
    profileName: gwProfileName,
    displayName: gwProfileName,
    port: gwPort,
    status: "setup",
    deployId,
  });

  // Run deploy in background with global timeout
  const pName = gwProfileName;
  const pPort = gwPort;
  const pDir = profileDir;
  const pApiKey = resolvedKey;
  const pOpenaiKey = openaiKey;
  setTimeout(async () => {
    const timeout = setTimeout(() => {
      updateDeployStatus(deployId, "failed", { error: "Setup timed out after 3 minutes" });
      addLog(deployId, "Deploy failed: timed out after 3 minutes");
      updateGateway({ status: "error", deployId: null }).catch(() => {});
      cleanupFailedDeploy(pPort);
    }, 180000);

    try {
      await runDeployDirect(deployId, pDir, pName, pPort, pApiKey, pOpenaiKey);
      clearTimeout(timeout);
    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      updateDeployStatus(deployId, "failed", { error: msg });
      addLog(deployId, `Deploy failed: ${msg}`);
      await updateGateway({ status: "error", deployId: null }).catch(() => {});
      cleanupFailedDeploy(pPort);
    }
  }, 0);

  return { deployId };
}

function cleanupFailedDeploy(port: number) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
  } catch {}
}

/**
 * Deterministic gateway deploy.
 */
async function runDeployDirect(
  deployId: string,
  profileDir: string,
  gwProfileName: string,
  gwPort: number,
  apiKey: string | null,
  openaiKey: string | null,
) {
  const pFlag = profileFlag(gwProfileName);

  // Mutable env — provider keys get injected after auth-profiles.json is written
  const runEnv: NodeJS.ProcessEnv = { ...process.env };

  const run = async (cmd: string, label?: string): Promise<string> => {
    if (label) addLog(deployId, label);
    addLog(deployId, `$ ${cmd}`);
    return new Promise((resolve, reject) => {
      const { exec: execAsync } = require("node:child_process");
      execAsync(cmd, {
        encoding: "utf-8",
        timeout: 120000,
        cwd: HOME,
        env: runEnv,
        maxBuffer: 1024 * 1024,
      }, (err: { stderr?: string; stdout?: string; message?: string } | null, stdout: string, stderr: string) => {
        if (err) {
          const msg = (stderr || stdout || err.message || "Command failed").toString().trim();
          addLog(deployId, `Error: ${msg.slice(0, 500)}`);
          reject(new Error(msg.slice(0, 200)));
          return;
        }
        const trimmed = (stdout || "").trim();
        if (trimmed) addLog(deployId, trimmed);
        resolve(trimmed || "(no output)");
      });
    });
  };

  // Step 1: Verify openclaw
  addLog(deployId, "Checking OpenClaw installation...");
  try {
    await run("which openclaw && openclaw --version");
  } catch {
    addLog(deployId, "Installing OpenClaw...");
    await run("npm install -g openclaw@latest");
  }

  // Step 2: Onboard (always skip auth — we write auth-profiles.json ourselves after)
  addLog(deployId, "Creating OpenClaw instance...");
  const onboardCmd = `openclaw ${pFlag} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${gwPort} --gateway-bind loopback --gateway-auth token --auth-choice skip --install-daemon --skip-channels --skip-skills --skip-ui --skip-health`.replace(/\s+/g, " ").trim();
  await run(onboardCmd);

  // Step 3: Configure
  addLog(deployId, "Configuring gateway...");
  const configPath = join(profileDir, "openclaw.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    // Enable HTTP endpoints
    if (!config.gateway) config.gateway = {};
    config.gateway.http = {
      endpoints: {
        chatCompletions: { enabled: true },
        responses: { enabled: true },
      },
    };

    // Anti-idle settings
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.heartbeat = { every: "5m" };
    if (!config.session) config.session = {};
    config.session.reset = { idleMinutes: 1440 };

    // Fix workspace path — openclaw onboard defaults to ~/.openclaw/workspace-{name}
    // which is OUTSIDE the profile dir (inside the ghost ~/.openclaw/ directory).
    // Redirect it to live inside the profile dir where it belongs.
    config.agents.defaults.workspace = join(profileDir, "workspace");

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    addLog(deployId, "Config updated with HTTP endpoints + anti-idle settings");

    // Nuke the ghost ~/.openclaw/ dir (and any stale workspace-* inside it)
    cleanupGhostDirs();
  }

  // Step 3b: Write agent auth credentials
  // Flush pending keys (saved during wizard before profile existed) + resolved key
  addLog(deployId, "Configuring agent authentication...");
  const authData = readAuthProfiles(profileDir);

  // Write pending API keys from state.json (saved during setup wizard)
  const pendingKeys = getPendingKeys();
  for (const pk of pendingKeys) {
    const mapping = PROVIDER_MAP[pk.provider];
    if (!mapping) continue;
    const profileId = `${mapping.prefix}default`;
    authData.profiles[profileId] = { type: "api_key", provider: mapping.provider, key: pk.apiKey };
    addLog(deployId, `Wrote pending ${pk.provider} key to auth-profiles`);
  }
  if (pendingKeys.length > 0) clearPendingKeys();

  // Write pending OAuth tokens from state.json (saved during setup wizard)
  const pendingOAuth = getPendingOAuthTokens();
  for (const pt of pendingOAuth) {
    const providerValue = pt.provider === "openai" ? "openai-codex" : pt.provider;
    const profileId = `${providerValue}:default`;
    authData.profiles[profileId] = {
      type: "oauth",
      provider: providerValue,
      access: pt.access,
      refresh: pt.refresh,
      expires: pt.expires,
      ...(pt.accountId ? { accountId: pt.accountId } : {}),
    };
    addLog(deployId, `Wrote pending ${pt.provider} OAuth token to auth-profiles`);
  }
  if (pendingOAuth.length > 0) clearPendingOAuthTokens();

  // Write the pre-resolved API key (captured BEFORE the gateway pointer switched).
  // apiKey was resolved from the old profile/env before the gateway state was
  // updated to point at this new empty profile dir.
  const hasAnthropicKey = Object.entries(authData.profiles).some(([k]) => k.startsWith("anthropic:"));
  if (!hasAnthropicKey && apiKey) {
    authData.profiles["anthropic:default"] = { type: "api_key", provider: "anthropic", key: apiKey };
    addLog(deployId, "Wrote Anthropic key to auth-profiles");
  }

  const hasOpenaiKey = Object.entries(authData.profiles).some(([k]) => k.startsWith("openai"));
  if (!hasOpenaiKey && openaiKey) {
    const mapping = PROVIDER_MAP["openai"];
    authData.profiles[`${mapping?.prefix ?? "openai-codex:"}default`] = { type: "api_key", provider: mapping?.provider ?? "openai-codex", key: openaiKey };
    addLog(deployId, "Wrote OpenAI key to auth-profiles");
  }

  if (Object.keys(authData.profiles).length > 0) {
    writeAuthProfiles(profileDir, authData);
    addLog(deployId, "Agent auth configured");
  } else {
    addLog(deployId, "Warning: No API keys found — chat will require manual auth setup");
  }

  // Inject provider API keys into the run environment so gateway commands
  // can forward them. Without this, the launchd plist won't have them and
  // the gateway daemon will fail to authenticate with model providers.
  for (const [, profile] of Object.entries(authData.profiles)) {
    const p = profile as { provider?: string; key?: string; token?: string; access?: string };
    const credential = p.key || p.token || p.access;
    if (!credential || !p.provider) continue;
    // Map auth-profiles provider value back to provider ID for env lookup
    const providerId = p.provider === "openai-codex" ? "openai" : p.provider;
    const envName = PROVIDER_ENV_MAP[providerId];
    if (envName) runEnv[envName] = credential;
  }

  // Step 4: Install service
  addLog(deployId, "Installing gateway service...");
  try {
    await run(`openclaw ${pFlag} gateway install`.replace(/\s+/g, " ").trim());
  } catch {
    addLog(deployId, "Gateway install skipped (may already exist)");
  }

  // Inject API keys into the launchd plist (gateway install creates it without them)
  const plistPath = join(HOME, "Library", "LaunchAgents", `ai.openclaw.${gwProfileName}.plist`);
  if (existsSync(plistPath)) {
    try {
      let plist = readFileSync(plistPath, "utf-8");
      const keysToInject: Record<string, string> = {};
      if (runEnv.ANTHROPIC_API_KEY) keysToInject["ANTHROPIC_API_KEY"] = runEnv.ANTHROPIC_API_KEY;
      if (runEnv.OPENAI_API_KEY) keysToInject["OPENAI_API_KEY"] = runEnv.OPENAI_API_KEY;
      for (const [key, value] of Object.entries(keysToInject)) {
        if (plist.includes(`<key>${key}</key>`)) continue;
        const envDictEnd = plist.lastIndexOf("</dict>", plist.lastIndexOf("</dict>") - 1);
        if (envDictEnd !== -1) {
          const insertion = `    <key>${key}</key>\n    <string>${value}</string>\n`;
          plist = plist.slice(0, envDictEnd) + insertion + plist.slice(envDictEnd);
        }
      }
      writeFileSync(plistPath, plist);
      if (Object.keys(keysToInject).length > 0) {
        addLog(deployId, `Injected ${Object.keys(keysToInject).join(", ")} into gateway service`);
      }
    } catch {}
  }

  // Step 6: Doctor
  try {
    await run(`openclaw ${pFlag} doctor --fix`.replace(/\s+/g, " ").trim());
  } catch {
    addLog(deployId, "Doctor completed with warnings");
  }

  // Step 7: Start
  addLog(deployId, "Starting gateway...");
  await run(`openclaw ${pFlag} gateway start`.replace(/\s+/g, " ").trim());

  // Step 8: Verify
  addLog(deployId, "Verifying...");
  await new Promise((r) => setTimeout(r, 3000));

  let alive = false;
  for (let i = 0; i < 5; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${gwPort}/`, { signal: AbortSignal.timeout(2000) });
      if (resp.status < 500) { alive = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!alive) {
    addLog(deployId, "Gateway not responding yet — may still be starting");
  } else {
    addLog(deployId, `Gateway alive on port ${gwPort}`);
  }

  // Read token from config
  let token: string | null = null;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    token = config?.gateway?.auth?.token || config?.gateway?.token || null;
  } catch {}

  // Update gateway singleton
  await updateGateway({
    status: alive ? "running" : "stopped",
    token,
    deployId: null,
    setupAt: new Date().toISOString(),
  });

  // Create default "main" agent
  addLog(deployId, "Creating default agent...");
  try {
    await createAgent({
      id: "main",
      displayName: "Main Agent",
      template: "general",
    });
    addLog(deployId, "Default agent created");
  } catch (err: unknown) {
    addLog(deployId, `Warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Final cleanup — gateway start and agent creation may have re-created ghost dirs
  cleanupGhostDirs();

  updateDeployStatus(deployId, "complete", { result: { port: gwPort, token } });
  addLog(deployId, "Gateway setup complete!");
}

