import { getInstance } from "./instances";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  status?: "sent" | "queued" | "sending" | "error";
}

export interface ChatConversation {
  instanceName: string;
  messages: ChatMessage[];
}

/**
 * Send a message to an OpenClaw instance via the chat completions API.
 * Returns a ReadableStream for SSE streaming.
 */
export async function sendMessage(
  instanceName: string,
  messages: { role: string; content: string }[],
  stream = true
): Promise<Response> {
  const inst = getInstance(instanceName);
  if (!inst.token) {
    throw new Error(`Instance "${instanceName}" has no auth token configured`);
  }

  const url = `http://127.0.0.1:${inst.port}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${inst.token}`,
    },
    body: JSON.stringify({
      model: "openclaw:main",
      messages,
      stream,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenClaw API error (${res.status}): ${text}`);
  }

  return res;
}

/**
 * Check if an instance is currently processing a request (busy).
 * We use the tools/invoke endpoint to check session status.
 */
export async function isInstanceBusy(instanceName: string): Promise<boolean> {
  const inst = getInstance(instanceName);
  if (!inst.token) return false;

  try {
    const res = await fetch(`http://127.0.0.1:${inst.port}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inst.token}`,
      },
      body: JSON.stringify({
        tool: "sessions_list",
        action: "json",
        args: {},
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return false;
    const data = await res.json();
    // Check if any session has an active run
    if (data?.ok && data?.result) {
      const sessions = Array.isArray(data.result) ? data.result : [];
      return sessions.some(
        (s: { activeRun?: boolean; state?: string }) =>
          s.activeRun || s.state === "running"
      );
    }
    return false;
  } catch {
    return false;
  }
}
