import { WebSocketServer } from "ws";
import { spawn, execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PORT = 3001;
const HOME = homedir();
const MC_STATE = join(HOME, ".mission-control");
const REGISTRY = join(MC_STATE, "instances.json");
const AUTH_FILE = join(MC_STATE, "auth.json");
const BASE_PORT = 19100;

function loadRegistry() {
  if (!existsSync(MC_STATE)) mkdirSync(MC_STATE, { recursive: true });
  if (!existsSync(REGISTRY)) writeFileSync(REGISTRY, "[]");
  return JSON.parse(readFileSync(REGISTRY, "utf-8"));
}
function saveRegistry(data) { writeFileSync(REGISTRY, JSON.stringify(data, null, 2)); }
function getNextPort() {
  const reg = loadRegistry();
  if (!reg.length) return BASE_PORT;
  return Math.max(...reg.map(i => i.port)) + 1;
}

const sessions = new Map();
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

function sendData(ws, sessionId, text) {
  if (ws.readyState === 1) {
    const formatted = text.replace(/\n/g, "\r\n");
    ws.send(JSON.stringify({ type: "data", sessionId, data: formatted }));
  }
}

function sendLine(ws, sessionId, text) {
  sendData(ws, sessionId, text + "\n");
}

/** Run a command, stream output to xterm.js terminal */
function runCmd(ws, sessionId, cmd, session) {
  return new Promise((resolve) => {
    if (session.aborted) return resolve({ code: -1, stdout: "", stderr: "aborted" });

    sendLine(ws, sessionId, `\x1b[90m$ ${cmd}\x1b[0m`);

    const child = spawn("bash", ["-c", cmd], {
      cwd: HOME,
      env: {
        ...process.env,
        PATH: [
          process.env.PATH || "",
          join(HOME, ".local/bin"),
          join(HOME, ".nvm/versions/node/v24.14.0/bin"),
          "/usr/local/bin", "/usr/bin", "/bin",
        ].join(":"),
        HOME,
        TERM: "xterm-256color",
        FORCE_COLOR: "3",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "", stderr = "";

    child.stdout?.on("data", (data) => {
      const t = data.toString(); stdout += t;
      sendData(ws, sessionId, t);
    });
    child.stderr?.on("data", (data) => {
      const t = data.toString(); stderr += t;
      sendData(ws, sessionId, t);
    });
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

function cleanupFailedDeploy(name, port) {
  for (const p of [`ai.openclaw.gateway-${name}.plist`, `ai.openclaw.${name}.plist`]) {
    const pth = join(HOME, "Library", "LaunchAgents", p);
    try { execSync(`launchctl bootout gui/$(id -u) "${pth}" 2>/dev/null`, { stdio: "pipe" }); } catch {}
    try { execSync(`rm -f "${pth}"`, { stdio: "pipe" }); } catch {}
  }
  try { execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" }); } catch {}
}

async function handleDeploy(ws, msg) {
  const { name, displayName, template } = msg;

  // Check duplicate
  const reg = loadRegistry();
  if (reg.find(i => i.name === name)) {
    ws.send(JSON.stringify({ type: "error", message: `Instance "${name}" already exists.` }));
    return;
  }

  const port = getNextPort();
  const profileDir = join(HOME, `.openclaw-${name}`);
  const sessionId = Math.random().toString(36).slice(2, 10);
  const session = { aborted: false, ws };
  sessions.set(sessionId, session);

  ws.send(JSON.stringify({ type: "started", sessionId, name, port }));

  let success = false;
  let token = null;

  try {
    sendLine(ws, sessionId, "\x1b[1;36m╔══════════════════════════════════════════╗\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;36m║   Mission Control — Deploying Agent      ║\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m");
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, `\x1b[1mInstance:\x1b[0m ${name}  \x1b[1mPort:\x1b[0m ${port}  \x1b[1mTemplate:\x1b[0m ${template || "general"}`);
    sendLine(ws, sessionId, "");

    // Step 1
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 1/7: Checking OpenClaw\x1b[0m");
    let r = await runCmd(ws, sessionId, "which openclaw && openclaw --version", session);
    if (r.code !== 0) {
      sendLine(ws, sessionId, "\x1b[33mInstalling...\x1b[0m");
      r = await runCmd(ws, sessionId, "npm install -g openclaw@latest", session);
      if (r.code !== 0) throw new Error("Failed to install OpenClaw");
    }
    sendLine(ws, sessionId, "");

    // Step 2
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 2/7: Creating profile\x1b[0m");
    r = await runCmd(ws, sessionId,
      `openclaw --profile ${name} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${port} --gateway-bind loopback --gateway-auth token --auth-choice skip --install-daemon --skip-channels --skip-skills --skip-ui --skip-health`,
      session);
    if (r.code !== 0) throw new Error("Onboard failed");
    sendLine(ws, sessionId, "");

    // Step 3
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 3/7: Configuring gateway\x1b[0m");
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (!config.gateway) config.gateway = {};
      config.gateway.http = { endpoints: { chatCompletions: { enabled: true }, responses: { enabled: true } } };
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      config.agents.defaults.heartbeat = { every: "5m" };
      if (!config.session) config.session = {};
      config.session.reset = { idleMinutes: 1440 };
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      sendLine(ws, sessionId, "\x1b[32m✓ HTTP endpoints + anti-idle configured\x1b[0m");
    }
    sendLine(ws, sessionId, "");

    // Step 4
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 4/7: Creating workspace\x1b[0m");
    mkdirSync(join(profileDir, "workspace"), { recursive: true });
    writeFileSync(join(profileDir, "workspace", "SOUL.md"),
      `# ${name}\nYou are a ${template || "general"} AI assistant deployed via Mission Control.\n`);
    sendLine(ws, sessionId, "\x1b[32m✓ Workspace + SOUL.md created\x1b[0m");
    sendLine(ws, sessionId, "");

    // Step 5
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 5/7: Installing service\x1b[0m");
    await runCmd(ws, sessionId, `openclaw --profile ${name} gateway install`, session);
    sendLine(ws, sessionId, "");

    // Step 6
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 6/7: Running doctor\x1b[0m");
    await runCmd(ws, sessionId, `openclaw --profile ${name} doctor --fix`, session);
    sendLine(ws, sessionId, "");

    // Step 7
    sendLine(ws, sessionId, "\x1b[1;33m▸ Step 7/7: Starting gateway\x1b[0m");
    await runCmd(ws, sessionId, `openclaw --profile ${name} gateway start`, session);
    sendLine(ws, sessionId, "\x1b[90mWaiting for gateway...\x1b[0m");

    let alive = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
        if (resp.status < 500) { alive = true; break; }
      } catch {}
      sendData(ws, sessionId, ".");
    }
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, alive
      ? `\x1b[1;32m✓ Gateway alive on port ${port}\x1b[0m`
      : `\x1b[33m⚠ Gateway may still be starting\x1b[0m`);

    // Read token
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      token = cfg?.gateway?.auth?.token || cfg?.gateway?.token || null;
    } catch {}

    // Register
    const currentReg = loadRegistry();
    if (!currentReg.find(i => i.name === name)) {
      currentReg.push({
        name, displayName: displayName || name, port, token,
        template: template || "general", createdAt: new Date().toISOString(),
        profileDir, pid: null, status: "ready",
      });
      saveRegistry(currentReg);
    }

    success = true;
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, "\x1b[1;32m╔══════════════════════════════════════════╗\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;32m║   ✅ Deployment Complete!                ║\x1b[0m");
    sendLine(ws, sessionId, "\x1b[1;32m╚══════════════════════════════════════════╝\x1b[0m");

  } catch (err) {
    sendLine(ws, sessionId, "");
    sendLine(ws, sessionId, `\x1b[1;31m✗ Deploy failed: ${err.message}\x1b[0m`);
    try { cleanupFailedDeploy(name, port); } catch {}
  }

  ws.send(JSON.stringify({ type: "done", sessionId, exitCode: success ? 0 : 1, success, name, port, token }));
  sessions.delete(sessionId);
}
