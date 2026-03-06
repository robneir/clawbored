import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readState } from "./mc-state";

const MC_DIR = join(homedir(), ".clawboard");
const NOTIFICATIONS_FILE = join(MC_DIR, "notifications.json");

/** A single notification event (agent response, error, etc.). */
export interface NotificationEvent {
  id: string;
  type: "message" | "error" | "gateway";
  profileName: string;
  agentId?: string;
  agentName?: string;
  title: string;
  preview?: string;
  timestamp: number;
  dismissed: boolean;
}

/** Persisted notification state. */
interface NotificationState {
  /** Key: "profileName:agentId", Value: epoch ms timestamp */
  lastRead: Record<string, number>;
  /** Key: "profileName:agentId", Value: last known session updatedAt */
  lastPollState: Record<string, number>;
  /** Rolling event log (max 50 entries) */
  events: NotificationEvent[];
}

/** Lightweight profile info — no health checks, just filesystem reads. */
interface LightProfile {
  name: string;
  dir: string;
  agents: Array<{ id: string }>;
}

/** Per-agent unread status for the active profile. */
export interface ActiveAgentUnread {
  agentId: string;
  hasUnread: boolean;
}

/** Per-profile unread count for non-active profiles. */
export interface OtherProfileUnread {
  profileName: string;
  unreadAgentCount: number;
}

/** Full unread summary returned by the API. */
export interface UnreadSummary {
  activeProfile: {
    profileName: string;
    agents: ActiveAgentUnread[];
  };
  otherProfiles: OtherProfileUnread[];
  totalUnreadProfiles: number;
}

// ---------------------------------------------------------------------------
// State read/write
// ---------------------------------------------------------------------------

function ensureDir(): void {
  if (!existsSync(MC_DIR)) mkdirSync(MC_DIR, { recursive: true });
}

function emptyState(): NotificationState {
  return { lastRead: {}, lastPollState: {}, events: [] };
}

function readNotificationState(): NotificationState {
  ensureDir();
  if (!existsSync(NOTIFICATIONS_FILE)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(NOTIFICATIONS_FILE, "utf-8"));
    return {
      lastRead: raw.lastRead || {},
      lastPollState: raw.lastPollState || {},
      events: raw.events || [],
    };
  } catch {
    return emptyState();
  }
}

function writeNotificationState(state: NotificationState): void {
  ensureDir();
  writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(state, null, 2));
}

/** Mark a specific agent chat as read (sets lastRead = now). */
export function markAsRead(profileName: string, agentId: string): void {
  const state = readNotificationState();
  state.lastRead[`${profileName}:${agentId}`] = Date.now();
  writeNotificationState(state);
}

// ---------------------------------------------------------------------------
// Lightweight profile detection (no network, no health checks)
// ---------------------------------------------------------------------------

function detectProfilesLight(): LightProfile[] {
  const HOME = homedir();
  let entries: string[];
  try {
    entries = readdirSync(HOME);
  } catch {
    return [];
  }

  const profiles: LightProfile[] = [];

  for (const entry of entries) {
    if (!entry.startsWith(".openclaw-")) continue;
    const dir = join(HOME, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const configPath = join(dir, "openclaw.json");
      if (!existsSync(configPath)) continue;
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const agentsList = (config?.agents?.list || []) as Array<{ id: string }>;
      const name = entry.replace(/^\.openclaw-/, "");
      profiles.push({
        name,
        dir,
        agents: agentsList.filter((a) => a.id),
      });
    } catch {
      continue;
    }
  }
  return profiles;
}

// ---------------------------------------------------------------------------
// Session timestamp reading
// ---------------------------------------------------------------------------

/**
 * Read the max updatedAt across non-cron sessions for one agent.
 * Only reads the small sessions.json index file, not JSONL data.
 */
function getSessionUpdatedAt(profileDir: string, agentId: string): number {
  const sessionsPath = join(
    profileDir,
    "agents",
    agentId,
    "sessions",
    "sessions.json"
  );
  if (!existsSync(sessionsPath)) return 0;

  try {
    const data: Record<string, { updatedAt?: number; sessionId?: string }> =
      JSON.parse(readFileSync(sessionsPath, "utf-8"));

    let maxUpdated = 0;
    for (const [key, entry] of Object.entries(data)) {
      if (key.includes(":cron:")) continue;
      if (!entry.sessionId) continue;
      if ((entry.updatedAt || 0) > maxUpdated) {
        maxUpdated = entry.updatedAt || 0;
      }
    }
    return maxUpdated;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main summary
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Event detection & CRUD
// ---------------------------------------------------------------------------

const MAX_EVENTS = 50;

/**
 * Detect new events by comparing current session timestamps against lastPollState.
 * Appends detected events, updates lastPollState, writes to disk.
 * Returns the full events list.
 */
export function detectAndAppendEvents(): NotificationEvent[] {
  const state = readNotificationState();
  const profiles = detectProfilesLight();
  const newEvents: NotificationEvent[] = [];

  for (const profile of profiles) {
    for (const agent of profile.agents) {
      const key = `${profile.name}:${agent.id}`;
      const currentUpdatedAt = getSessionUpdatedAt(profile.dir, agent.id);
      const lastPoll = state.lastPollState[key] || 0;
      const lastRead = state.lastRead[key] || 0;

      // New activity: session updated since last poll AND since last read
      if (currentUpdatedAt > lastPoll && currentUpdatedAt > lastRead) {
        newEvents.push({
          id: crypto.randomUUID(),
          type: "message",
          profileName: profile.name,
          agentId: agent.id,
          agentName: agent.id,
          title: "New response",
          preview: `${profile.name} / ${agent.id}`,
          timestamp: currentUpdatedAt,
          dismissed: false,
        });
      }

      // Always update lastPollState to current value
      state.lastPollState[key] = currentUpdatedAt;
    }
  }

  if (newEvents.length > 0) {
    state.events = [...state.events, ...newEvents].slice(-MAX_EVENTS);
  }
  writeNotificationState(state);
  return state.events;
}

/** Add a client-reported event (errors, gateway status changes). */
export function addEvent(
  event: Omit<NotificationEvent, "id" | "timestamp" | "dismissed">,
): NotificationEvent {
  const state = readNotificationState();
  const newEvent: NotificationEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dismissed: false,
  };
  state.events = [...state.events, newEvent].slice(-MAX_EVENTS);
  writeNotificationState(state);
  return newEvent;
}

/** Dismiss a single event by ID. */
export function dismissEvent(eventId: string): void {
  const state = readNotificationState();
  state.events = state.events.map((e) =>
    e.id === eventId ? { ...e, dismissed: true } : e,
  );
  writeNotificationState(state);
}

/** Dismiss all events. */
export function dismissAllEvents(): void {
  const state = readNotificationState();
  state.events = state.events.map((e) => ({ ...e, dismissed: true }));
  writeNotificationState(state);
}

/** Get count of undismissed events. */
export function getUndismissedCount(): number {
  const state = readNotificationState();
  return state.events.filter((e) => !e.dismissed).length;
}

// ---------------------------------------------------------------------------
// Main summary
// ---------------------------------------------------------------------------

/** Compute unread status across all profiles. */
export function getUnreadSummary(): UnreadSummary {
  const mcState = readState();
  const activeProfileName = mcState.activeProfile.profileName || "";
  const notifState = readNotificationState();
  const profiles = detectProfilesLight();

  const activeAgents: ActiveAgentUnread[] = [];
  const otherProfiles: OtherProfileUnread[] = [];
  let totalUnreadProfiles = 0;

  for (const profile of profiles) {
    const isActive = profile.name === activeProfileName;
    let profileUnreadCount = 0;

    for (const agent of profile.agents) {
      const key = `${profile.name}:${agent.id}`;
      const lastRead = notifState.lastRead[key] || 0;
      const updatedAt = getSessionUpdatedAt(profile.dir, agent.id);
      const hasUnread = updatedAt > 0 && updatedAt > lastRead;

      if (isActive) {
        activeAgents.push({ agentId: agent.id, hasUnread });
      }
      if (hasUnread) profileUnreadCount++;
    }

    if (!isActive) {
      otherProfiles.push({
        profileName: profile.name,
        unreadAgentCount: profileUnreadCount,
      });
      if (profileUnreadCount > 0) totalUnreadProfiles++;
    }
  }

  return {
    activeProfile: {
      profileName: activeProfileName,
      agents: activeAgents,
    },
    otherProfiles,
    totalUnreadProfiles,
  };
}
