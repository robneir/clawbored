import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PORT = 3001;
const HOME = homedir();
const MC_STATE = join(HOME, ".mission-control");
const REGISTRY = join(MC_STATE, "instances.json");
const AUTH_FILE = join(MC_STATE, "auth.json");
const BASE_PORT = 19100;

// --- Auth helpers ---
function getAuthConfig() {
  try { return JSON.parse(readFileSync(AUTH_FILE, "utf-8")); } catch { return {}; }
}

// --- Instance helpers ---
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

// --- Server ---
const sessions = new Map();
const wss = new WebSocketServer({ port: PORT });
console.log(`⚡ PTY server running on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log("Received:", msg.type, msg.name || "");

      if (msg.type === "deploy") {
        handleDeploy(ws, msg);
      } else if (msg.type === "input" && msg.sessionId) {
        const s = sessions.get(msg.sessionId);
        if (s?.proc.stdin?.writable) s.proc.stdin.write(msg.data);
      } else if (msg.type === "resize" && msg.sessionId) {
        // Resize handling - not needed for pipe stdio but log it
        console.log(`Resize: ${msg.cols}x${msg.rows}`);
      }
    } catch (err) {
      console.error("Message error:", err);
      ws.send(JSON.stringify({ type: "error", message: String(err) }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    for (const [id, session] of sessions) {
      if (session.ws === ws) {
        try { session.proc.kill("SIGTERM"); } catch {}
        sessions.delete(id);
      }
    }
  });
});

function handleDeploy(ws, msg) {
  const auth = getAuthConfig();
  const apiKey = auth.anthropicApiKey;
  const useSubscription = auth.authMethod === "subscription";

  if (!apiKey && !useSubscription) {
    ws.send(JSON.stringify({ type: "error", message: "No auth configured. Go to Settings." }));
    return;
  }

  const { name, displayName, template } = msg;

  // Check if instance already exists
  const reg = loadRegistry();
  if (reg.find(i => i.name === name)) {
    ws.send(JSON.stringify({ type: "error", message: `Instance "${name}" already exists. Delete it first or choose a different name.` }));
    return;
  }

  const port = getNextPort();
  const profileDir = join(HOME, `.openclaw-${name}`);
  const sessionId = Math.random().toString(36).slice(2, 10);

  const claudePath = auth.claudeCliPath || join(HOME, ".local/bin/claude");
  console.log(`Deploying "${name}" on port ${port} via ${claudePath}`);

  const prompt = buildPrompt(name, port, profileDir, template || "general", useSubscription);

  ws.send(JSON.stringify({ type: "started", sessionId, name, port }));

  // Use Python PTY wrapper to allocate a real pseudo-terminal
  const wrapperPath = new URL("pty-wrapper.py", import.meta.url).pathname;
  const proc = spawn("python3", ["-u",
    wrapperPath,
    claudePath,
    "--dangerously-skip-permissions",
    "--max-turns", "30",
    "-p",
    prompt,
  ], {
    cwd: HOME,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDECODE"))
      ),
      ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
      TERM: "xterm-256color",
      FORCE_COLOR: "3",
      CLICOLOR_FORCE: "1",
    },
  });

  sessions.set(sessionId, { proc, ws, name });
  console.log(`Spawned PID ${proc.pid}`);

  // Stream raw PTY output directly to the browser
  proc.stdout.on("data", (data) => {
    const text = data.toString();
    if (text) console.log(`[${name}:out] ${text.slice(0,120).replace(/\n/g," ")}`);
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "data", sessionId, data: text }));
    }
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString();
    console.log(`[${name}:stderr] ${text.slice(0, 120)}`);
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "data", sessionId, data: text }));
    }
  });

  proc.on("error", (err) => {
    console.error(`Spawn error for "${name}":`, err.message);
    ws.send(JSON.stringify({ type: "error", message: `Spawn failed: ${err.message}` }));
    sessions.delete(sessionId);
  });

  proc.on("close", async (exitCode) => {
    console.log(`[${name}] exited with code ${exitCode}`);

    // Extract token from openclaw.json
    let token = null;
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        token = config?.gateway?.token || config?.gateway?.auth?.token || null;
      } catch {}
    }

    // Register instance
    try {
      const currentReg = loadRegistry();
      if (!currentReg.find(i => i.name === name)) {
        currentReg.push({
          name,
          displayName: displayName || name,
          port,
          token,
          template: template || "general",
          createdAt: new Date().toISOString(),
          profileDir,
          pid: null,
          status: "ready",
        });
        saveRegistry(currentReg);
        console.log(`Registered instance "${name}" with token: ${token ? "yes" : "no"}`);
      } else {
        // Update token if it was null
        const inst = currentReg.find(i => i.name === name);
        if (inst && !inst.token && token) {
          inst.token = token;
          saveRegistry(currentReg);
          console.log(`Updated token for "${name}"`);
        }
      }
    } catch (err) {
      console.error("Registry error:", err);
    }

    ws.send(JSON.stringify({
      type: "done", sessionId, exitCode,
      success: exitCode === 0, name, port, token,
    }));
    sessions.delete(sessionId);
  });
}

function buildPrompt(name, port, profileDir, template, useSubscription) {
  const authChoice = useSubscription ? "claude-cli" : "skip";
  return `Hey! I'm setting up a new AI agent using OpenClaw, which I already have installed via npm. I've been using it for a while and love it — it's an open-source AI agent framework (npm package "openclaw", you can verify with "npm info openclaw"). I need you to help me run the setup commands for a new instance.

Can you please do the following steps for me?

First, verify it's installed:
which openclaw && openclaw --version

Then, create a new profile called "${name}" using the onboard wizard. Here's the command with all the right flags so it runs non-interactively:
openclaw --profile ${name} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${port} --gateway-bind loopback --gateway-auth token --auth-choice ${authChoice} --install-daemon --skip-channels --skip-skills --skip-ui --skip-health

After that finishes, I need the HTTP endpoints enabled. Please read ${profileDir}/openclaw.json, find the "gateway" object in the JSON, and add this inside it:
"http": {"endpoints": {"chatCompletions": {"enabled": true}, "responses": {"enabled": true}}}
Then write the updated JSON back to the same file.

Next, create a workspace directory and a soul file:
mkdir -p ${profileDir}/workspace
And write this to ${profileDir}/workspace/SOUL.md:
# ${name}
You are a ${template} AI assistant. Be helpful, concise, and professional.

Then start the gateway service:
openclaw --profile ${name} gateway start

And finally check that it's running:
sleep 3 && openclaw --profile ${name} gateway status

That's it! Just go through each step and let me know how it goes. Thanks!`;
}
