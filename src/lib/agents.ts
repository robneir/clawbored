import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { getGateway } from "./gateway";

export interface Agent {
  id: string;
  displayName: string;
  template: string;
  workspace: string;
  agentDir: string;
  model: string;
  soulMd: string | null;
  status: string;
  createdAt: string;
  avatar: string;
}

// Default emoji pool — assigned round-robin on creation
const DEFAULT_AVATARS = [
  "🤖", "🧠", "🔮", "⚡", "🎯", "🚀", "🌟", "💎",
  "🔥", "🎨", "🦊", "🐙", "🌊", "🎪", "🎵", "🦋",
];

// ── MC Metadata (avatars, display names, etc.) ──────────────────────

interface McAgentMeta {
  avatar?: string;
  displayName?: string;
  template?: string;
  createdAt?: string;
}

interface McMetadata {
  agents: Record<string, McAgentMeta>;
}

function getMcMetadataPath(profileDir: string): string {
  return join(profileDir, "mc-metadata.json");
}

function getMcMetadata(profileDir: string): McMetadata {
  const path = getMcMetadataPath(profileDir);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {}
  }
  return { agents: {} };
}

function saveMcMetadata(profileDir: string, meta: McMetadata): void {
  writeFileSync(getMcMetadataPath(profileDir), JSON.stringify(meta, null, 2));
}

// ── SOUL Templates ──────────────────────────────────────────────────

const SOUL_TEMPLATES: Record<string, string> = {
  general: `# {{name}}

You are a helpful general-purpose AI assistant.

## Personality
- Friendly and approachable
- Clear and concise in responses
- Proactive about asking clarifying questions

## Boundaries
- Always be honest about your limitations
- Prioritize accuracy over speed
`,
  coding: `# {{name}}

You are an expert software engineer and coding assistant.

## Personality
- Precise and detail-oriented
- Favor clean, maintainable code
- Explain trade-offs when presenting solutions

## Expertise
- Full-stack development
- System design and architecture
- Debugging and performance optimization

## Style
- Show code examples when helpful
- Suggest tests for important logic
- Follow established conventions in the codebase
`,
  research: `# {{name}}

You are a thorough research assistant.

## Personality
- Analytical and methodical
- Cite sources when possible
- Present multiple perspectives on complex topics

## Approach
- Break complex questions into smaller parts
- Distinguish between facts and opinions
- Acknowledge uncertainty when appropriate
`,
  custom: `# {{name}}

You are an AI assistant.

## Personality
<!-- Define your agent's personality here -->

## Expertise
<!-- What is this agent specialized in? -->

## Boundaries
<!-- What should this agent avoid? -->
`,
};

// ── Helpers ──────────────────────────────────────────────────────────

function readConfig(profileDir: string): Record<string, unknown> {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function writeConfig(profileDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(profileDir, "openclaw.json"), JSON.stringify(config, null, 2));
}

function getAgentsList(config: Record<string, unknown>): Array<{
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
}> {
  const agents = config.agents as Record<string, unknown> | undefined;
  return ((agents?.list || []) as Array<{ id: string; name?: string; workspace?: string; agentDir?: string; model?: string }>);
}

function buildAgent(
  entry: { id: string; name?: string; workspace?: string; agentDir?: string; model?: string },
  profileDir: string,
  meta: McAgentMeta,
): Agent {
  const workspace = entry.workspace || join(profileDir, "workspaces", entry.id);
  const agentDir = entry.agentDir || join(profileDir, "agents", entry.id, "agent");

  // Read SOUL.md from workspace
  let soulMd: string | null = null;
  const soulPath = join(workspace, "SOUL.md");
  if (existsSync(soulPath)) {
    try { soulMd = readFileSync(soulPath, "utf-8"); } catch {}
  }

  return {
    id: entry.id,
    displayName: meta.displayName || entry.name || entry.id,
    template: meta.template || "custom",
    workspace,
    agentDir,
    model: entry.model || "default",
    soulMd,
    status: "active",
    createdAt: meta.createdAt || new Date().toISOString(),
    avatar: meta.avatar || "",
  };
}

// ── CRUD Operations ─────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  const gw = await getGateway();
  if (!gw.profileDir || gw.status === "not_setup") return [];

  const config = readConfig(gw.profileDir);
  const agentsList = getAgentsList(config);
  const mcMeta = getMcMetadata(gw.profileDir);

  return agentsList
    .filter((entry) => entry.id)
    .map((entry) => buildAgent(entry, gw.profileDir, mcMeta.agents[entry.id] || {}));
}

export async function getAgent(id: string): Promise<Agent> {
  const gw = await getGateway();
  if (!gw.profileDir) throw new Error("Gateway not set up");

  const config = readConfig(gw.profileDir);
  const agentsList = getAgentsList(config);
  const entry = agentsList.find((a) => a.id === id);

  if (!entry) throw new Error(`Agent '${id}' not found`);

  const mcMeta = getMcMetadata(gw.profileDir);
  return buildAgent(entry, gw.profileDir, mcMeta.agents[id] || {});
}

export async function createAgent({
  id,
  displayName,
  template,
  model,
  soulMdContent,
  skipConfigSync,
  avatar,
}: {
  id: string;
  displayName?: string;
  template?: string;
  model?: string;
  soulMdContent?: string;
  skipConfigSync?: boolean;
  avatar?: string;
}): Promise<Agent> {
  const gw = await getGateway();
  if (!gw.profileDir) throw new Error("Gateway not set up");

  const resolvedTemplate = template || "general";
  const resolvedName = displayName || id;
  const workspace = join(gw.profileDir, "workspaces", id);
  const agentDir = join(gw.profileDir, "agents", id, "agent");

  // Check if agent already exists
  const config = readConfig(gw.profileDir);
  const agentsList = getAgentsList(config);
  if (agentsList.some((a) => a.id === id)) {
    throw new Error(`Agent '${id}' already exists`);
  }

  // 1. Create directories
  mkdirSync(workspace, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  // 2. Write SOUL.md
  const soulContent = soulMdContent ||
    (SOUL_TEMPLATES[resolvedTemplate] || SOUL_TEMPLATES.general)
      .replace(/\{\{name\}\}/g, resolvedName);
  writeFileSync(join(workspace, "SOUL.md"), soulContent);

  // 3. Update openclaw.json agents.list (skip if importing existing agent)
  if (!skipConfigSync) {
    const agents = config.agents as Record<string, unknown> || {};
    if (!agents.list) agents.list = [];
    (agents.list as Array<Record<string, string>>).push({
      id,
      name: resolvedName,
      workspace,
      agentDir,
      ...(model && model !== "default" ? { model } : {}),
    });
    config.agents = agents;
    writeConfig(gw.profileDir, config);
  }

  // 4. Copy auth-profiles.json from main agent if available (skip if importing)
  if (!skipConfigSync) {
    const mainAuthPath = join(gw.profileDir, "agents", "main", "agent", "auth-profiles.json");
    const newAuthPath = join(agentDir, "auth-profiles.json");
    if (existsSync(mainAuthPath) && !existsSync(newAuthPath)) {
      try { copyFileSync(mainAuthPath, newAuthPath); } catch {}
    }
  }

  // 5. Pick a default avatar if none provided
  let resolvedAvatar = avatar || "";
  if (!resolvedAvatar) {
    const idx = agentsList.length % DEFAULT_AVATARS.length;
    resolvedAvatar = DEFAULT_AVATARS[idx];
  }

  // 6. Save MC metadata (avatar, display name, template, created timestamp)
  const mcMeta = getMcMetadata(gw.profileDir);
  mcMeta.agents[id] = {
    avatar: resolvedAvatar,
    displayName: resolvedName,
    template: resolvedTemplate,
    createdAt: new Date().toISOString(),
  };
  saveMcMetadata(gw.profileDir, mcMeta);

  return {
    id,
    displayName: resolvedName,
    template: resolvedTemplate,
    workspace,
    agentDir,
    model: model || "default",
    soulMd: soulContent,
    status: "active",
    createdAt: mcMeta.agents[id].createdAt!,
    avatar: resolvedAvatar,
  };
}

export async function updateAgent(
  id: string,
  updates: {
    displayName?: string;
    model?: string;
    soulMdContent?: string;
    status?: string;
    avatar?: string;
  }
): Promise<Agent> {
  const gw = await getGateway();
  if (!gw.profileDir) throw new Error("Gateway not set up");

  const agent = await getAgent(id);

  // Update SOUL.md on disk if changed
  if (updates.soulMdContent !== undefined) {
    writeFileSync(join(agent.workspace, "SOUL.md"), updates.soulMdContent);
  }

  // Update openclaw.json if name or model changed
  if (updates.displayName !== undefined || updates.model !== undefined) {
    const config = readConfig(gw.profileDir);
    const agentsList = getAgentsList(config);
    const entry = agentsList.find((a) => a.id === id);
    if (entry) {
      if (updates.displayName !== undefined) entry.name = updates.displayName;
      if (updates.model !== undefined) {
        if (updates.model === "default") {
          delete entry.model;
        } else {
          entry.model = updates.model;
        }
      }
      writeConfig(gw.profileDir, config);
    }
  }

  // Update MC metadata
  const mcMeta = getMcMetadata(gw.profileDir);
  if (!mcMeta.agents[id]) mcMeta.agents[id] = {};
  if (updates.displayName !== undefined) mcMeta.agents[id].displayName = updates.displayName;
  if (updates.avatar !== undefined) mcMeta.agents[id].avatar = updates.avatar;
  saveMcMetadata(gw.profileDir, mcMeta);

  // Return updated agent
  return getAgent(id);
}

export async function deleteAgent(id: string): Promise<void> {
  const gw = await getGateway();
  if (!gw.profileDir) throw new Error("Gateway not set up");

  const agent = await getAgent(id);

  // 1. Remove from openclaw.json
  const config = readConfig(gw.profileDir);
  const agents = config.agents as Record<string, unknown> | undefined;
  if (agents?.list) {
    agents.list = (agents.list as Array<{ id: string }>).filter((a) => a.id !== id);
    writeConfig(gw.profileDir, config);
  }

  // 2. Remove from MC metadata
  const mcMeta = getMcMetadata(gw.profileDir);
  delete mcMeta.agents[id];
  saveMcMetadata(gw.profileDir, mcMeta);

  // 3. Clean up workspace
  if (existsSync(agent.workspace)) {
    rmSync(agent.workspace, { recursive: true, force: true });
  }

  // 4. Clean up agentDir
  const agentParent = join(gw.profileDir, "agents", id);
  if (existsSync(agentParent)) {
    rmSync(agentParent, { recursive: true, force: true });
  }
}

export async function getAgentSoulMd(id: string): Promise<string> {
  const agent = await getAgent(id);
  const soulPath = join(agent.workspace, "SOUL.md");
  if (existsSync(soulPath)) {
    return readFileSync(soulPath, "utf-8");
  }
  return agent.soulMd || "";
}

export async function saveAgentSoulMd(id: string, content: string): Promise<void> {
  const agent = await getAgent(id);
  writeFileSync(join(agent.workspace, "SOUL.md"), content);
}

export async function cloneAgent(sourceId: string): Promise<Agent> {
  const source = await getAgent(sourceId);

  // Generate unique clone ID
  let cloneId = `${sourceId}-copy`;
  let attempt = 1;
  while (true) {
    try {
      await getAgent(cloneId);
      attempt++;
      cloneId = `${sourceId}-copy-${attempt}`;
    } catch {
      break; // ID is available
    }
  }

  // Read SOUL.md from source workspace
  const soulPath = join(source.workspace, "SOUL.md");
  let soulContent: string | undefined;
  if (existsSync(soulPath)) {
    soulContent = readFileSync(soulPath, "utf-8");
  } else {
    soulContent = source.soulMd || undefined;
  }

  // Create clone
  const clone = await createAgent({
    id: cloneId,
    displayName: `${source.displayName} (Copy)`,
    template: source.template,
    model: source.model,
    soulMdContent: soulContent,
  });

  // Copy auth-profiles.json from source agent
  const sourceAuthPath = join(source.agentDir, "auth-profiles.json");
  const cloneAuthPath = join(clone.agentDir, "auth-profiles.json");
  if (existsSync(sourceAuthPath)) {
    copyFileSync(sourceAuthPath, cloneAuthPath);
  }

  return clone;
}
