import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DISCORD_API = "https://discord.com/api/v10";

// ── Discord REST API helpers (for setup UI only) ────────────

export interface DiscordBotUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

export async function validateBotToken(
  token: string
): Promise<{ valid: boolean; bot?: DiscordBotUser }> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    return {
      valid: true,
      bot: {
        id: data.id,
        username: data.username,
        discriminator: data.discriminator || "0",
        avatar: data.avatar,
      },
    };
  } catch {
    return { valid: false };
  }
}

export async function getBotApplicationId(
  token: string
): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/oauth2/applications/@me`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch {
    return null;
  }
}

export async function getBotGuilds(
  token: string
): Promise<DiscordGuild[]> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((g: { id: string; name: string; icon: string | null }) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));
  } catch {
    return [];
  }
}

export async function getGuildChannels(
  token: string,
  guildId: string
): Promise<DiscordChannel[]> {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // type 0 = text channel
    return (data || [])
      .filter((c: { type: number }) => c.type === 0)
      .map((c: { id: string; name: string; type: number; position: number }) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
      }))
      .sort((a: DiscordChannel, b: DiscordChannel) => a.position - b.position);
  } catch {
    return [];
  }
}

export function generateInviteUrl(applicationId: string): string {
  // Permissions: VIEW_CHANNEL (1<<10=1024) + SEND_MESSAGES (1<<11=2048) + READ_MESSAGE_HISTORY (1<<16=65536) = 68608
  return `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=68608&scope=bot`;
}

// ── openclaw.json config read/write ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readConfig(profileDir: string): any | null {
  const configPath = join(profileDir, "openclaw.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeConfig(profileDir: string, config: any) {
  const configPath = join(profileDir, "openclaw.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export interface DiscordChannelConfig {
  enabled: boolean;
  token: string;
}

/** Read the channels.discord section from openclaw.json. */
export function getDiscordConfig(
  profileDir: string
): DiscordChannelConfig | null {
  const config = readConfig(profileDir);
  if (!config?.channels?.discord) return null;
  const dc = config.channels.discord;
  return {
    enabled: dc.enabled ?? false,
    token: dc.token || "",
  };
}

/** Save a Discord bot token to channels.discord in openclaw.json. */
export function saveDiscordChannel(profileDir: string, token: string) {
  const config = readConfig(profileDir) || {};
  if (!config.channels) config.channels = {};
  config.channels.discord = {
    ...config.channels.discord,
    enabled: true,
    token,
  };
  writeConfig(profileDir, config);
}

/** Remove the Discord channel config from openclaw.json. */
export function removeDiscordChannel(profileDir: string) {
  const config = readConfig(profileDir);
  if (!config?.channels?.discord) return;
  delete config.channels.discord;
  if (Object.keys(config.channels).length === 0) delete config.channels;

  // Also remove all discord bindings
  if (config.bindings) {
    config.bindings = config.bindings.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.match?.channel !== "discord"
    );
    if (config.bindings.length === 0) delete config.bindings;
  }

  writeConfig(profileDir, config);
}

export interface AgentDiscordBinding {
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
}

/** Read a specific agent's Discord binding from openclaw.json. */
export function getAgentBinding(
  profileDir: string,
  agentId: string
): AgentDiscordBinding | null {
  const config = readConfig(profileDir);
  if (!config?.bindings) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binding = config.bindings.find((b: any) =>
    b.agentId === agentId && b.match?.channel === "discord"
  );
  if (!binding) return null;

  return {
    guildId: binding.match?.guildId || "",
    guildName: binding.meta?.guildName || "",
    channelId: binding.match?.channelId || "",
    channelName: binding.meta?.channelName || "",
  };
}

/** Save/upsert an agent's Discord binding in openclaw.json. */
export function saveAgentBinding(
  profileDir: string,
  agentId: string,
  guildId: string,
  guildName: string,
  channelId: string,
  channelName: string
) {
  const config = readConfig(profileDir) || {};
  if (!config.bindings) config.bindings = [];

  // Remove existing discord binding for this agent
  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "discord")
  );

  config.bindings.push({
    agentId,
    match: {
      channel: "discord",
      guildId,
      channelId,
    },
    meta: {
      guildName,
      channelName,
    },
  });

  writeConfig(profileDir, config);
}

/** Remove an agent's Discord binding from openclaw.json. */
export function removeAgentBinding(
  profileDir: string,
  agentId: string
) {
  const config = readConfig(profileDir);
  if (!config?.bindings) return;

  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "discord")
  );
  if (config.bindings.length === 0) delete config.bindings;

  writeConfig(profileDir, config);
}
