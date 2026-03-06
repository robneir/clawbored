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
/** Agents are considered "busy" if their session was updated within this window. */
const BUSY_THRESHOLD_MS = 15_000;

/**
 * Detect new events by comparing current session timestamps against lastPollState.
 * Only creates notification events once the agent is idle (not busy), so the user
 * is only notified when the agent needs their input — not on every intermediate message.
 * Appends detected events, updates lastPollState, writes to disk.
 * Returns the full events list.
 */
export function detectAndAppendEvents(): NotificationEvent[] {
  const state = readNotificationState();
  const profiles = detectProfilesLight();
  const newEvents: NotificationEvent[] = [];
  const now = Date.now();

  for (const profile of profiles) {
    for (const agent of profile.agents) {
      const key = `${profile.name}:${agent.id}`;
      const currentUpdatedAt = getSessionUpdatedAt(profile.dir, agent.id);
      const lastPoll = state.lastPollState[key] || 0;

      // Agent is busy if session was updated very recently — defer notification
      const isBusy = currentUpdatedAt > 0 && now - currentUpdatedAt < BUSY_THRESHOLD_MS;
      if (isBusy) continue; // Don't update lastPollState either — check again next tick

      // New activity: session updated since last poll (skip first poll to avoid flood)
      if (currentUpdatedAt > lastPoll && lastPoll > 0) {
        // Deduplicate: skip if there's already an undismissed event for this agent
        // within the last 60 seconds
        const recentCutoff = now - 60_000;
        const alreadyNotified = state.events.some(
          (e) =>
            e.type === "message" &&
            e.agentId === agent.id &&
            e.profileName === profile.name &&
            !e.dismissed &&
            e.timestamp > recentCutoff,
        );

        if (!alreadyNotified) {
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
      }

      // Only update lastPollState when agent is idle
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
      // Only mark unread when the agent is idle (not busy) — avoids
      // notifications while the agent is still working on a response
      const isBusy = updatedAt > 0 && Date.now() - updatedAt < BUSY_THRESHOLD_MS;
      const hasUnread = updatedAt > 0 && updatedAt > lastRead && !isBusy;

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
