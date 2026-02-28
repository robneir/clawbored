/**
 * PTY WebSocket server for deploy terminal.
 * Runs openclaw commands directly (deterministic) and streams output to xterm.js.
 */

import { WebSocketServer, WebSocket } from "ws";
import { spawn, execSync, ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getAuthConfig, getApiKey, isSubscriptionAuth } from "./auth";
import { getNextPort, registerInstance } from "./instances";

const PORT = 3001;
const sessions = new Map<string, { aborted: boolean; ws: WebSocket }>();

export function startPtyServer() {
  const wss = new WebSocketServer({ port: PORT });
  console.log(`⚡ PTY server running on ws://localhost:${PORT}`);

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "deploy") handleDeploy(ws, msg);
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
      }
    });

    ws.on("close", () => {
      for (const [id, session] of sessions) {
        if (session.ws === ws) {
          session.aborted = true;
          sessions.delete(id);
        }
      }
    });
  });

  return wss;
}

function sendData(ws: WebSocket, sessionId: string, text: string) {
  if (ws.readyState === WebSocket.OPEN) {
    // Convert newlines to \r\n for xterm.js
    const formatted = text.replace(/\n/g, "\r\n");
    ws.send(JSON.stringify({ type: "data", sessionId, data: formatted }));
  }
}

function sendLine(ws: WebSocket, sessionId: string, text: string) {
  sendData(ws, sessionId, text + "\n");
}

/**
 * Run a command and stream its output to the WebSocket terminal.
 */
function runCmd(ws: WebSocket, sessionId: string, cmd: string, session: { aborted: boolean }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    if (session.aborted) {
      resolve({ code: -1, stdout: "", stderr: "aborted" });
      return;
    }

    sendLine(ws, sessionId, `\x1b[90m$ ${cmd}\x1b[0m`);

    const child = spawn("bash", ["-c", cmd], {
      cwd: homedir(),
      env: {
        ...process.env,
        PATH: [
          process.env.PATH || "",
          join(homedir(), ".local/bin"),
          join(homedir(), ".nvm/versions/node/v24.14.0/bin"),
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
        ].join(":"),
        HOME: homedir(),
        TERM: "xterm-256color",
        FORCE_COLOR: "3",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      sendData(ws, sessionId, text);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      sendData(ws, sessionId, text);
    });

    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ code: -1, stdout, stderr: err.message });
    });
  });
}

/**
 * Clean up any LaunchAgent and processes left by a failed deploy.
 */
function cleanupFailedDeploy(name: string, port: number) {
  const HOME = homedir();
  const plistPatterns = [
    `ai.openclaw.gateway-${name}.plist`,
    `ai.openclaw.${name}.plist`,
    `com.openclaw.gateway-${name}.plist`,
  ];
  for (const plistName of plistPatterns) {
    const plistPath = join(HOME, "Library", "LaunchAgents", plistName);
    try {
      execSync(`launchctl bootout gui/$(id -u) "${plistPath}" 2>/dev/null`, { stdio: "pipe" });
    } catch {}
    try {
      if (existsSync(plistPath)) {
        const { unlinkSync } = require("node:fs");
        unlinkSync(plistPath);
      }
    } catch {}
  }
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
  } catch {}
}

async function handleDeploy(ws: WebSocket, msg: { name: string; displayName?: string; template?: string }) {
  const { name, displayName, template } = msg;
  const port = getNextPort();
  const profileDir = join(homedir(), `.openclaw-${name}`);
  const sessionId = Math.random().toString(36).slice(2, 10);
  const session = { aborted: false, ws };
  sessions.set(sessionId, session);

  ws.send(JSON.stringify({ type: "started", sessionId, name, port }));

  let success = false;
  let token: string | null = null;

  try {
    // Header
    sendLine(ws, sessionId, "\x1b[1;36m╔══════════════════════════════════════════╗\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;36m║   Mission Control — Deploying Agent      ║\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m");
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, `\x1b[1mInstance:\x1b[0m ${name}`);
    sendLine(ws, sessionId, `\x1b[1mPort:\x1b[0m     ${port}`);
    sendLine(ws, sessionId, `\x1b[1mTemplate:\x1b[0m ${template || "general"}`);
    sendLine(ws, sessionId, "");

    // Step 1: Check openclaw
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 1/7: Checking OpenClaw installation\x1b[0m");
    let result = await runCmd(ws, sessionId, "which openclaw && openclaw --version", session);
    if (result.code !== 0) {
      sendLine(ws, sessionId, "\x1b[33mInstalling OpenClaw...\x1b[0m");
      result = await runCmd(ws, sessionId, "npm install -g openclaw@latest", session);
      if (result.code !== 0) throw new Error("Failed to install OpenClaw");
    }
    sendLine(ws, sessionId, "");

    // Step 2: Onboard
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 2/7: Creating instance profile\x1b[0m");
    result = await runCmd(ws, sessionId,
      `openclaw --profile ${name} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${port} --gateway-bind loopback --gateway-auth token --auth-choice skip --install-daemon --skip-channels --skip-skills --skip-ui --skip-health`,
      session
    );
    if (result.code !== 0) throw new Error("Onboard failed");
    sendLine(ws, sessionId, "");

    // Step 3: Configure
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 3/7: Configuring gateway\x1b[0m");
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (!config.gateway) config.gateway = {};
      config.gateway.http = {
        endpoints: {
          chatCompletions: { enabled: true },
          responses: { enabled: true },
        },
      };
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      config.agents.defaults.heartbeat = { every: "5m" };
      if (!config.session) config.session = {};
      config.session.reset = { idleMinutes: 1440 };
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      sendLine(ws, sessionId, "\x1b[32m✓ HTTP endpoints enabled + anti-idle configured\x1b[0m");
    }
    sendLine(ws, sessionId, "");

    // Step 4: Workspace + SOUL
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 4/7: Creating workspace\x1b[0m");
    mkdirSync(join(profileDir, "workspace"), { recursive: true });
    writeFileSync(
      join(profileDir, "workspace", "SOUL.md"),
      `# ${name}\nYou are a ${template || "general"} AI assistant deployed via Mission Control.\n`
    );
    sendLine(ws, sessionId, "\x1b[32m✓ Workspace created with SOUL.md\x1b[0m");
    sendLine(ws, sessionId, "");

    // Step 5: Install service
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 5/7: Installing gateway service\x1b[0m");
    await runCmd(ws, sessionId, `openclaw --profile ${name} gateway install`, session);
    sendLine(ws, sessionId, "");

    // Step 6: Doctor
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 6/7: Running doctor\x1b[0m");
    await runCmd(ws, sessionId, `openclaw --profile ${name} doctor --fix`, session);
    sendLine(ws, sessionId, "");

    // Step 7: Start + verify
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 7/7: Starting gateway\x1b[0m");
    result = await runCmd(ws, sessionId, `openclaw --profile ${name} gateway start`, session);
    sendLine(ws, sessionId, "\x1b[90mWaiting for gateway to come online...\x1b[0m");

    let alive = false;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
        if (resp.status < 500) { alive = true; break; }
      } catch {}
      sendData(ws, sessionId, ".");
    }
    sendLine(ws, sessionId, "");

    if (alive) {
      sendLine(ws, sessionId, `\x1b[1;32m✓ Gateway alive on port ${port}\x1b[0m`);
    } else {
      sendLine(ws, sessionId, `\x1b[33m⚠ Gateway may still be starting...\x1b[0m`);
    }

    // Read token
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      token = config?.gateway?.auth?.token || config?.gateway?.token || null;
    } catch {}

    // Register instance
    await registerInstance({
      name,
      displayName: displayName || name,
      port,
      token,
      template: template || "general",
      profileDir,
    });

    success = true;
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, "\x1b[1;32m╔══════════════════════════════════════════╗\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;32m║   ✅ Deployment Complete!                ║\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;32m╚══════════════════════════════════════════╝\x1b[0m");

  } catch (err: any) {
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, `\x1b[1;31m✗ Deploy failed: ${err.message}\x1b[0m`);
    cleanupFailedDeploy(name, port);
  }

  ws.send(JSON.stringify({
    type: "done",
    sessionId,
    exitCode: success ? 0 : 1,
    success,
    name,
    port,
    token,
  }));
  sessions.delete(sessionId);
}

// Auto-start
startPtyServer();
