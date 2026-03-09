/**
 * Auto-fix engine — runs an available coding CLI to diagnose and fix errors.
 *
 * Strategy:
 *   1) Try Claude Code first (if installed)
 *   2) Fall back to Codex CLI if Claude fails or is unavailable
 *   3) Stream progress logs to the client via SSE
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
  runner?: "claude" | "codex";
}

type RunnerId = "claude" | "codex";

interface AutofixRunner {
  id: RunnerId;
  label: string;
  binary: string;
  args: (prompt: string, cwd: string) => string[];
  parser: (line: string) => { message: string; type: AutofixLogEntry["type"] } | null;
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
    try {
      listener(entry);
    } catch {}
  }
}

function updateStatus(id: string, status: "running" | "complete" | "failed") {
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

function findBinary(cmd: string): string | null {
  try {
    const found = execSync(`which ${cmd}`, { encoding: "utf-8", timeout: 3000 }).trim();
    return found || null;
  } catch {
    return null;
  }
}

// ── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(options: {
  agentId: string;
  errorMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
}): string {
  const lines = [
    "An error occurred in the Clawboard app (Next.js) while chatting with an OpenClaw AI agent. Diagnose and fix it.",
    "",
    "## Error",
    options.errorMessage,
    "",
    "## Agent ID",
    options.agentId,
  ];

  if (options.recentMessages && options.recentMessages.length > 0) {
    lines.push("", "## Recent conversation context");
    for (const m of options.recentMessages) {
      lines.push(`[${m.role}]: ${m.content.slice(0, 300)}`);
    }
  }

  lines.push(
    "",
    "## Instructions",
    "1. Read the CLAUDE.md file first for project context",
    "2. Read relevant source files to understand the error (chat route, gateway, etc.)",
    "3. Check gateway config and API key setup if relevant",
    "4. Fix the root cause — edit code, config, or restart services as needed",
    "5. Be concise — explain what you found and what you fixed"
  );

  return lines.join("\n");
}

// ── Stream parsers ─────────────────────────────────────────────────

function parseClaudeStreamEvent(line: string): { message: string; type: AutofixLogEntry["type"] } | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  const type = String(event.type || "");

  if (type === "system" && event.subtype === "init") {
    return { message: "Claude Code connected", type: "system" };
  }

  if (type === "assistant" && Array.isArray(event.content)) {
    for (const block of event.content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") {
        const text = block.text.trim();
        if (text) return { message: text, type: "text" };
      }
      if (block.type === "tool_use") {
        const name = (block.name as string) || "unknown";
        const input = (block.input as Record<string, unknown>) || {};
        if (name === "Read" || name === "read") return { message: `Reading ${input.file_path || input.path || "file"}...`, type: "tool" };
        if (name === "Edit" || name === "edit") return { message: `Editing ${input.file_path || "file"}...`, type: "tool" };
        if (name === "Write" || name === "write") return { message: `Writing ${input.file_path || "file"}...`, type: "tool" };
        if (name === "Bash" || name === "bash") {
          const cmd = (String(input.command || "")).slice(0, 80);
          return { message: `Running: ${cmd}`, type: "tool" };
        }
        if (name === "Glob" || name === "glob") return { message: `Searching files: ${input.pattern || "..."}`, type: "tool" };
        if (name === "Grep" || name === "grep") return { message: `Searching for: ${input.pattern || "..."}`, type: "tool" };
        return { message: `Using tool: ${name}`, type: "tool" };
      }
    }
  }

  if (type === "result") {
    const subtype = String(event.subtype || "");
    const costUsd = event.cost_usd as number | undefined;
    const turns = event.num_turns as number | undefined;
    const costStr = costUsd !== undefined ? ` ($${costUsd.toFixed(2)})` : "";
    const turnsStr = turns !== undefined ? `, ${turns} turns` : "";

    if (subtype === "success") return { message: `Complete${costStr}${turnsStr}`, type: "result" };
    if (subtype === "error") {
      const errMsg = String(event.error || "Unknown error");
      return { message: `Failed: ${errMsg}${costStr}`, type: "error" };
    }
  }

  return null;
}

function parseCodexStreamEvent(line: string): { message: string; type: AutofixLogEntry["type"] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return { message: trimmed, type: "text" };
  }

  const type = String(event.type || "");

  if (type.includes("error")) {
    const err =
      (typeof event.message === "string" && event.message) ||
      (typeof event.error === "string" && event.error) ||
      trimmed;
    return { message: `Failed: ${err}`, type: "error" };
  }

  if (type.includes("completed") || type === "result") {
    return { message: "Complete", type: "result" };
  }

  if (typeof event.message === "string" && event.message.trim()) {
    return { message: event.message.trim(), type: "text" };
  }

  const delta =
    (typeof event.delta === "string" && event.delta) ||
    (typeof event.text === "string" && event.text) ||
    (typeof event.output_text === "string" && event.output_text);
  if (delta && delta.trim()) {
    return { message: delta.trim(), type: "text" };
  }

  return null;
}

// ── Main entry point ───────────────────────────────────────────────

export async function startAutofix(options: {
  agentId: string;
  errorMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
}): Promise<{ sessionId: string }> {
  for (const [, session] of sessions) {
    if (session.status === "running") {
      throw new Error("An auto-fix session is already running. Please wait for it to finish.");
    }
  }

  const claudePath = findBinary("claude");
  const codexPath = findBinary("codex");

  const runners: AutofixRunner[] = [];
  if (claudePath) {
    runners.push({
      id: "claude",
      label: "Claude Code",
      binary: claudePath,
      args: (prompt) => [
        "-p",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--permission-mode", "acceptEdits",
        "--max-budget-usd", "5",
        "--model", "sonnet",
        "--no-session-persistence",
        prompt,
      ],
      parser: parseClaudeStreamEvent,
    });
  }
  if (codexPath) {
    runners.push({
      id: "codex",
      label: "Codex",
      binary: codexPath,
      args: (prompt, cwd) => [
        "exec",
        "--json",
        "--full-auto",
        "--cd", cwd,
        prompt,
      ],
      parser: parseCodexStreamEvent,
    });
  }

  if (runners.length === 0) {
    throw new Error(
      "No auto-fix CLI found. Install Claude Code (`npm install -g @anthropic-ai/claude-code`) or ensure `codex` is installed."
    );
  }

  const sessionId = crypto.randomBytes(8).toString("hex");
  const prompt = buildPrompt(options);
  const projectRoot = process.cwd();

  sessions.set(sessionId, {
    id: sessionId,
    agentId: options.agentId,
    errorMessage: options.errorMessage,
    status: "running",
    startedAt: new Date().toISOString(),
  });

  setTimeout(() => {
    runWithFallback(sessionId, runners, prompt, projectRoot);
  }, 0);

  return { sessionId };
}

async function runWithFallback(
  sessionId: string,
  runners: AutofixRunner[],
  prompt: string,
  cwd: string
) {
  for (let i = 0; i < runners.length; i++) {
    const runner = runners[i];
    if (!runner) continue;

    const session = sessions.get(sessionId);
    if (session) session.runner = runner.id;

    addLog(sessionId, `Starting ${runner.label}...`, "system");

    const result = await runRunnerProcess(sessionId, runner, prompt, cwd);
    if (result.success) {
      updateStatus(sessionId, "complete");
      return;
    }

    const next = runners[i + 1];
    if (next) {
      addLog(
        sessionId,
        `${runner.label} failed${result.reason ? `: ${result.reason}` : ""}. Falling back to ${next.label}...`,
        "system"
      );
      continue;
    }

    addLog(sessionId, result.reason || `${runner.label} failed`, "error");
  }

  updateStatus(sessionId, "failed");
}

function runRunnerProcess(
  sessionId: string,
  runner: AutofixRunner,
  prompt: string,
  cwd: string
): Promise<{ success: boolean; reason?: string }> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(runner.binary, runner.args(prompt, cwd), {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      childProcesses.set(sessionId, child);
    } catch (err) {
      resolve({ success: false, reason: `Failed to spawn ${runner.label}: ${String(err)}` });
      return;
    }

    let streamFailure: string | null = null;
    let terminalErrorFromOutput = false;
    let timedOut = false;

    const isBenignStderr = (text: string): boolean => {
      const lower = text.toLowerCase();
      return (
        lower.includes("could not update path") ||
        lower.includes("warning: proceeding")
      );
    };

    const hardTimeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 120000);

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const parsed = runner.parser(line);
        if (!parsed) return;
        addLog(sessionId, parsed.message, parsed.type);
        if (runner.id === "claude" && parsed.type === "error") {
          terminalErrorFromOutput = true;
        }
        if (parsed.type === "error" && !streamFailure) {
          streamFailure = parsed.message;
        }
      });
    }

    if (child.stderr) {
      const rl = createInterface({ input: child.stderr, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const text = line.trim();
        if (!text) return;
        if (isBenignStderr(text)) {
          addLog(sessionId, text, "system");
          return;
        }
        addLog(sessionId, text, "error");
        if (!streamFailure) streamFailure = text;
      });
    }

    child.on("exit", (code) => {
      clearTimeout(hardTimeout);
      childProcesses.delete(sessionId);

      if (timedOut) {
        resolve({ success: false, reason: `${runner.label} timed out` });
        return;
      }

      if (code === 0 && !terminalErrorFromOutput) {
        addLog(sessionId, "Complete", "result");
        resolve({ success: true });
        return;
      }

      resolve({
        success: false,
        reason: streamFailure || `${runner.label} exited with code ${code}`,
      });
    });

    child.on("error", (err) => {
      clearTimeout(hardTimeout);
      childProcesses.delete(sessionId);
      resolve({ success: false, reason: `Process error: ${err.message}` });
    });
  });
}
