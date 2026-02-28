import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getNextPort, registerInstance } from "./instances";
import { getApiKey, getAuthConfig, isSubscriptionAuth } from "./auth";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

const HOME = homedir();

/**
 * Clean up LaunchAgent and port processes from a failed deployment.
 */
function cleanupFailedDeploy(name: string, port: number) {
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
  logs: LogEntry[];
  error: string | null;
  result: Record<string, unknown> | null;
}

// In-memory deployment store
const activeDeployments = new Map<string, Deployment>();
const sseListeners = new Map<string, Array<(entry: LogEntry) => void>>();

export function getDeployment(id: string): Deployment | undefined {
  return activeDeployments.get(id);
}

export function listDeployments() {
  return [...activeDeployments.entries()].map(([id, d]) => ({
    id,
    name: d.name,
    status: d.status,
    startedAt: d.startedAt,
  }));
}

function addLog(deployment: Deployment, message: string) {
  const entry: LogEntry = { ts: Date.now(), message };
  deployment.logs.push(entry);
  const listeners = sseListeners.get(deployment.id) || [];
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {}
  }
}

export function addSSEListener(deployId: string, callback: (entry: LogEntry) => void) {
  if (!sseListeners.has(deployId)) sseListeners.set(deployId, []);
  sseListeners.get(deployId)!.push(callback);

  // Send existing logs
  const deployment = activeDeployments.get(deployId);
  if (deployment) {
    for (const entry of deployment.logs) {
      callback(entry);
    }
  }

  return () => {
    const arr = sseListeners.get(deployId) || [];
    sseListeners.set(
      deployId,
      arr.filter((r) => r !== callback)
    );
  };
}

export async function startDeployment({
  name,
  displayName,
  template,
}: {
  name: string;
  displayName?: string;
  template?: string;
}) {
  const authConfig = getAuthConfig();
  const apiKey = getApiKey();
  const useSubscription = isSubscriptionAuth();
  if (!apiKey && !useSubscription) {
    throw new Error("No authentication configured. Go to Settings to connect your Claude subscription or add an API key.");
  }

  const deployId = crypto.randomBytes(8).toString("hex");
  const port = getNextPort();
  const profileDir = join(HOME, `.openclaw-${name}`);

  const deployment: Deployment = {
    id: deployId,
    name,
    displayName: displayName || name,
    template: template || "general",
    port,
    profileDir,
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [],
    error: null,
    result: null,
  };

  activeDeployments.set(deployId, deployment);

  // Run deploy in background — setTimeout ensures it doesn't block the response
  setTimeout(() => {
    runDeployAgent(deployment, apiKey, useSubscription, authConfig.claudeCliPath || "claude").catch((err) => {
      deployment.status = "failed";
      deployment.error = err.message;
      addLog(deployment, `Deploy failed: ${err.message}`);
      cleanupFailedDeploy(name, port);
    });
  }, 0);

  return { deployId, name, port };
}

// Tool definitions for Claude
const tools: Anthropic.Tool[] = [
  {
    name: "run_command",
    description:
      "Execute a shell command and return stdout/stderr. Use this for installing packages, running CLI commands, checking system state, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path. Creates parent directories if needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch the text content of a URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
  },
];

function buildSystemPrompt(deployment: Deployment): string {
  const { name, template, port, profileDir } = deployment;

  // Detect environment
  let nodeVersion = "unknown";
  let hasOpenclaw = false;
  let os = "unknown";

  try {
    nodeVersion = execSync("node --version", { encoding: "utf-8" }).trim();
  } catch {}
  try {
    execSync("which openclaw", { encoding: "utf-8" });
    hasOpenclaw = true;
  } catch {}
  try {
    os = execSync("uname -s", { encoding: "utf-8" }).trim();
  } catch {}

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

async function executeToolCall(
  toolName: string,
  toolInput: Record<string, string>,
  deployment: Deployment
): Promise<string> {
  switch (toolName) {
    case "run_command": {
      const cmd = toolInput.command;
      addLog(deployment, `$ ${cmd}`);
      try {
        const output = execSync(cmd, {
          encoding: "utf-8",
          timeout: 60000,
          cwd: HOME,
          env: { ...process.env },
          maxBuffer: 1024 * 1024,
        });
        const trimmed = output.trim();
        if (trimmed) addLog(deployment, trimmed);
        return trimmed || "(no output)";
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; stderr?: string; message?: string };
        const errOutput = (execErr.stderr || execErr.stdout || execErr.message || "Command failed").toString().trim();
        addLog(deployment, `Error: ${errOutput.slice(0, 500)}`);
        return `Error: ${errOutput}`;
      }
    }

    case "read_file": {
      const filePath = toolInput.path;
      addLog(deployment, `Reading: ${filePath}`);
      try {
        if (!existsSync(filePath)) return `Error: File not found: ${filePath}`;
        const content = readFileSync(filePath, "utf-8");
        return content.slice(0, 10000);
      } catch (err: unknown) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "write_file": {
      const filePath = toolInput.path;
      addLog(deployment, `Writing: ${filePath}`);
      try {
        const { mkdirSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, toolInput.content);
        return `File written: ${filePath}`;
      } catch (err: unknown) {
        return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "fetch_url": {
      const url = toolInput.url;
      addLog(deployment, `Fetching: ${url}`);
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        return text.slice(0, 15000);
      } catch (err: unknown) {
        return `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}


async function runDeployViaCLI(deployment: Deployment, claudeCliPath: string) {
  const { spawn } = require("node:child_process");
  
  const systemPrompt = buildSystemPrompt(deployment);

  addLog(deployment, "Spawning Claude CLI agent...");

  return new Promise<void>((resolve, reject) => {
    const child = spawn(claudeCliPath, [
      "--dangerously-skip-permissions",
      "--max-turns", "30",
      "-p", systemPrompt,
    ], {
      cwd: homedir(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 180000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      for (const line of chunk.split("\n").filter((l: string) => l.trim())) {
        addLog(deployment, line.trim());
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", async (code: number | null) => {
      if (code !== 0) {
        addLog(deployment, `Agent exited with code ${code}`);
        if (stderr) addLog(deployment, stderr.slice(-500));
        deployment.status = "failed";
        deployment.error = `Agent exited with code ${code}`;
        cleanupFailedDeploy(deployment.name, deployment.port);
        reject(new Error(`Agent exited with code ${code}`));
        return;
      }

      addLog(deployment, "Agent completed. Registering instance...");
      
      try {
        const configPath = join(deployment.profileDir, "openclaw.json");
        let token = null;
        if (existsSync(configPath)) {
          try {
            const config = JSON.parse(readFileSync(configPath, "utf-8"));
            token = config?.gateway?.token || null;
          } catch {}
        }

        await registerInstance({
          name: deployment.name,
          displayName: deployment.displayName,
          port: deployment.port,
          token,
          template: deployment.template,
          profileDir: deployment.profileDir,
        });

        deployment.status = "complete";
        deployment.result = { name: deployment.name, port: deployment.port, token };
        addLog(deployment, `Instance "${deployment.name}" deployed successfully!`);
        resolve();
      } catch (err: any) {
        deployment.status = "failed";
        deployment.error = err.message;
        addLog(deployment, `Post-setup error: ${err.message}`);
        reject(err);
      }
    });

    child.on("error", (err: Error) => {
      addLog(deployment, `Failed to spawn agent: ${err.message}`);
      deployment.status = "failed";
      deployment.error = err.message;
      reject(err);
    });
  });
}

async function runDeployAgent(deployment: Deployment, apiKey: string | null, useSubscription: boolean, claudeCliPath: string) {
  addLog(deployment, "Starting deployment...");
  addLog(deployment, `Instance: ${deployment.name} | Port: ${deployment.port} | Template: ${deployment.template}`);

  // Use deterministic deploy (more reliable than agent-driven)
  // Falls back to API agent only if direct deploy fails and API key is available
  try {
    addLog(deployment, "Using direct deploy (deterministic)...");
    return await runDeployDirect(deployment);
  } catch (directErr: unknown) {
    const errMsg = directErr instanceof Error ? directErr.message : String(directErr);
    addLog(deployment, `Direct deploy failed: ${errMsg}`);
    
    if (!apiKey) {
      throw directErr; // No API key to fall back to
    }
    addLog(deployment, "Falling back to API agent deploy...");
  }

  // Fallback: API agent (not CLI, to avoid nesting issues)
  if (false && useSubscription) {
    // Disabled: CLI deploy can't run nested inside another Claude session
    return runDeployViaCLI(deployment, claudeCliPath);
  }

  const client = new Anthropic({ apiKey: apiKey! });
  const systemPrompt = buildSystemPrompt(deployment);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Set up the OpenClaw instance "${deployment.name}" now. Follow your instructions precisely.`,
    },
  ];

  const maxTurns = 20;

  for (let turn = 0; turn < maxTurns; turn++) {
    addLog(deployment, `Agent turn ${turn + 1}...`);

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });
    } catch (err: unknown) {
      throw new Error(`Anthropic API error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Process response blocks
    const assistantContent = response.content;
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    for (const block of assistantContent) {
      if (block.type === "text") {
        if (block.text.trim()) {
          addLog(deployment, block.text.trim());
        }
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    // Check if we're done (end_turn with no tool use)
    if (response.stop_reason === "end_turn" && toolUseBlocks.length === 0) {
      addLog(deployment, "Agent completed deployment.");
      break;
    }

    // Execute tool calls
    if (toolUseBlocks.length > 0) {
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeToolCall(
          toolUse.name,
          toolUse.input as Record<string, string>,
          deployment
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (response.stop_reason === "end_turn") break;
  }

  // Try to read config and register instance
  try {
    const configPath = join(deployment.profileDir, "openclaw.json");
    let token: string | null = null;
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      token = config?.gateway?.token || null;
    }

    await registerInstance({
      name: deployment.name,
      displayName: deployment.displayName,
      port: deployment.port,
      token,
      template: deployment.template,
      profileDir: deployment.profileDir,
    });

    addLog(deployment, `Instance '${deployment.name}' registered successfully!`);
    deployment.status = "complete";
    deployment.result = { name: deployment.name, port: deployment.port, token };
  } catch (err: unknown) {
    // Instance might already be registered if agent did it
    addLog(deployment, `Post-setup: ${err instanceof Error ? err.message : String(err)}`);
    deployment.status = "complete";
    deployment.result = { name: deployment.name, port: deployment.port };
  }
}

/**
 * Deterministic deploy: runs openclaw commands directly without an AI agent.
 * More reliable than agent-driven deploy for well-known setup steps.
 */
async function runDeployDirect(deployment: Deployment) {
  const { name, port, profileDir, template } = deployment;

  const run = async (cmd: string, label?: string): Promise<string> => {
    if (label) addLog(deployment, label);
    addLog(deployment, `$ ${cmd}`);
    return new Promise((resolve, reject) => {
      const { exec: execAsync } = require("node:child_process");
      execAsync(cmd, {
        encoding: "utf-8",
        timeout: 120000,
        cwd: HOME,
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          const msg = (stderr || stdout || err.message || "Command failed").toString().trim();
          addLog(deployment, `Error: ${msg.slice(0, 500)}`);
          reject(new Error(msg.slice(0, 200)));
          return;
        }
        const trimmed = (stdout || "").trim();
        if (trimmed) addLog(deployment, trimmed);
        resolve(trimmed || "(no output)");
      });
    });
  };

  // Step 1: Verify openclaw
  addLog(deployment, "🔍 Checking OpenClaw installation...");
  try {
    await run("which openclaw && openclaw --version");
  } catch {
    addLog(deployment, "Installing OpenClaw...");
    await run("npm install -g openclaw@latest");
  }

  // Step 2: Onboard
  addLog(deployment, "📦 Creating instance profile...");
  await run(
    `openclaw --profile ${name} onboard --non-interactive --accept-risk --flow quickstart --gateway-port ${port} --gateway-bind loopback --gateway-auth token --auth-choice skip --install-daemon --skip-channels --skip-skills --skip-ui --skip-health`
  );

  // Step 3: Configure
  addLog(deployment, "⚙️ Configuring gateway...");
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

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    addLog(deployment, "Config updated with HTTP endpoints + anti-idle settings");
  }

  // Step 4: Workspace + SOUL
  addLog(deployment, "📝 Creating workspace...");
  const { mkdirSync } = require("node:fs");
  mkdirSync(join(profileDir, "workspace"), { recursive: true });
  writeFileSync(
    join(profileDir, "workspace", "SOUL.md"),
    `# ${name}\nYou are a ${template || "general"} AI assistant deployed via Mission Control.\n`
  );

  // Step 5: Install service
  addLog(deployment, "🔧 Installing gateway service...");
  try {
    await run(`openclaw --profile ${name} gateway install`);
  } catch {
    addLog(deployment, "Gateway install skipped (may already exist)");
  }

  // Step 6: Doctor
  try {
    await run(`openclaw --profile ${name} doctor --fix`);
  } catch {
    addLog(deployment, "Doctor completed with warnings");
  }

  // Step 7: Start
  addLog(deployment, "🚀 Starting gateway...");
  await run(`openclaw --profile ${name} gateway start`);

  // Step 8: Verify
  addLog(deployment, "✅ Verifying...");
  await new Promise((r) => setTimeout(r, 3000));
  try {
    await run(`openclaw --profile ${name} gateway status`);
  } catch {}

  // Also verify HTTP
  let alive = false;
  for (let i = 0; i < 5; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (resp.status < 500) { alive = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!alive) {
    addLog(deployment, "⚠️ Gateway not responding yet — may still be starting");
  } else {
    addLog(deployment, `✅ Gateway alive on port ${port}`);
  }

  // Register
  let token: string | null = null;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    token = config?.gateway?.auth?.token || config?.gateway?.token || null;
  } catch {}

  await registerInstance({
    name,
    displayName: deployment.displayName,
    port,
    token,
    template: deployment.template,
    profileDir,
  });

  deployment.status = "complete";
  deployment.result = { name, port, token };
  addLog(deployment, `🎉 Instance "${name}" deployed successfully!`);
}
