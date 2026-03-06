import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { getGateway } from "./gateway";

/** Shape of entries in sessions.json */
interface SessionEntry {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  model?: string;
  modelProvider?: string;
}

/** A content block inside a JSONL message event */
interface ContentBlock {
  type: string;
  text?: string;
}

/** Shape of a JSONL message event */
interface JournalEvent {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: {
    role: "user" | "assistant" | "toolResult";
    content: ContentBlock[];
    timestamp: number;
  };
}

/** Output shape matching chat page ChatMessage interface */
export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status: "sent";
}

/** Session summary for multi-session picker */
export interface SessionSummary {
  sessionId: string;
  updatedAt: number;
  model?: string;
  modelProvider?: string;
  messageCount: number;
  firstMessagePreview: string;
}

/** Lightweight preview for sidebar */
export interface SessionPreview {
  lastMessage: string;
  lastRole: "user" | "assistant";
  timestamp: number;
}

/**
 * Read the sessions.json index for a given agent.
 * Returns session entries sorted by updatedAt descending.
 * Filters out cron sessions (automated, not interactive).
 */
export async function getSessionIndex(agentId: string): Promise<SessionEntry[]> {
  const gw = await getGateway();
  const sessionsPath = join(gw.profileDir, "agents", agentId, "sessions", "sessions.json");

  if (!existsSync(sessionsPath)) return [];

  let data: Record<string, SessionEntry>;
  try {
    data = JSON.parse(readFileSync(sessionsPath, "utf-8"));
  } catch {
    return [];
  }

  const entries: SessionEntry[] = [];
  for (const [key, entry] of Object.entries(data)) {
    // Skip cron-triggered sessions
    if (key.includes(":cron:")) continue;
    if (!entry.sessionId) continue;
    entries.push(entry);
  }

  // Most recent first
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return entries;
}

/**
 * Resolve the JSONL file path for a session entry.
 */
async function resolveSessionFile(agentId: string, entry: SessionEntry): Promise<string | null> {
  // Prefer the sessionFile path if it exists on disk
  if (entry.sessionFile && existsSync(entry.sessionFile)) {
    return entry.sessionFile;
  }

  // Fallback: construct the path
  const gw = await getGateway();
  const constructed = join(gw.profileDir, "agents", agentId, "sessions", `${entry.sessionId}.jsonl`);
  if (existsSync(constructed)) return constructed;

  return null;
}

/**
 * Extract visible text content from a message's content array.
 * For user messages: first text block.
 * For assistant messages: all text blocks joined.
 * Skips thinking, toolCall, and other non-text blocks.
 */
function extractTextContent(content: ContentBlock[], role: "user" | "assistant"): string | null {
  const textBlocks = content.filter((b) => b.type === "text" && b.text);

  if (textBlocks.length === 0) return null;

  if (role === "user") {
    return textBlocks[0].text!.trim();
  }

  // Assistant: join all text blocks
  return textBlocks.map((b) => b.text!).join("\n\n").trim();
}

/**
 * Detect whether a user message is an OpenClaw webchat context block.
 * These contain the full conversation history bundled into one JSONL "user" event.
 */
function isContextBlock(text: string): boolean {
  return (
    text.startsWith("[Chat messages since") ||
    text.includes("[Current message - respond to this]")
  );
}

/**
 * Parse an OpenClaw webchat context block into individual user/assistant messages.
 *
 * Context blocks look like:
 *   [Chat messages since your last reply - for context]
 *   User: hello
 *   Assistant: Hi there! ...
 *   [Current message - respond to this]
 *   User: next message
 *   Assistant: response...
 *   [Current message - respond to this]
 *   User: latest message
 *
 * Consecutive Assistant: lines (within one turn) are merged into a single message.
 */
function parseContextBlock(text: string, baseTimestamp: number): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  const lines = text.split("\n");

  let currentRole: "user" | "assistant" | null = null;
  let currentText = "";
  let idx = 0;

  function flush() {
    if (currentRole && currentText.trim()) {
      messages.push({
        id: `history-${idx}`,
        role: currentRole,
        content: currentText.trim(),
        timestamp: baseTimestamp - (10000 - idx * 100),
        status: "sent" as const,
      });
      idx++;
    }
    currentRole = null;
    currentText = "";
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip section headers
    if (
      trimmed.startsWith("[Chat messages since") ||
      trimmed.startsWith("[Current message")
    ) {
      continue;
    }

    // Blank line — preserve paragraph breaks within a message
    if (!trimmed) {
      if (currentText) currentText += "\n";
      continue;
    }

    // User: prefix
    const userMatch = trimmed.match(/^User:\s*([\s\S]*)/);
    if (userMatch) {
      const body = userMatch[1];
      // Skip nested context-injection markers (noise from recursive wrapping)
      if (body.startsWith("[Chat messages since")) continue;

      flush();
      currentRole = "user";
      currentText = body;
      continue;
    }

    // Assistant: prefix
    const asstMatch = trimmed.match(/^Assistant:\s*([\s\S]*)/);
    if (asstMatch) {
      if (currentRole === "assistant") {
        // Merge consecutive assistant lines into one response
        currentText += "\n\n" + asstMatch[1];
      } else {
        flush();
        currentRole = "assistant";
        currentText = asstMatch[1];
      }
      continue;
    }

    // Continuation line — belongs to current message
    if (currentRole) {
      currentText += "\n" + line;
    }
  }

  flush();
  return messages;
}

/**
 * List all interactive sessions for an agent with summary data.
 * Scans each JSONL to count messages and get a preview.
 * Handles context-block sessions by parsing embedded turns.
 */
export async function listSessions(agentId: string): Promise<SessionSummary[]> {
  const entries = await getSessionIndex(agentId);
  if (entries.length === 0) return [];

  const summaries: SessionSummary[] = [];

  for (const entry of entries) {
    const filePath = await resolveSessionFile(agentId, entry);
    if (!filePath) continue;

    let messageCount = 0;
    let firstMessagePreview = "";

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    let foundContextBlock = false;
    let countedTrailingResponse = false;

    for await (const line of rl) {
      if (!line.trim()) continue;

      let event: JournalEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type !== "message" || !event.message) continue;

      const { role, content } = event.message;
      if (role !== "user" && role !== "assistant") continue;

      const text = extractTextContent(content, role);
      if (!text) continue;

      // If the user message is a context block, parse it for accurate counts
      if (role === "user" && isContextBlock(text)) {
        foundContextBlock = true;
        const parsed = parseContextBlock(text, 0);
        messageCount += parsed.length;
        const firstUser = parsed.find((m) => m.role === "user");
        if (firstUser && !firstMessagePreview) {
          firstMessagePreview = firstUser.content.slice(0, 100);
        }
        continue;
      }

      // For context-block sessions, trailing assistant events are merged into
      // one response in loadChatHistory — count as 1 total
      if (foundContextBlock && role === "assistant") {
        if (!countedTrailingResponse) {
          messageCount++;
          countedTrailingResponse = true;
        }
        continue;
      }

      // Standard session — count normally
      messageCount++;
      if (!firstMessagePreview && role === "user") {
        firstMessagePreview = text.slice(0, 100);
      }
    }

    if (messageCount === 0) continue;

    summaries.push({
      sessionId: entry.sessionId,
      updatedAt: entry.updatedAt,
      model: entry.model,
      modelProvider: entry.modelProvider,
      messageCount,
      firstMessagePreview,
    });
  }

  return summaries;
}

/**
 * Load chat history from a session for an agent.
 * If sessionId is provided, loads that specific session.
 * Otherwise loads the most recent interactive session.
 * Streams the JSONL file line by line for memory efficiency.
 *
 * Handles OpenClaw's webchat format where all prior conversation turns
 * are bundled into a single "user" JSONL event as a context block.
 * The parser extracts individual user/assistant turns from these blocks.
 *
 * @param agentId - the agent ID (maps to folder name)
 * @param limit - max messages to return (default 200)
 * @param sessionId - optional specific session to load
 * @returns HistoryMessage[] in chronological order
 */
export async function loadChatHistory(
  agentId: string,
  limit = 200,
  sessionId?: string
): Promise<HistoryMessage[]> {
  const sessions = await getSessionIndex(agentId);
  if (sessions.length === 0) return [];

  let entry: SessionEntry | undefined;
  if (sessionId) {
    entry = sessions.find((s) => s.sessionId === sessionId);
  } else {
    entry = sessions[0]; // most recent
  }

  if (!entry) return [];
  const filePath = await resolveSessionFile(agentId, entry);
  if (!filePath) return [];

  // Collect all message events from the JSONL
  const allEvents: JournalEvent[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let event: JournalEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type !== "message" || !event.message) continue;
    allEvents.push(event);
  }

  // Find the last user event and check if it's a context block
  let contextBlockIdx = -1;
  for (let i = allEvents.length - 1; i >= 0; i--) {
    const ev = allEvents[i];
    if (ev.message!.role === "user") {
      const text = extractTextContent(ev.message!.content, "user");
      if (text && isContextBlock(text)) {
        contextBlockIdx = i;
      }
      break; // only check the last user event
    }
  }

  if (contextBlockIdx >= 0) {
    // --- Context block mode: parse the bundled conversation ---
    const userEvent = allEvents[contextBlockIdx];
    const userText = extractTextContent(userEvent.message!.content, "user")!;
    const parsed = parseContextBlock(userText, userEvent.message!.timestamp);

    // Collect text-bearing assistant events AFTER the context block.
    // These are the response(s) to the last user message in the block.
    const trailingAssistantTexts: string[] = [];
    let firstTrailingTs = 0;
    let firstTrailingId = "";

    for (let i = contextBlockIdx + 1; i < allEvents.length; i++) {
      const ev = allEvents[i];
      if (ev.message!.role !== "assistant") continue;
      const text = extractTextContent(ev.message!.content, "assistant");
      if (!text) continue;
      if (!firstTrailingTs) {
        firstTrailingTs = ev.message!.timestamp;
        firstTrailingId = ev.id;
      }
      trailingAssistantTexts.push(text);
    }

    // If the last parsed message is a user message and we have assistant
    // events after the block, append them as the response.
    const lastParsed = parsed[parsed.length - 1];
    if (lastParsed?.role === "user" && trailingAssistantTexts.length > 0) {
      parsed.push({
        id: firstTrailingId || "history-trailing",
        role: "assistant",
        content: trailingAssistantTexts.join("\n\n"),
        timestamp: firstTrailingTs,
        status: "sent" as const,
      });
    }

    return parsed.slice(-limit);
  }

  // --- Standard mode: no context block, process events directly ---
  const messages: HistoryMessage[] = [];

  for (const event of allEvents) {
    const { role, content, timestamp } = event.message!;

    if (role === "toolResult") continue;
    if (role !== "user" && role !== "assistant") continue;

    const text = extractTextContent(content, role);
    if (!text) continue;

    messages.push({
      id: event.id,
      role,
      content: text,
      timestamp,
      status: "sent",
    });
  }

  if (messages.length > limit) {
    return messages.slice(-limit);
  }

  return messages;
}

/**
 * Get a lightweight preview of the last message for an agent.
 * Reads only the tail of the most recent session JSONL to avoid
 * parsing the entire file.
 */
export async function getSessionPreview(agentId: string): Promise<SessionPreview | null> {
  const sessions = await getSessionIndex(agentId);
  if (sessions.length === 0) return null;

  const entry = sessions[0];
  const filePath = await resolveSessionFile(agentId, entry);
  if (!filePath) return null;

  // Read last chunk of the file to find the last visible message
  const TAIL_BYTES = 16384; // 16KB should capture several messages
  const stat = statSync(filePath);
  const start = Math.max(0, stat.size - TAIL_BYTES);

  const buf = Buffer.alloc(Math.min(TAIL_BYTES, stat.size));
  const fd = require("node:fs").openSync(filePath, "r");
  try {
    require("node:fs").readSync(fd, buf, 0, buf.length, start);
  } finally {
    require("node:fs").closeSync(fd);
  }

  const text = buf.toString("utf-8");
  const lines = text.split("\n");

  // If we started mid-line (seeked into middle of file), skip the first partial line
  if (start > 0 && lines.length > 0) {
    lines.shift();
  }

  // Walk backwards to find last visible message
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    let event: JournalEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type !== "message" || !event.message) continue;

    const { role, content, timestamp } = event.message;
    if (role !== "user" && role !== "assistant") continue;

    const extracted = extractTextContent(content, role);
    if (!extracted) continue;

    // If it's a context block, parse it and return the last turn
    if (role === "user" && isContextBlock(extracted)) {
      const parsed = parseContextBlock(extracted, timestamp);
      const last = parsed[parsed.length - 1];
      if (last) {
        return {
          lastMessage: last.content,
          lastRole: last.role,
          timestamp: last.timestamp,
        };
      }
      continue;
    }

    return {
      lastMessage: extracted,
      lastRole: role,
      timestamp,
    };
  }

  return null;
}

/**
 * Get previews for multiple agents at once.
 * Used by the sidebar to show last message preview for each agent.
 */
export async function getSessionPreviews(
  agentIds: string[]
): Promise<Record<string, SessionPreview>> {
  const results: Record<string, SessionPreview> = {};

  const previews = await Promise.all(
    agentIds.map(async (id) => {
      try {
        return { id, preview: await getSessionPreview(id) };
      } catch {
        return { id, preview: null };
      }
    })
  );

  for (const { id, preview } of previews) {
    if (preview) {
      results[id] = preview;
    }
  }

  return results;
}
