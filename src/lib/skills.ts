import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getGateway, profileFlag } from "./gateway";
import type { LogEntry } from "./deployer";
import crypto from "node:crypto";

const HOME = homedir();

// ── Types ──────────────────────────────────────────────────────

export interface MissingRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface Skill {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  source: string;
  bundled: boolean;
  primaryEnv?: string;
  homepage?: string;
  missing: MissingRequirements;
  apiKeyConfigured: boolean;
}

export interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

export interface SkillDetail extends Skill {
  filePath: string;
  baseDir: string;
  requirements: MissingRequirements;
  install: SkillInstallOption[];
  skillMdContent: string;
}

export interface ClawHubResult {
  slug: string;
  name: string;
  score: string;
}

export interface ClawHubSkillStats {
  comments: number;
  downloads: number;
  installsAllTime: number;
  installsCurrent: number;
  stars: number;
  versions: number;
}

export interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: ClawHubSkillStats;
  createdAt: number;
  updatedAt: number;
  latestVersion: { version: string; createdAt: number; changelog: string } | null;
  metadata: { os: string[] | null; systems: string[] | null } | null;
}

export interface ClawHubExploreResult {
  items: ClawHubSkill[];
  nextCursor: string | null;
}

export interface ClawHubSkillDetail {
  skill: ClawHubSkill;
  latestVersion: { version: string; createdAt: number; changelog: string } | null;
  owner: { handle: string; userId: string; displayName: string; image: string } | null;
}

export type ClawHubSortOption = "trending" | "downloads" | "stars" | "installs" | "newest";

// ── SSE Infrastructure (same pattern as deployer.ts) ───────────

const installLogBuffers = new Map<string, LogEntry[]>();
const installSSEListeners = new Map<string, Array<(entry: LogEntry) => void>>();
const installStatuses = new Map<string, "running" | "complete" | "failed">();

function addInstallLog(jobId: string, message: string) {
  const entry: LogEntry = { ts: Date.now(), message };

  if (!installLogBuffers.has(jobId)) installLogBuffers.set(jobId, []);
  installLogBuffers.get(jobId)!.push(entry);

  const listeners = installSSEListeners.get(jobId) || [];
  for (const listener of listeners) {
    try { listener(entry); } catch {}
  }
}

export function addInstallSSEListener(
  jobId: string,
  callback: (entry: LogEntry) => void
): () => void {
  if (!installSSEListeners.has(jobId)) installSSEListeners.set(jobId, []);
  installSSEListeners.get(jobId)!.push(callback);

  // Replay buffered logs
  const buffered = installLogBuffers.get(jobId) || [];
  for (const entry of buffered) {
    callback(entry);
  }

  return () => {
    const arr = installSSEListeners.get(jobId) || [];
    installSSEListeners.set(jobId, arr.filter((r) => r !== callback));
  };
}

export function getInstallStatus(jobId: string): "running" | "complete" | "failed" | null {
  return installStatuses.get(jobId) || null;
}

function cleanupInstall(jobId: string) {
  setTimeout(() => {
    installLogBuffers.delete(jobId);
    installSSEListeners.delete(jobId);
    installStatuses.delete(jobId);
  }, 30000);
}

// ── Helpers ────────────────────────────────────────────────────

async function getProfileFlag(): Promise<string> {
  const gw = await getGateway();
  if (gw.profileName && gw.status !== "not_setup") {
    return profileFlag(gw.profileName);
  }
  throw new Error("No active gateway profile");
}

async function getProfileDir(): Promise<string> {
  const gw = await getGateway();
  if (gw.profileDir && gw.status !== "not_setup") {
    return gw.profileDir;
  }
  throw new Error("No active gateway profile");
}

function execCmd(cmd: string, timeoutMs = 30000): string {
  return execSync(cmd, {
    encoding: "utf-8",
    timeout: timeoutMs,
    cwd: HOME,
    env: { ...process.env },
    maxBuffer: 5 * 1024 * 1024,
    stdio: "pipe",
  }).trim();
}

// ── Core Functions ─────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  const pFlag = await getProfileFlag();
  const profileDir = await getProfileDir();

  const cmd = `openclaw ${pFlag} skills list --json`.replace(/\s+/g, " ").trim();
  const raw = execCmd(cmd);
  const data = JSON.parse(raw);

  // Read openclaw.json for API key config
  let configuredKeys: Set<string> = new Set();
  try {
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const entries = config?.skills?.entries || {};
      for (const [name, entry] of Object.entries(entries)) {
        if (entry && typeof entry === "object" && "apiKey" in entry && (entry as Record<string, unknown>).apiKey) {
          configuredKeys.add(name);
        }
      }
    }
  } catch {}

  return (data.skills || []).map((s: Record<string, unknown>) => ({
    name: s.name as string,
    description: s.description as string || "",
    emoji: s.emoji as string || "",
    eligible: s.eligible as boolean || false,
    disabled: s.disabled as boolean || false,
    blockedByAllowlist: s.blockedByAllowlist as boolean || false,
    source: s.source as string || "unknown",
    bundled: s.bundled as boolean || false,
    primaryEnv: s.primaryEnv as string | undefined,
    homepage: s.homepage as string | undefined,
    missing: (s.missing as MissingRequirements) || { bins: [], anyBins: [], env: [], config: [], os: [] },
    apiKeyConfigured: configuredKeys.has(s.name as string),
  }));
}

export async function getSkillDetail(name: string): Promise<SkillDetail> {
  const pFlag = await getProfileFlag();
  const profileDir = await getProfileDir();

  const cmd = `openclaw ${pFlag} skills info ${name} --json`.replace(/\s+/g, " ").trim();
  const raw = execCmd(cmd);
  const s = JSON.parse(raw);

  // Read SKILL.md content
  let skillMdContent = "";
  const filePath = s.filePath as string;
  if (filePath) {
    const resolvedPath = filePath.startsWith("~")
      ? filePath.replace("~", HOME)
      : filePath;
    try {
      if (existsSync(resolvedPath)) {
        skillMdContent = readFileSync(resolvedPath, "utf-8");
      }
    } catch {}
  }

  // Check API key config
  let apiKeyConfigured = false;
  try {
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const entry = config?.skills?.entries?.[name];
      apiKeyConfigured = !!(entry?.apiKey);
    }
  } catch {}

  return {
    name: s.name as string,
    description: s.description as string || "",
    emoji: s.emoji as string || "",
    eligible: s.eligible as boolean || false,
    disabled: s.disabled as boolean || false,
    blockedByAllowlist: s.blockedByAllowlist as boolean || false,
    source: s.source as string || "unknown",
    bundled: s.bundled as boolean || false,
    primaryEnv: s.primaryEnv as string | undefined,
    homepage: s.homepage as string | undefined,
    missing: (s.missing as MissingRequirements) || { bins: [], anyBins: [], env: [], config: [], os: [] },
    requirements: (s.requirements as MissingRequirements) || { bins: [], anyBins: [], env: [], config: [], os: [] },
    install: (s.install as SkillInstallOption[]) || [],
    filePath: filePath || "",
    baseDir: (s.baseDir as string) || "",
    skillMdContent,
    apiKeyConfigured,
  };
}

export async function configureSkillApiKey(name: string, apiKey: string): Promise<void> {
  const profileDir = await getProfileDir();
  const configPath = join(profileDir, "openclaw.json");

  if (!existsSync(configPath)) {
    throw new Error("openclaw.json not found");
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  if (!config.skills) config.skills = {};
  if (!config.skills.entries) config.skills.entries = {};
  if (!config.skills.entries[name]) config.skills.entries[name] = {};
  config.skills.entries[name].apiKey = apiKey;

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export async function removeSkill(name: string): Promise<void> {
  // Get skill detail to find its directory
  const detail = await getSkillDetail(name);

  if (detail.bundled) {
    throw new Error("Cannot remove bundled skills. Bundled skills are part of the OpenClaw installation.");
  }

  const baseDir = detail.baseDir
    ? detail.baseDir.startsWith("~")
      ? detail.baseDir.replace("~", HOME)
      : detail.baseDir
    : "";

  if (!baseDir || !existsSync(baseDir)) {
    throw new Error("Skill directory not found.");
  }

  // Safety check: ensure it's inside a known skills directory
  const managedDir = await getManagedSkillsDir();
  const profileDir = await getProfileDir();
  const skillsDir = join(profileDir, "skills");

  const resolvedBase = require("node:path").resolve(baseDir);
  const resolvedManaged = require("node:path").resolve(managedDir);
  const resolvedSkills = require("node:path").resolve(skillsDir);

  if (!resolvedBase.startsWith(resolvedManaged) && !resolvedBase.startsWith(resolvedSkills)) {
    throw new Error("Cannot remove skill: directory is outside the managed skills folder.");
  }

  rmSync(baseDir, { recursive: true, force: true });

  // Also clean up any API key config
  try {
    const configPath = join(profileDir, "openclaw.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config?.skills?.entries?.[name]) {
        delete config.skills.entries[name];
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    }
  } catch {}
}

export async function searchClawHub(query: string): Promise<ClawHubResult[]> {
  const cmd = `npx clawhub search ${JSON.stringify(query)} --limit 20`;
  let raw: string;
  try {
    raw = execCmd(cmd, 15000);
  } catch {
    return [];
  }

  const results: ClawHubResult[] = [];
  const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("-") && !l.startsWith("Searching"));

  for (const line of lines) {
    // Format: "slug  Name  (score)"
    const match = line.match(/^(\S+)\s+(.+?)\s+\(([^)]+)\)\s*$/);
    if (match) {
      results.push({
        slug: match[1],
        name: match[2].trim(),
        score: match[3],
      });
    }
  }

  return results;
}

// ── ClawHub Browse & Inspect ──────────────────────────────────

export async function exploreClawHub(
  sort: ClawHubSortOption = "trending",
  limit = 20,
  cursor?: string
): Promise<ClawHubExploreResult> {
  const parts = ["npx", "clawhub", "explore", "--sort", sort, "--limit", String(limit)];
  if (cursor) {
    parts.push("--cursor", cursor);
  }
  parts.push("--json");
  const cmd = parts.join(" ");

  let raw: string;
  try {
    raw = execCmd(cmd, 30000);
  } catch {
    return { items: [], nextCursor: null };
  }

  try {
    const data = JSON.parse(raw);
    const items: ClawHubSkill[] = (data.items || []).map((item: Record<string, unknown>) => ({
      slug: (item.slug as string) || "",
      displayName: (item.displayName as string) || (item.slug as string) || "",
      summary: (item.summary as string) || "",
      tags: (item.tags as Record<string, string>) || {},
      stats: (item.stats as ClawHubSkillStats) || { comments: 0, downloads: 0, installsAllTime: 0, installsCurrent: 0, stars: 0, versions: 0 },
      createdAt: (item.createdAt as number) || 0,
      updatedAt: (item.updatedAt as number) || 0,
      latestVersion: (item.latestVersion as ClawHubSkill["latestVersion"]) || null,
      metadata: (item.metadata as ClawHubSkill["metadata"]) || null,
    }));
    return { items, nextCursor: (data.nextCursor as string) || null };
  } catch {
    return { items: [], nextCursor: null };
  }
}

export async function inspectClawHubSkill(slug: string): Promise<ClawHubSkillDetail | null> {
  const cmd = `npx clawhub inspect ${JSON.stringify(slug)} --json`;

  let raw: string;
  try {
    raw = execCmd(cmd, 15000);
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(raw);
    const skill = data.skill as Record<string, unknown> | undefined;
    if (!skill) return null;

    return {
      skill: {
        slug: (skill.slug as string) || slug,
        displayName: (skill.displayName as string) || (skill.slug as string) || slug,
        summary: (skill.summary as string) || "",
        tags: (skill.tags as Record<string, string>) || {},
        stats: (skill.stats as ClawHubSkillStats) || { comments: 0, downloads: 0, installsAllTime: 0, installsCurrent: 0, stars: 0, versions: 0 },
        createdAt: (skill.createdAt as number) || 0,
        updatedAt: (skill.updatedAt as number) || 0,
        latestVersion: (data.latestVersion as ClawHubSkill["latestVersion"]) || null,
        metadata: (skill.metadata as ClawHubSkill["metadata"]) || null,
      },
      latestVersion: (data.latestVersion as ClawHubSkillDetail["latestVersion"]) || null,
      owner: (data.owner as ClawHubSkillDetail["owner"]) || null,
    };
  } catch {
    return null;
  }
}

// ── Install Operations ─────────────────────────────────────────

export async function runInstall(
  jobId: string,
  installOption: SkillInstallOption
): Promise<void> {
  installStatuses.set(jobId, "running");

  try {
    let cmd: string;
    switch (installOption.kind) {
      case "brew":
        cmd = `brew install ${installOption.bins[0] || installOption.id.replace(/-brew$/, "")}`;
        break;
      case "npm":
        cmd = `npm install -g ${installOption.bins[0] || installOption.id.replace(/-npm$/, "")}`;
        break;
      case "pip":
        cmd = `pip3 install ${installOption.bins[0] || installOption.id.replace(/-pip$/, "")}`;
        break;
      default:
        throw new Error(`Unsupported install kind: ${installOption.kind}`);
    }

    addInstallLog(jobId, `Installing: ${installOption.label}`);
    addInstallLog(jobId, `$ ${cmd}`);

    const { exec: execAsync } = require("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = execAsync(cmd, {
        encoding: "utf-8",
        timeout: 300000,
        cwd: HOME,
        env: { ...process.env },
        maxBuffer: 5 * 1024 * 1024,
      }, (err: Error | null, stdout: string, stderr: string) => {
        if (stdout) {
          for (const line of stdout.trim().split("\n")) {
            if (line.trim()) addInstallLog(jobId, line);
          }
        }
        if (err) {
          const msg = (stderr || err.message || "Install failed").trim();
          addInstallLog(jobId, `Error: ${msg.slice(0, 500)}`);
          reject(new Error(msg.slice(0, 200)));
          return;
        }
        if (stderr) {
          for (const line of stderr.trim().split("\n")) {
            if (line.trim()) addInstallLog(jobId, line);
          }
        }
        resolve();
      });

      // Stream stdout/stderr in real-time
      child.stdout?.on("data", (data: string) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) addInstallLog(jobId, line);
        }
      });
      child.stderr?.on("data", (data: string) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) addInstallLog(jobId, line);
        }
      });
    });

    installStatuses.set(jobId, "complete");
    addInstallLog(jobId, "Installation complete!");
    addInstallLog(jobId, "__STATUS__:complete");
  } catch (err) {
    installStatuses.set(jobId, "failed");
    addInstallLog(jobId, `Failed: ${err instanceof Error ? err.message : String(err)}`);
    addInstallLog(jobId, "__STATUS__:failed");
  }

  cleanupInstall(jobId);
}

export async function installFromClawHub(
  jobId: string,
  slug: string
): Promise<void> {
  installStatuses.set(jobId, "running");

  try {
    const managedDir = await getManagedSkillsDir();
    const cmd = `npx clawhub install ${JSON.stringify(slug)} --force`;

    addInstallLog(jobId, `Installing from ClawHub: ${slug}`);
    addInstallLog(jobId, `Target: ${managedDir}`);
    addInstallLog(jobId, `$ ${cmd}`);

    const { exec: execAsync } = require("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = execAsync(cmd, {
        encoding: "utf-8",
        timeout: 120000,
        cwd: managedDir,
        env: { ...process.env },
        maxBuffer: 5 * 1024 * 1024,
      }, (err: Error | null, stdout: string, stderr: string) => {
        if (err) {
          const msg = (stderr || stdout || err.message || "Install failed").trim();
          addInstallLog(jobId, `Error: ${msg.slice(0, 500)}`);
          reject(new Error(msg.slice(0, 200)));
          return;
        }
        resolve();
      });

      child.stdout?.on("data", (data: string) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) addInstallLog(jobId, line);
        }
      });
      child.stderr?.on("data", (data: string) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) addInstallLog(jobId, line);
        }
      });
    });

    installStatuses.set(jobId, "complete");
    addInstallLog(jobId, "ClawHub skill installed!");
    addInstallLog(jobId, "__STATUS__:complete");
  } catch (err) {
    installStatuses.set(jobId, "failed");
    addInstallLog(jobId, `Failed: ${err instanceof Error ? err.message : String(err)}`);
    addInstallLog(jobId, "__STATUS__:failed");
  }

  cleanupInstall(jobId);
}

async function getManagedSkillsDir(): Promise<string> {
  const profileDir = await getProfileDir();

  // Get from skills list JSON
  try {
    const pFlag = await getProfileFlag();
    const cmd = `openclaw ${pFlag} skills list --json`.replace(/\s+/g, " ").trim();
    const raw = execCmd(cmd);
    const data = JSON.parse(raw);
    if (data.managedSkillsDir) {
      let dir = (data.managedSkillsDir as string).startsWith("~")
        ? (data.managedSkillsDir as string).replace("~", HOME)
        : data.managedSkillsDir as string;
      // Safety: never let the CLI point us at ~/.openclaw (the bare default dir)
      const defaultDir = join(HOME, ".openclaw");
      if (dir === defaultDir || dir.startsWith(defaultDir + "/")) {
        dir = join(profileDir, "skills");
      }
      const { mkdirSync } = require("node:fs");
      mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {}

  // Fallback: use active profile dir
  const fallback = join(profileDir, "skills");
  const { mkdirSync } = require("node:fs");
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function generateJobId(): string {
  return crypto.randomBytes(8).toString("hex");
}
