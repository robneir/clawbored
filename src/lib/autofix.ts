/**
 * Auto-fix engine — spawns Claude Code CLI headlessly to diagnose and fix errors.
 *
 * Uses the same in-memory pub/sub + SSE streaming pattern as deployer.ts.
 * When a chat error occurs, the user clicks "Fix with Claude" which:
 *   1. POSTs to /api/autofix with error context
 *   2. Server spawns `claude -p --output-format stream-json`
 *   3. Parses NDJSON stdout for structured events
 *   4. Streams log entries to the client via SSE
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import crypto from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────

export interface AutofixLogEntry {
  ts: number;
  message: string;
  type?: "text" | "tool" | "system" | "result" | "error";
}

export interface AutofixSession {
  id: string;
  agentId: string;
  errorMessage: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
}

// ── In-memory state ────────────────────────────────────────────────

const sessions = new Map<string, AutofixSession>();
const logBuffers = new Map<string, AutofixLogEntry[]>();
const sseListeners = new Map<string, Array<(entry: AutofixLogEntry) => void>>();
const childProcesses = new Map<string, ChildProcess>();

// ── Public API ─────────────────────────────────────────────────────

export function getAutofixSession(id: string): AutofixSession | null {
  return sessions.get(id) || null;
}

/** Replay logs from buffer, then register for live updates. Returns unsubscribe fn. */
export function addAutofixSSEListener(
  sessionId: string,
  callback: (entry: AutofixLogEntry) => void
): () => void {
  if (!sseListeners.has(sessionId)) sseListeners.set(sessionId, []);
  sseListeners.get(sessionId)!.push(callback);

  // Replay buffered logs
  const buffered = logBuffers.get(sessionId) || [];
  for (const entry of buffered) {
    callback(entry);
  }

  return () => {
    const arr = sseListeners.get(sessionId) || [];
    sseListeners.set(sessionId, arr.filter((r) => r !== callback));
  };
}

// ── Internal helpers ───────────────────────────────────────────────

function addLog(sessionId: string, message: string, type?: AutofixLogEntry["type"]) {
  const entry: AutofixLogEntry = { ts: Date.now(), message, type };

  if (!logBuffers.has(sessionId)) logBuffers.set(sessionId, []);
  logBuffers.get(sessionId)!.push(entry);

  const listeners = sseListeners.get(sessionId) || [];
  for (const listener of listeners) {
    try { listener(entry); } catch {}
  }
}

function updateStatus(
  id: string,
  status: "running" | "complete" | "failed"
) {
  const session = sessions.get(id);
  if (session) session.status = status;

  if (status === "complete" || status === "failed") {
    setTimeout(() => {
      logBuffers.delete(id);
      sseListeners.delete(id);
      sessions.delete(id);
      childProcesses.delete(id);
    }, 60000);
  }
}

// ── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(options: {
  agentId: string;
  errorMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
}): string {
  const lines = [
    `An error occurred in the Clawboard app (Next.js) while chatting with an OpenClaw AI agent. Diagnose and fix it.`,
    ``,
    `## Error`,
    options.errorMessage,
    ``,
    `## Agent ID`,
    options.agentId,
  ];

  if (options.recentMessages && options.recentMessages.length > 0) {
    lines.push(``, `## Recent conversation context`);
    for (const m of options.recentMessages) {
      lines.push(`[${m.role}]: ${m.content.slice(0, 300)}`);
    }
  }

  lines.push(
    ``,
    `## Instructions`,
    `1. Read the CLAUDE.md file first for project context`,
    `2. Read relevant source files to understand the error (chat route, gateway, etc.)`,
    `3. Check gateway config and API key setup if relevant`,
    `4. Fix the root cause — edit code, config, or restart services as needed`,
    `5. Be concise — explain what you found and what you fixed`,
  );

  return lines.join("\n");
}

// ── Stream-JSON parser ─────────────────────────────────────────────

/**
 * Parse a single NDJSON line from `claude -p --output-format stream-json`.
 * Returns a human-readable log message, or null to skip.
 */
function parseStreamEvent(line: string): { message: string; type: AutofixLogEntry["type"] } | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  const type = event.type as string;

  // System init
  if (type === "system" && event.subtype === "init") {
    return { message: "Claude Code connected", type: "system" };
  }

  // Assistant message with content
  if (type === "assistant" && Array.isArray(event.content)) {
    for (const block of event.content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") {
        const text = (block.text as string).trim();
        if (text) return { message: text, type: "text" };
      }
      if (block.type === "tool_use") {
        const name = block.name as string || "unknown";
        const input = block.input as Record<string, unknown> || {};
        // Summarize tool use
        if (name === "Read" || name === "read") {
          return { message: `Reading ${input.file_path || input.path || "file"}...`, type: "tool" };
        }
        if (name === "Edit" || name === "edit") {
          return { message: `Editing ${input.file_path || "file"}...`, type: "tool" };
        }
        if (name === "Write" || name === "write") {
          return { message: `Writing ${input.file_path || "file"}...`, type: "tool" };
        }
        if (name === "Bash" || name === "bash") {
          const cmd = (input.command as string || "").slice(0, 80);
          return { message: `Running: ${cmd}`, type: "tool" };
        }
        if (name === "Glob" || name === "glob") {
          return { message: `Searching files: ${input.pattern || "..."}`, type: "tool" };
        }
        if (name === "Grep" || name === "grep") {
          return { message: `Searching for: ${input.pattern || "..."}`, type: "tool" };
        }
        return { message: `Using tool: ${name}`, type: "tool" };
      }
    }
  }

  // Tool result (from user turn)
  if (type === "user" && Array.isArray(event.content)) {
    for (const block of event.content as Array<Record<string, unknown>>) {
      if (block.type === "tool_result") {
        return null; // skip verbose tool results
      }
    }
  }

  // Completion result
  if (type === "result") {
    const subtype = event.subtype as string;
    const costUsd = event.cost_usd as number | undefined;
    const turns = event.num_turns as number | undefined;
    const costStr = costUsd !== undefined ? ` ($${costUsd.toFixed(2)})` : "";
    const turnsStr = turns !== undefined ? `, ${turns} turns` : "";

    if (subtype === "success") {
      return { message: `Complete${costStr}${turnsStr}`, type: "result" };
    }
    if (subtype === "error") {
      const errMsg = event.error as string || "Unknown error";
      return { message: `Failed: ${errMsg}${costStr}`, type: "error" };
    }
  }

  return null;
}

// ── Main entry point ───────────────────────────────────────────────

export async function startAutofix(options: {
  agentId: string;
  errorMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
}): Promise<{ sessionId: string }> {
  // Guard: only one at a time
  for (const [, session] of sessions) {
    if (session.status === "running") {
      throw new Error("An auto-fix session is already running. Please wait for it to finish.");
    }
  }

  // Find claude binary
  let claudePath: string;
  try {
    claudePath = execSync("which claude", { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    throw new Error("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code");
  }

  const sessionId = crypto.randomBytes(8).toString("hex");
  const prompt = buildPrompt(options);

  // Resolve project root (this app's source code)
  // process.cwd() in Next.js always points to the project root
  const projectRoot = process.cwd();

  // Create session
  sessions.set(sessionId, {
    id: sessionId,
    agentId: options.agentId,
    errorMessage: options.errorMessage,
    status: "running",
    startedAt: new Date().toISOString(),
  });

  // Spawn in background (non-blocking)
  setTimeout(() => {
    runClaude(sessionId, claudePath, prompt, projectRoot);
  }, 0);

  return { sessionId };
}

async function runClaude(
  sessionId: string,
  claudePath: string,
  prompt: string,
  cwd: string
) {
  addLog(sessionId, "Starting Claude Code...", "system");

  const args = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--permission-mode", "acceptEdits",
    "--max-budget-usd", "5",
    "--model", "sonnet",
    "--no-session-persistence",
    prompt,
  ];

  let child: ChildProcess;
  try {
    child = spawn(claudePath, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcesses.set(sessionId, child);
  } catch (err) {
    addLog(sessionId, `Failed to spawn Claude: ${err}`, "error");
    updateStatus(sessionId, "failed");
    return;
  }

  // Hard timeout: 2 minutes
  const hardTimeout = setTimeout(() => {
    addLog(sessionId, "Timeout — killing process", "error");
    try { child.kill("SIGKILL"); } catch {}
    updateStatus(sessionId, "failed");
  }, 120000);

  let gotResult = false;

  // Parse stdout (NDJSON)
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });

    rl.on("line", (line) => {
      const parsed = parseStreamEvent(line);
      if (!parsed) return;

      addLog(sessionId, parsed.message, parsed.type);

      if (parsed.type === "result" || parsed.type === "error") {
        gotResult = true;
        clearTimeout(hardTimeout);
        updateStatus(sessionId, parsed.type === "error" ? "failed" : "complete");

        // Force-kill after 10s (claude sometimes hangs after result)
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
        }, 10000);
      }
    });
  }

  // Capture stderr
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (line.trim()) {
        addLog(sessionId, line.trim(), "error");
      }
    });
  }

  // Handle process exit
  child.on("exit", (code) => {
    clearTimeout(hardTimeout);
    if (!gotResult) {
      if (code === 0) {
        addLog(sessionId, "Complete", "result");
        updateStatus(sessionId, "complete");
      } else {
        addLog(sessionId, `Process exited with code ${code}`, "error");
        updateStatus(sessionId, "failed");
      }
    }
    childProcesses.delete(sessionId);
  });

  child.on("error", (err) => {
    clearTimeout(hardTimeout);
    addLog(sessionId, `Process error: ${err.message}`, "error");
    if (!gotResult) {
      updateStatus(sessionId, "failed");
    }
    childProcesses.delete(sessionId);
  });
}
