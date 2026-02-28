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
  let dirty = false;
  const enriched = await Promise.all(
    registry.map(async (inst) => {
      const live = await checkAlive(inst);
      // Fill in missing token from config file
      if (!inst.token) {
        const configPath = join(inst.profileDir || join(HOME, `.openclaw-${inst.name}`), "openclaw.json");
        if (existsSync(configPath)) {
          try {
            const config = JSON.parse(readFileSync(configPath, "utf-8"));
            const token = config?.gateway?.auth?.token || config?.gateway?.token || null;
            if (token) {
              inst.token = token;
              dirty = true;
            }
          } catch {}
        }
      }
      return { ...inst, live };
    })
  );
  if (dirty) saveRegistry(registry);
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

  // If token is missing, try to read it from the config
  if (!inst.token) {
    const configPath = join(inst.profileDir || join(HOME, `.openclaw-${name}`), "openclaw.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const token = config?.gateway?.auth?.token || config?.gateway?.token || null;
        if (token) {
          inst.token = token;
          saveRegistry(registry);
        }
      } catch {}
    }
  }

  let ocPath: string;
  try {
    ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("openclaw CLI not found");
  }

  // Ensure anti-idle config is present before starting
  ensureGatewayConfig(name, inst.profileDir || join(HOME, `.openclaw-${name}`));

  // Ensure gateway service is properly installed as a LaunchAgent
  try {
    execSync(`${ocPath} --profile ${name} gateway install`, {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env },
      stdio: "pipe",
    });
  } catch {
    // Already installed or unsupported — continue
  }

  // Run doctor --fix to repair any service config issues
  try {
    execSync(`${ocPath} --profile ${name} doctor --fix`, {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env },
      stdio: "pipe",
    });
  } catch {
    // Non-fatal — continue
  }

  // Start the gateway via the installed LaunchAgent service
  try {
    execSync(`${ocPath} --profile ${name} gateway start`, {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env },
      stdio: "pipe",
    });
  } catch {
    // Fall back to running in foreground detached
    const child = spawn(ocPath, ["--profile", name, "gateway", "run", "--port", String(inst.port)], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
    inst.pid = child.pid || null;
    saveRegistry(registry);
  }

  // Wait for gateway to be ready, with retries
  let live = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    live = await checkAlive(inst);
    if (live) break;
  }
  return { ...inst, live, message: live ? "Started" : "Starting..." };
}

export async function stopInstance(name: string) {
  const registry = loadRegistry();
  const inst = registry.find((i) => i.name === name);
  if (!inst) throw new Error(`Instance '${name}' not found`);

  // Try gateway stop (launchd service) first
  try {
    const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
    execSync(`${ocPath} --profile ${name} gateway stop`, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
  } catch {}

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

  // Try to uninstall the gateway service first
  try {
    const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
    execSync(`${ocPath} --profile ${name} gateway stop 2>/dev/null`, { stdio: "pipe", timeout: 5000 });
    execSync(`${ocPath} --profile ${name} gateway uninstall 2>/dev/null`, { stdio: "pipe", timeout: 5000 });
    cleaned.push("gateway service uninstalled");
  } catch {}

  await stopInstance(name);
  cleaned.push("process");

  const profileDir = inst.profileDir || join(HOME, `.openclaw-${name}`);
  if (existsSync(profileDir)) {
    rmSync(profileDir, { recursive: true, force: true });
    cleaned.push(`profileDir: ${profileDir}`);
  }

  // Check for LaunchAgent plist files with various naming patterns
  const plistPatterns = [
    `ai.openclaw.gateway-${name}.plist`,
    `ai.openclaw.${name}.plist`,
    `com.openclaw.gateway-${name}.plist`,
  ];
  for (const plistName of plistPatterns) {
    const plistPath = join(HOME, "Library", "LaunchAgents", plistName);
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "pipe" });
      } catch {}
      rmSync(plistPath, { force: true });
      cleaned.push(`launchAgent: ${plistPath}`);
    }
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

/**
 * Ensure the openclaw.json config has heartbeat and session settings
 * to prevent idle gateway disconnection.
 */
function ensureGatewayConfig(name: string, profileDir: string) {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    let dirty = false;

    // Ensure agents.defaults.heartbeat is set to prevent idle disconnect
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.heartbeat || !config.agents.defaults.heartbeat.every) {
      config.agents.defaults.heartbeat = {
        ...config.agents.defaults.heartbeat,
        every: "5m",
      };
      dirty = true;
    }

    // Disable session idle reset (prevents "closed | idle" disconnects)
    if (!config.session) config.session = {};
    if (!config.session.reset || config.session.reset.idleMinutes === undefined) {
      config.session.reset = {
        ...config.session.reset,
        idleMinutes: 1440,
      };
      dirty = true;
    }

    if (dirty) {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  } catch {
    // Non-fatal — config may be malformed
  }
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
