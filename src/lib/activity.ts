import { readdirSync, createReadStream, statSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { getGateway } from "./gateway";
import { listAgents } from "./agents";

export type ActivityEventKind =
  | "user_message"
  | "assistant_response"
  | "tool_call"
  | "tool_result"
  | "model_change"
  | "session_start";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: number;
  preview: string;
  meta?: Record<string, string>;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
}

interface RawEvent {
  type: string;
  id: string;
  timestamp: string;
  message?: {
    role: "user" | "assistant" | "toolResult";
    content: ContentBlock[];
    timestamp: number;
  };
  model?: string;
  newModel?: string;
  sessionId?: string;
}

function parseEvent(
  raw: RawEvent,
  agentId: string,
  agentName: string,
  sessionId: string
): ActivityEvent | null {
  const ts =
    raw.message?.timestamp ??
    (raw.timestamp ? new Date(raw.timestamp).getTime() : 0);

  if (!ts) return null;

  const base = { agentId, agentName, sessionId, timestamp: ts };

  // Session start
  if (raw.type === "session") {
    return {
      ...base,
      id: `${sessionId}-session-${ts}`,
      kind: "session_start",
      preview: "Session started",
    };
  }

  // Model change
  if (raw.type === "model_change") {
    return {
      ...base,
      id: raw.id || `${sessionId}-model-${ts}`,
      kind: "model_change",
      preview: `Model changed to ${raw.newModel || raw.model || "unknown"}`,
      meta: { model: raw.newModel || raw.model || "" },
    };
  }

  if (raw.type !== "message" || !raw.message) return null;

  const { role, content } = raw.message;

  // User message
  if (role === "user") {
    const textBlock = content.find((b) => b.type === "text" && b.text);
    if (!textBlock) return null;
    return {
      ...base,
      id: raw.id,
      kind: "user_message",
      preview: textBlock.text!.slice(0, 120),
    };
  }

  // Assistant response
  if (role === "assistant") {
    // Check for tool calls first
    const toolCall = content.find((b) => b.type === "toolCall");
    if (toolCall) {
      return {
        ...base,
        id: raw.id,
        kind: "tool_call",
        preview: toolCall.name || "Unknown tool",
        meta: { toolName: toolCall.name || "" },
      };
    }

    // Text response
    const textBlocks = content.filter((b) => b.type === "text" && b.text);
    if (textBlocks.length === 0) return null;
    const text = textBlocks.map((b) => b.text!).join(" ").slice(0, 120);
    return {
      ...base,
      id: raw.id,
      kind: "assistant_response",
      preview: text,
    };
  }

  // Tool result
  if (role === "toolResult") {
    const textBlock = content.find((b) => b.type === "text" && b.text);
    return {
      ...base,
      id: raw.id,
      kind: "tool_result",
      preview: textBlock?.text?.slice(0, 80) || "Tool completed",
    };
  }

  return null;
}

export interface ActivityQuery {
  agentId?: string;
  eventKind?: ActivityEventKind;
  limit?: number;
  before?: number; // cursor: timestamp
}

/**
 * Get an activity feed from JSONL session files.
 * Reads up to 3 most recent sessions per agent for performance.
 */
export async function getActivityFeed(
  query: ActivityQuery = {}
): Promise<ActivityEvent[]> {
  const { agentId, eventKind, limit = 100, before } = query;
  const gw = await getGateway();

  // Get agents to process
  let agents: { id: string; displayName: string }[];
  if (agentId) {
    const allAgents = await listAgents();
    const match = allAgents.find((a) => a.id === agentId);
    agents = match ? [{ id: match.id, displayName: match.displayName }] : [];
  } else {
    const allAgents = await listAgents();
    agents = allAgents.map((a) => ({ id: a.id, displayName: a.displayName }));
  }

  const allEvents: ActivityEvent[] = [];

  for (const agent of agents) {
    const sessionsDir = join(
      gw.profileDir,
      "agents",
      agent.id,
      "sessions"
    );
    if (!existsSync(sessionsDir)) continue;

    // Find JSONL files, sort by mtime desc, take top 3
    let files: { name: string; mtime: number }[];
    try {
      files = readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({
          name: f,
          mtime: statSync(join(sessionsDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 3);
    } catch {
      continue;
    }

    for (const file of files) {
      const sessionId = file.name.replace(".jsonl", "");
      const filePath = join(sessionsDir, file.name);

      const rl = createInterface({
        input: createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) continue;

        let raw: RawEvent;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }

        const event = parseEvent(raw, agent.id, agent.displayName, sessionId);
        if (!event) continue;

        // Apply filters
        if (eventKind && event.kind !== eventKind) continue;
        if (before && event.timestamp >= before) continue;

        allEvents.push(event);
      }
    }
  }

  // Sort by timestamp descending and limit
  allEvents.sort((a, b) => b.timestamp - a.timestamp);
  return allEvents.slice(0, limit);
}
