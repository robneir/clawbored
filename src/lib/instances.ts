import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const MC_STATE = join(HOME, ".mission-control");
const REGISTRY = join(MC_STATE, "instances.json");
const BASE_PORT = 19100;

export interface Instance {
  name: string;
  displayName: string;
  port: number;
  token: string | null;
  template: string;
  createdAt: string;
  profileDir: string;
  pid: number | null;
  status: string;
  live?: boolean;
}

function ensureState() {
  if (!existsSync(MC_STATE)) mkdirSync(MC_STATE, { recursive: true });
  if (!existsSync(REGISTRY)) writeFileSync(REGISTRY, "[]");
}

function loadRegistry(): Instance[] {
  ensureState();
  try {
    return JSON.parse(readFileSync(REGISTRY, "utf-8"));
  } catch {
    return [];
  }
}

function saveRegistry(data: Instance[]) {
  ensureState();
  writeFileSync(REGISTRY, JSON.stringify(data, null, 2));
}

export function getInstance(name: string): Instance {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);
  return inst;
}

export async function listInstances(): Promise<Instance[]> {
  const registry = loadRegistry();
  const enriched = await Promise.all(
    registry.map(async (inst) => {
      const live = await checkAlive(inst);
      return { ...inst, live };
    })
  );
  return enriched;
}

export function getNextPort(): number {
  const registry = loadRegistry();
  if (registry.length === 0) return BASE_PORT;
  const maxPort = Math.max(...registry.map((i) => i.port));
  return maxPort + 1;
}

export async function registerInstance({
  name,
  displayName,
  port,
  token,
  template,
  profileDir,
}: {
  name: string;
  displayName?: string;
  port?: number;
  token?: string | null;
  template?: string;
  profileDir?: string;
}): Promise<Instance> {
  const registry = loadRegistry();
  if (registry.find((i) => i.name === name)) {
    throw new Error(`Instance '${name}' already exists in registry`);
  }
  const instance: Instance = {
    name,
    displayName: displayName || name,
    port: port || BASE_PORT + registry.length,
    token: token || null,
    template: template || "general",
    createdAt: new Date().toISOString(),
    profileDir: profileDir || join(HOME, `.openclaw-${name}`),
    pid: null,
    status: "ready",
  };
  registry.push(instance);
  saveRegistry(registry);
  return instance;
}

export async function updateInstance(name: string, updates: Partial<Instance>): Promise<Instance> {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);
  Object.assign(inst, updates);
  saveRegistry(registry);
  return inst;
}

export async function startInstance(name: string) {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);

  const alive = await checkAlive(inst);
  if (alive) return { ...inst, live: true, message: "Already running" };

  let ocPath: string;
  try {
    ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("openclaw CLI not found");
  }

  const child = spawn(ocPath, ["--profile", name, "gateway", "--port", String(inst.port)], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();
  inst.pid = child.pid || null;
  saveRegistry(registry);

  await new Promise((r) => setTimeout(r, 2000));
  const live = await checkAlive(inst);
  return { ...inst, live, message: live ? "Started" : "Starting..." };
}

export async function stopInstance(name: string) {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);

  if (inst.pid) {
    try {
      process.kill(inst.pid, "SIGTERM");
    } catch {}
    inst.pid = null;
    saveRegistry(registry);
  }
  try {
    execSync(`lsof -ti:${inst.port} | xargs kill -TERM 2>/dev/null`, { stdio: "pipe" });
  } catch {}
  return { ...inst, live: false, message: "Stopped" };
}

export async function deleteInstance(name: string) {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);

  const cleaned: string[] = [];

  await stopInstance(name);
  cleaned.push("process");

  const profileDir = inst.profileDir || join(HOME, `.openclaw-${name}`);
  if (existsSync(profileDir)) {
    rmSync(profileDir, { recursive: true, force: true });
    cleaned.push(`profileDir: ${profileDir}`);
  }

  const plistPath = join(HOME, "Library", "LaunchAgents", `ai.openclaw.gateway-${name}.plist`);
  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "pipe" });
    } catch {}
    rmSync(plistPath, { force: true });
    cleaned.push(`launchAgent: ${plistPath}`);
  }

  try {
    const pids = execSync(`lsof -ti:${inst.port} 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {}
      }
      cleaned.push(`killed pids on port ${inst.port}`);
    }
  } catch {}

  const updated = registry.filter((i) => i.name !== name);
  saveRegistry(updated);
  cleaned.push("registry");

  return { message: `Instance '${name}' fully deleted`, cleaned };
}

export async function deleteAllInstances() {
  const registry = loadRegistry();
  const results = [];
  for (const inst of registry) {
    try {
      const r = await deleteInstance(inst.name);
      results.push({ name: inst.name, ...r });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: inst.name, error: message });
    }
  }
  saveRegistry([]);
  return { message: `Deleted ${results.length} instances`, results };
}

async function checkAlive(inst: Instance): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${inst.port}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.status < 500;
  } catch {
    return false;
  }
}
