import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getNextPort, registerInstance } from "./instances";
import { getApiKey } from "./auth";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

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
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No API key configured. Go to Settings to add your Anthropic API key.");

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

  // Run agent in background
  runDeployAgent(deployment, apiKey).catch((err) => {
    deployment.status = "failed";
    deployment.error = err.message;
    addLog(deployment, `Deploy failed: ${err.message}`);
  });

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

  return `You are a deployment agent for OpenClaw AI instances. Your job is to set up a new OpenClaw instance.

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
1. First, fetch the OpenClaw docs to understand the setup process: https://docs.openclaw.ai/start/getting-started
2. If OpenClaw is not installed, install it: npm install -g openclaw@latest
3. Run: openclaw --profile ${name} onboard --install-daemon
   - Set gateway port to ${port}
   - Set gateway bind to 127.0.0.1
   - Skip interactive prompts where possible (use --yes or similar flags)
4. Verify ${profileDir} exists and has openclaw.json
5. Start the gateway: openclaw --profile ${name} gateway start
6. Verify it's running: openclaw --profile ${name} gateway status

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

async function runDeployAgent(deployment: Deployment, apiKey: string) {
  addLog(deployment, "Starting agent-driven deployment...");
  addLog(deployment, `Instance: ${deployment.name} | Port: ${deployment.port} | Template: ${deployment.template}`);

  const client = new Anthropic({ apiKey });
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
