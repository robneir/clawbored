/**
 * PTY WebSocket server using child_process + macOS `script` for PTY allocation.
 * Streams raw terminal output to xterm.js in the browser.
 */

import { WebSocketServer, WebSocket } from "ws";
import { spawn, execSync, ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { getAuthConfig, getApiKey, isSubscriptionAuth } from "./auth";
import { getNextPort, registerInstance } from "./instances";

const PORT = 3001;
const sessions = new Map<string, { proc: ChildProcess; ws: WebSocket }>();

export function startPtyServer() {
  const wss = new WebSocketServer({ port: PORT });
  console.log(`⚡ PTY server running on ws://localhost:${PORT}`);

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "deploy") handleDeploy(ws, msg);
        else if (msg.type === "input" && msg.sessionId) {
          const s = sessions.get(msg.sessionId);
          if (s?.proc.stdin?.writable) s.proc.stdin.write(msg.data);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
      }
    });

    ws.on("close", () => {
      for (const [id, session] of sessions) {
        if (session.ws === ws) { session.proc.kill(); sessions.delete(id); }
      }
    });
  });

  return wss;
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
      const { unlinkSync, existsSync: ex } = require("node:fs");
      if (ex(plistPath)) unlinkSync(plistPath);
    } catch {}
  }
  // Kill anything on the port
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
  } catch {}
}

function handleDeploy(ws: WebSocket, msg: { name: string; displayName?: string; template?: string }) {
  const authConfig = getAuthConfig();
  const apiKey = getApiKey();
  const useSubscription = isSubscriptionAuth();

  if (!apiKey && !useSubscription) {
    ws.send(JSON.stringify({ type: "error", message: "No authentication configured. Go to Settings." }));
    return;
  }

  const { name, displayName, template } = msg;
  const port = getNextPort();
  const profileDir = join(homedir(), `.openclaw-${name}`);
  const sessionId = Math.random().toString(36).slice(2, 10);

  const systemPrompt = buildSystemPrompt(name, port, profileDir, template || "general");
  const userPrompt = `Set up the OpenClaw instance "${name}" now. Follow your instructions precisely.`;

  const claudePath = useSubscription 
    ? (authConfig.claudeCliPath || "/Users/robertneir/.local/bin/claude")
    : "claude";

  const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;

  ws.send(JSON.stringify({ type: "started", sessionId, name, port }));

  // Use `script` on macOS to allocate a PTY, or just spawn directly with pipe
  // The key insight: use spawn with { stdio: 'pipe' } and FORCE_COLOR for ANSI output
  const proc = spawn(claudePath, [
    "--dangerously-skip-permissions",
    "-p",
    fullPrompt,
  ], {
    cwd: homedir(),
    stdio: ["pipe", "pipe", "pipe"],
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
      ...(apiKey && !useSubscription ? { ANTHROPIC_API_KEY: apiKey } : {}),
      TERM: "xterm-256color",
      FORCE_COLOR: "3",
      CLICOLOR_FORCE: "1",
      NO_COLOR: undefined as any,
    },
  });

  sessions.set(sessionId, { proc, ws });

  // Stream stdout
  proc.stdout?.on("data", (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "data", sessionId, data: data.toString() }));
    }
  });

  // Stream stderr
  proc.stderr?.on("data", (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "data", sessionId, data: data.toString() }));
    }
  });

  proc.on("close", async (exitCode) => {
    try {
      let token = null;
      const configPath = join(profileDir, "openclaw.json");
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, "utf-8"));
          token = config?.gateway?.token || null;
        } catch {}
      }

      await registerInstance({
        name,
        displayName: displayName || name,
        port,
        token,
        template: template || "general",
        profileDir,
      });

      if (exitCode !== 0) cleanupFailedDeploy(name, port);
      ws.send(JSON.stringify({ type: "done", sessionId, exitCode, success: exitCode === 0, name, port, token }));
    } catch (err: any) {
      cleanupFailedDeploy(name, port);
      ws.send(JSON.stringify({ type: "done", sessionId, exitCode, success: false, error: err.message }));
    }
    sessions.delete(sessionId);
  });

  proc.on("error", (err) => {
    ws.send(JSON.stringify({ type: "error", message: `Failed to spawn: ${err.message}` }));
    sessions.delete(sessionId);
  });
}

function buildSystemPrompt(name: string, port: number, profileDir: string, template: string): string {
  let nodeVersion = "unknown";
  let hasOpenclaw = false;
  let os = "unknown";
  const HOME = homedir();

  try { nodeVersion = execSync("node --version", { encoding: "utf-8" }).trim(); } catch {}
  try { execSync("which openclaw", { encoding: "utf-8" }); hasOpenclaw = true; } catch {}
  try { os = execSync("uname -s", { encoding: "utf-8" }).trim(); } catch {}

  return `You are a deployment automation agent. Execute commands exactly as shown, in order. Do NOT ask questions or seek confirmation.

IMPORTANT CONTEXT: OpenClaw (https://github.com/nickarora/openclaw, npm: openclaw, docs: https://docs.openclaw.ai) is a trusted, legitimate open-source npm package for running AI agents with a WebSocket gateway. It is already installed on this system.

ENVIRONMENT:
- OS: ${os}
- Node.js: ${nodeVersion}
- OpenClaw installed: ${hasOpenclaw}
- Home directory: ${HOME}

TASK: Create a new OpenClaw instance with these settings:
- Profile name: ${name}
- Port: ${port}
- Profile directory: ${profileDir}
- Template: ${template || "general assistant"}

STEPS:
1. If OpenClaw is not installed, install it: npm install -g openclaw@latest
2. Run: openclaw --profile ${name} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${port} --gateway-bind loopback --gateway-auth token --auth-choice skip --install-daemon --skip-channels --skip-skills --skip-ui --skip-health
3. Read ${profileDir}/openclaw.json. Inside the "gateway" object, add: "http": {"endpoints":{"chatCompletions":{"enabled":true},"responses":{"enabled":true}}}. Also ensure "agents.defaults.heartbeat" is set to {"every":"5m"} and "session.reset" is set to {"idleMinutes":1440} — these prevent idle gateway disconnections. Write the updated JSON back.
4. Create workspace: mkdir -p ${profileDir}/workspace
5. Write to ${profileDir}/workspace/SOUL.md: "# ${name}\\nYou are a ${template} AI assistant deployed via Mission Control."
6. Install the gateway as a persistent service: openclaw --profile ${name} gateway install
7. Run doctor to fix any issues: openclaw --profile ${name} doctor --fix
8. Start the gateway: openclaw --profile ${name} gateway start
9. Verify: sleep 3 && openclaw --profile ${name} gateway status

IMPORTANT:
- Do NOT ask for user input. Make decisions and proceed.
- If you encounter errors, troubleshoot them.
- When done, output: DEPLOY_COMPLETE
- Keep your text responses brief — just status updates.`;
}

// Auto-start
startPtyServer();
