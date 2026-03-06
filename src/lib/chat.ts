import { getGateway } from "./gateway";

export interface ChatAttachment {
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
  url?: string;
  base64?: string;
  status: "pending" | "uploaded" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  status?: "sent" | "queued" | "sending" | "error";
  attachments?: ChatAttachment[];
}

export interface ChatConversation {
  agentId: string;
  messages: ChatMessage[];
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Send a message to an OpenClaw agent via the chat completions API.
 * Routes to the specific agent within the single gateway.
 */
export async function sendMessage(
  agentId: string,
  messages: { role: string; content: string | ContentPart[] }[],
  stream = true
): Promise<Response> {
  const gw = await getGateway();
  if (!gw.token) {
    throw new Error("Gateway has no auth token configured");
  }

  const url = `http://127.0.0.1:${gw.port}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gw.token}`,
    },
    body: JSON.stringify({
      model: `openclaw:${agentId}`,
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
