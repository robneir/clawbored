import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getGateway, checkGatewayAlive, startGateway, profileFlag } from "./gateway";
import { listAgents } from "./agents";

export interface DiagnosticCheck {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

export interface DiagnosticResult {
  checks: DiagnosticCheck[];
  llmAnalysis: string | null;
  fixesApplied: string[];
  tier: "agent" | "local-cli" | "deterministic";
}

// ── Individual checks ────────────────────────────────────────

async function checkGatewayHealth(): Promise<DiagnosticCheck> {
  try {
    const gw = await getGateway();
    if (gw.status === "not_setup") {
      return { name: "Gateway", status: "error", detail: "Not configured — no profile set up" };
    }
    const alive = await checkGatewayAlive(gw.port);
    if (!alive) {
      return { name: "Gateway", status: "error", detail: `Not responding on port ${gw.port}` };
    }
    return { name: "Gateway", status: "ok", detail: `Running on port ${gw.port}` };
  } catch (e) {
    return { name: "Gateway", status: "error", detail: String(e) };
  }
}

async function checkConfig(): Promise<DiagnosticCheck> {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return { name: "Config", status: "error", detail: "No profile directory configured" };
    }
    const configPath = join(gw.profileDir, "openclaw.json");
    if (!existsSync(configPath)) {
      return { name: "Config", status: "error", detail: `Missing openclaw.json at ${gw.profileDir}` };
    }
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const issues: string[] = [];
    if (!config.gateway) issues.push("missing gateway section");
    if (!config.agents?.list?.length) issues.push("no agents configured");
    if (!config.gateway?.auth?.token && !config.gateway?.token) issues.push("no auth token");
    if (issues.length > 0) {
      return { name: "Config", status: "warn", detail: `Issues: ${issues.join(", ")}` };
    }
    return { name: "Config", status: "ok", detail: "Valid configuration" };
  } catch (e) {
    return { name: "Config", status: "error", detail: String(e) };
  }
}

async function checkProviders(): Promise<DiagnosticCheck> {
  try {
    const { listProviderKeys } = await import("./provider-keys");
    const keys = await listProviderKeys();
    if (keys.length === 0) {
      return { name: "Provider Keys", status: "warn", detail: "No API keys configured" };
    }
    const invalid = keys.filter((k) => !k.validated);
    if (invalid.length > 0) {
      return {
        name: "Provider Keys",
        status: "error",
        detail: `Invalid keys: ${invalid.map((k) => k.provider).join(", ")}`,
      };
    }
    return {
      name: "Provider Keys",
      status: "ok",
      detail: `${keys.length} key(s) configured and valid`,
    };
  } catch (e) {
    return { name: "Provider Keys", status: "warn", detail: `Could not check: ${e}` };
  }
}

async function checkAgentStatus(): Promise<DiagnosticCheck> {
  try {
    const agents = await listAgents();
    if (agents.length === 0) {
      return { name: "Agents", status: "warn", detail: "No agents found" };
    }
    return { name: "Agents", status: "ok", detail: `${agents.length} agent(s) available` };
  } catch (e) {
    return { name: "Agents", status: "error", detail: String(e) };
  }
}

function checkOpenClawCli(): DiagnosticCheck {
  try {
    const path = execSync("which openclaw", { encoding: "utf-8", timeout: 3000 }).trim();
    return { name: "OpenClaw CLI", status: "ok", detail: path };
  } catch {
    return { name: "OpenClaw CLI", status: "error", detail: "openclaw not found in PATH" };
  }
}

async function runDoctor(): Promise<DiagnosticCheck> {
  try {
    const gw = await getGateway();
    if (gw.status === "not_setup" || !gw.profileName) {
      return { name: "Doctor", status: "warn", detail: "Skipped — no profile" };
    }
    const ocPath = execSync("which openclaw", { encoding: "utf-8", timeout: 3000 }).trim();
    const pFlag = profileFlag(gw.profileName);
    const output = execSync(`${ocPath} ${pFlag} doctor`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const hasError = output.toLowerCase().includes("error") || output.toLowerCase().includes("fail");
    return {
      name: "Doctor",
      status: hasError ? "warn" : "ok",
      detail: output.slice(0, 500) || "No issues found",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e as { stderr?: string }).stderr || e.message : String(e);
    return { name: "Doctor", status: "warn", detail: msg.slice(0, 500) };
  }
}

// ── Deterministic fixes ──────────────────────────────────────

async function applyFixes(checks: DiagnosticCheck[]): Promise<string[]> {
  const fixes: string[] = [];
  const hasGatewayError = checks.some((c) => c.name === "Gateway" && c.status === "error");

  // Try to restart gateway if it's down
  if (hasGatewayError) {
    try {
      const gw = await getGateway();
      if (gw.status !== "not_setup" && gw.profileDir) {
        await startGateway();
        fixes.push("Restarted gateway");
      }
    } catch {}
  }

  // Run doctor --fix if CLI is available and profile exists
  try {
    const gw = await getGateway();
    if (gw.profileName) {
      const ocPath = execSync("which openclaw", { encoding: "utf-8", timeout: 3000 }).trim();
      const pFlag = profileFlag(gw.profileName);
      execSync(`${ocPath} ${pFlag} doctor --fix`, {
        encoding: "utf-8",
        timeout: 15000,
        stdio: "pipe",
      });
      fixes.push("Ran doctor --fix");
    }
  } catch {}

  return fixes;
}

// ── LLM analysis (tiered fallback) ──────────────────────────

function formatDiagnosticReport(checks: DiagnosticCheck[], fixes: string[]): string {
  const lines = ["# System Diagnostic Report", ""];
  for (const c of checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    lines.push(`${icon} ${c.name}: ${c.detail}`);
  }
  if (fixes.length > 0) {
    lines.push("", "## Auto-fixes applied:");
    for (const f of fixes) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}

const ANALYSIS_PROMPT =
  "You are a system diagnostics assistant for OpenClaw (an AI agent platform). " +
  "Analyze the diagnostic report below. Be very concise (2-4 sentences max). " +
  "If everything looks healthy, say so briefly. If there are issues, explain " +
  "the most likely cause and what the user should do. Do NOT use markdown headers.";

async function tryAgentAnalysis(report: string): Promise<string | null> {
  try {
    const gw = await getGateway();
    if (!gw.token || !(await checkGatewayAlive(gw.port))) return null;

    // Find the first available agent
    const agents = await listAgents();
    if (agents.length === 0) return null;

    const res = await fetch(`http://127.0.0.1:${gw.port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gw.token}`,
      },
      body: JSON.stringify({
        model: `openclaw:${agents[0].id}`,
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content: report },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function tryLocalClaude(report: string): Promise<string | null> {
  try {
    execSync("which claude", { encoding: "utf-8", timeout: 3000 });
  } catch {
    return null;
  }

  try {
    const prompt = `${ANALYSIS_PROMPT}\n\n${report}`;
    const result = execSync(
      `echo ${JSON.stringify(prompt)} | claude --print`,
      { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

// ── Main entry point ─────────────────────────────────────────

export async function runDiagnostics(): Promise<DiagnosticResult> {
  // 1. Collect all checks in parallel
  const checks = await Promise.all([
    checkGatewayHealth(),
    checkConfig(),
    checkProviders(),
    checkAgentStatus(),
    Promise.resolve(checkOpenClawCli()),
    runDoctor(),
  ]);

  // 2. Apply deterministic fixes for any errors
  const hasIssues = checks.some((c) => c.status === "error" || c.status === "warn");
  const fixesApplied = hasIssues ? await applyFixes(checks) : [];

  // 3. If issues exist, try LLM analysis (tiered fallback)
  const report = formatDiagnosticReport(checks, fixesApplied);
  let llmAnalysis: string | null = null;
  let tier: DiagnosticResult["tier"] = "deterministic";

  if (hasIssues) {
    // Tier 1: Connected agent
    llmAnalysis = await tryAgentAnalysis(report);
    if (llmAnalysis) {
      tier = "agent";
    } else {
      // Tier 2: Local Claude CLI
      llmAnalysis = await tryLocalClaude(report);
      if (llmAnalysis) {
        tier = "local-cli";
      }
    }
  }

  // Re-check gateway after fixes to update status
  if (fixesApplied.length > 0) {
    const recheck = await checkGatewayHealth();
    const idx = checks.findIndex((c) => c.name === "Gateway");
    if (idx >= 0) checks[idx] = recheck;
  }

  return { checks, llmAnalysis, fixesApplied, tier };
}
