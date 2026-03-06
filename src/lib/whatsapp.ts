/**
 * WhatsApp integration helpers — config management, connection status,
 * agent bindings, and login session management.
 *
 * WhatsApp uses the Baileys library (WhatsApp Web protocol). The gateway
 * manages the WhatsApp socket and stores credentials at:
 *   {profileDir}/credentials/whatsapp/{accountId}/creds.json
 *
 * Login flow:
 *   1. Spawn `openclaw channels login --channel whatsapp --account default`
 *   2. CLI outputs a QR code (Unicode block characters) to stdout
 *   3. User scans QR with WhatsApp → Linked Devices → Link a Device
 *   4. Baileys authenticates and writes creds.json
 *   5. Gateway manages reconnection automatically from that point
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, watch, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

// ── openclaw.json config read/write (shared with discord.ts) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readConfig(profileDir: string): any | null {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeConfig(profileDir: string, config: any) {
  const configPath = join(profileDir, "openclaw.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ── WhatsApp channel config ──

export function getWhatsAppConfig(
  profileDir: string
): { enabled: boolean } | null {
  const config = readConfig(profileDir);
  if (!config?.channels?.whatsapp) return null;
  return { enabled: true };
}

/**
 * Enable WhatsApp channel + plugin in openclaw.json.
 * Returns true if the config was changed (gateway restart recommended).
 */
export function enableWhatsApp(profileDir: string): boolean {
  const config = readConfig(profileDir) || {};
  let changed = false;

  // Enable WhatsApp channel config
  if (!config.channels) config.channels = {};
  if (!config.channels.whatsapp) {
    config.channels.whatsapp = {};
    changed = true;
  }

  // Ensure required channel fields
  if (!config.channels.whatsapp.dmPolicy) {
    config.channels.whatsapp.dmPolicy = "open";
    changed = true;
  }
  // dmPolicy: "open" requires allowFrom: ["*"]
  if (
    config.channels.whatsapp.dmPolicy === "open" &&
    (!config.channels.whatsapp.allowFrom ||
      !config.channels.whatsapp.allowFrom.includes("*"))
  ) {
    config.channels.whatsapp.allowFrom = ["*"];
    changed = true;
  }
  if (config.channels.whatsapp.sendReadReceipts === undefined) {
    config.channels.whatsapp.sendReadReceipts = true;
    changed = true;
  }

  // Enable WhatsApp plugin (required for the CLI to recognize the channel)
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  if (!config.plugins.entries.whatsapp?.enabled) {
    config.plugins.entries.whatsapp = {
      ...config.plugins.entries.whatsapp,
      enabled: true,
    };
    changed = true;
  }

  if (changed) {
    writeConfig(profileDir, config);
  }

  return changed;
}

/** Remove WhatsApp channel config, plugin, and all WhatsApp bindings. */
export function disableWhatsApp(profileDir: string) {
  const config = readConfig(profileDir);
  if (!config) return;

  if (config.channels?.whatsapp) {
    delete config.channels.whatsapp;
    if (Object.keys(config.channels).length === 0) delete config.channels;
  }

  // Disable plugin
  if (config.plugins?.entries?.whatsapp) {
    config.plugins.entries.whatsapp.enabled = false;
  }

  // Remove all whatsapp bindings
  if (config.bindings) {
    config.bindings = config.bindings.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.match?.channel !== "whatsapp"
    );
    if (config.bindings.length === 0) delete config.bindings;
  }

  writeConfig(profileDir, config);
}

// ── Connection status ──

/** Check if WhatsApp credentials exist on disk (= linked phone). */
export function isWhatsAppConnected(profileDir: string): boolean {
  const credsDir = join(profileDir, "credentials", "whatsapp");
  if (!existsSync(credsDir)) return false;

  try {
    const accounts = readdirSync(credsDir);
    for (const account of accounts) {
      const credsFile = join(credsDir, account, "creds.json");
      if (existsSync(credsFile)) return true;
    }
  } catch {}

  return false;
}

// ── Agent bindings ──

export interface AgentWhatsAppBinding {
  accountId: string;
}

/** Read an agent's WhatsApp binding from openclaw.json. */
export function getAgentWhatsAppBinding(
  profileDir: string,
  agentId: string
): AgentWhatsAppBinding | null {
  const config = readConfig(profileDir);
  if (!config?.bindings) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binding = config.bindings.find((b: any) =>
    b.agentId === agentId && b.match?.channel === "whatsapp"
  );
  if (!binding) return null;

  return { accountId: binding.match?.accountId || "default" };
}

/** Save/upsert an agent's WhatsApp binding. Routes all WhatsApp DMs to this agent. */
export function saveAgentWhatsAppBinding(
  profileDir: string,
  agentId: string
) {
  const config = readConfig(profileDir) || {};
  if (!config.bindings) config.bindings = [];

  // Remove existing whatsapp binding for this agent
  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "whatsapp")
  );

  config.bindings.push({
    agentId,
    match: {
      channel: "whatsapp",
      accountId: "default",
    },
  });

  writeConfig(profileDir, config);
}

/** Remove an agent's WhatsApp binding. */
export function removeAgentWhatsAppBinding(
  profileDir: string,
  agentId: string
) {
  const config = readConfig(profileDir);
  if (!config?.bindings) return;

  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "whatsapp")
  );
  if (config.bindings.length === 0) delete config.bindings;

  writeConfig(profileDir, config);
}

// ── Login session management ──

export interface LoginSession {
  id: string;
  process: ChildProcess;
  output: string;
  qrBlock: string;
  status: "starting" | "qr_ready" | "connected" | "error";
  error?: string;
  createdAt: number;
}

const loginSessions = new Map<string, LoginSession>();

/** Strip ANSI escape codes from terminal output. */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[\??[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\(B/g, "")
    .replace(/\r/g, "");
}

/** Extract QR code block from terminal output (Unicode block characters). */
function extractQR(text: string): string {
  const lines = text.split("\n");
  const qrLines: string[] = [];
  let inQR = false;

  for (const line of lines) {
    // QR lines contain Unicode block characters (█ ▀ ▄ ▌ ▐ ░ ▒ ▓)
    const hasBlocks = /[█▀▄▌▐░▒▓]/.test(line) && line.trim().length > 10;

    if (hasBlocks) {
      inQR = true;
      qrLines.push(line);
    } else if (inQR) {
      // End of QR block
      break;
    }
  }

  // A QR code is typically 20+ lines of block characters
  if (qrLines.length >= 10) {
    return qrLines.join("\n");
  }
  return "";
}

/**
 * Start a WhatsApp login session by spawning the openclaw CLI.
 * Returns a session ID for polling status/QR updates.
 */
export function startLoginSession(profileDir: string): string {
  const sessionId = randomUUID();

  // Clean up old sessions (>5 minutes)
  for (const [id, session] of loginSessions) {
    if (Date.now() - session.createdAt > 5 * 60 * 1000) {
      try { session.process.kill(); } catch {}
      loginSessions.delete(id);
    }
  }

  // Resolve profile name from directory path (e.g. ~/.openclaw-RiotIQ → RiotIQ)
  const profileName = basename(profileDir).replace(/^\.openclaw-/, "");

  // Resolve openclaw binary path
  let ocPath = "openclaw";
  try {
    ocPath = execSync("which openclaw", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {}

  // Spawn login command directly with --profile flag
  const proc = spawn(ocPath, [
    "--profile", profileName,
    "channels", "login",
    "--channel", "whatsapp",
    "--account", "default",
  ], {
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const session: LoginSession = {
    id: sessionId,
    process: proc,
    output: "",
    qrBlock: "",
    status: "starting",
    createdAt: Date.now(),
  };

  loginSessions.set(sessionId, session);

  proc.stdout?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    session.output += text;

    // Look for the most recent QR block in accumulated output
    const qr = extractQR(session.output);
    if (qr && qr !== session.qrBlock) {
      session.qrBlock = qr;
      session.status = "qr_ready";
    }

    // Check for success messages
    const lower = session.output.toLowerCase();
    if (
      lower.includes("successfully") ||
      lower.includes("authenticated") ||
      lower.includes("logged in") ||
      lower.includes("connected to whatsapp")
    ) {
      session.status = "connected";
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    session.output += text;

    // stderr may also contain the QR (some CLI output goes to stderr)
    const qr = extractQR(session.output);
    if (qr && qr !== session.qrBlock) {
      session.qrBlock = qr;
      session.status = "qr_ready";
    }
  });

  proc.on("close", (code) => {
    if (code === 0 && session.status !== "error") {
      session.status = "connected";
    } else if (session.status !== "connected" && session.status !== "qr_ready") {
      session.status = "error";
      // Extract a useful error from the output
      const output = session.output.toLowerCase();
      if (output.includes("unsupported channel")) {
        session.error = "WhatsApp plugin not loaded. Try restarting the gateway.";
      } else if (output.includes("not found") || output.includes("enoent")) {
        session.error = "OpenClaw CLI not found. Make sure it's installed.";
      } else {
        session.error = "Login process exited unexpectedly";
      }
    }
  });

  // Watch the credentials directory for creds.json creation (most reliable signal)
  const credsDir = join(profileDir, "credentials", "whatsapp");
  // Ensure the parent dir exists so we can watch it
  try { mkdirSync(credsDir, { recursive: true }); } catch {}
  try {
    const watcher = watch(credsDir, { recursive: true }, (_event, filename) => {
      if (filename && filename.toString().endsWith("creds.json")) {
        session.status = "connected";
        try { watcher.close(); } catch {}
      }
    });
    // Close watcher when session expires
    setTimeout(() => { try { watcher.close(); } catch {} }, 5 * 60 * 1000);
  } catch {
    // Watch failed — rely on process output detection
  }

  // Auto-cleanup after 5 minutes
  setTimeout(() => {
    if (loginSessions.has(sessionId)) {
      try { proc.kill(); } catch {}
      loginSessions.delete(sessionId);
    }
  }, 5 * 60 * 1000);

  return sessionId;
}

/** Get the current state of a login session. */
export function getLoginSession(sessionId: string): LoginSession | null {
  return loginSessions.get(sessionId) || null;
}

/** Stop and clean up a login session. */
export function stopLoginSession(sessionId: string) {
  const session = loginSessions.get(sessionId);
  if (session) {
    try { session.process.kill(); } catch {}
    loginSessions.delete(sessionId);
  }
}
