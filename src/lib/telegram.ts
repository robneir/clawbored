/**
 * Telegram integration helpers — config management, connection status,
 * and agent bindings.
 *
 * Telegram uses the Bot API via a token from @BotFather.
 * The gateway manages the bot connection automatically once configured.
 *
 * Setup flow:
 *   1. User creates a bot via @BotFather on Telegram
 *   2. Paste the bot token into Mission Control
 *   3. We write channels.telegram config to openclaw.json
 *   4. Gateway restart picks up the new channel
 *   5. User DMs the bot on Telegram — agent responds
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── openclaw.json config read/write ──

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

// ── Telegram channel config ──

export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
}

export function getTelegramConfig(profileDir: string): TelegramConfig | null {
  const config = readConfig(profileDir);
  if (!config?.channels?.telegram) return null;
  return {
    enabled: config.channels.telegram.enabled !== false,
    botToken: config.channels.telegram.botToken,
    botUsername: config.channels.telegram.botUsername,
  };
}

/**
 * Enable Telegram channel in openclaw.json with the given bot token.
 * Sets dmPolicy to "open" so the user can DM the bot immediately.
 */
export function enableTelegram(profileDir: string, botToken: string, botUsername?: string): boolean {
  const config = readConfig(profileDir) || {};
  if (!config.channels) config.channels = {};

  config.channels.telegram = {
    ...config.channels.telegram,
    botToken,
    dmPolicy: "open",
    allowFrom: ["*"],
    sendReadReceipts: true,
  };

  if (botUsername) {
    config.channels.telegram.botUsername = botUsername;
  }

  // Enable Telegram plugin
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  config.plugins.entries.telegram = {
    ...config.plugins.entries.telegram,
    enabled: true,
  };

  writeConfig(profileDir, config);
  return true;
}

/** Remove Telegram channel config, plugin, and all Telegram bindings. */
export function disableTelegram(profileDir: string) {
  const config = readConfig(profileDir);
  if (!config) return;

  if (config.channels?.telegram) {
    delete config.channels.telegram;
    if (Object.keys(config.channels).length === 0) delete config.channels;
  }

  // Disable plugin
  if (config.plugins?.entries?.telegram) {
    config.plugins.entries.telegram.enabled = false;
  }

  // Remove all telegram bindings
  if (config.bindings) {
    config.bindings = config.bindings.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.match?.channel !== "telegram"
    );
    if (config.bindings.length === 0) delete config.bindings;
  }

  writeConfig(profileDir, config);
}

// ── Connection status ──

/** Check if Telegram is configured with a bot token. */
export function isTelegramConnected(profileDir: string): boolean {
  const config = readConfig(profileDir);
  return !!(config?.channels?.telegram?.botToken);
}

// ── Agent bindings ──

export interface AgentTelegramBinding {
  accountId: string;
}

/** Read an agent's Telegram binding from openclaw.json. */
export function getAgentTelegramBinding(
  profileDir: string,
  agentId: string
): AgentTelegramBinding | null {
  const config = readConfig(profileDir);
  if (!config?.bindings) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binding = config.bindings.find((b: any) =>
    b.agentId === agentId && b.match?.channel === "telegram"
  );
  if (!binding) return null;

  return { accountId: binding.match?.accountId || "default" };
}

/** Save/upsert an agent's Telegram binding. Routes all Telegram DMs to this agent. */
export function saveAgentTelegramBinding(
  profileDir: string,
  agentId: string
) {
  const config = readConfig(profileDir) || {};
  if (!config.bindings) config.bindings = [];

  // Remove existing telegram binding for this agent
  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "telegram")
  );

  config.bindings.push({
    agentId,
    match: {
      channel: "telegram",
      accountId: "default",
    },
  });

  writeConfig(profileDir, config);
}

/** Remove an agent's Telegram binding. */
export function removeAgentTelegramBinding(
  profileDir: string,
  agentId: string
) {
  const config = readConfig(profileDir);
  if (!config?.bindings) return;

  config.bindings = config.bindings.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => !(b.agentId === agentId && b.match?.channel === "telegram")
  );
  if (config.bindings.length === 0) delete config.bindings;

  writeConfig(profileDir, config);
}

/**
 * Validate a Telegram bot token by calling the Bot API.
 * Returns the bot info if valid, null if invalid.
 */
export async function validateBotToken(token: string): Promise<{ username: string; name: string } | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.result) {
      return {
        username: data.result.username,
        name: data.result.first_name,
      };
    }
    return null;
  } catch {
    return null;
  }
}
