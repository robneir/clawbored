import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, messages, stream = true } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const gw = await getGateway();
    if (!gw.token) {
      return NextResponse.json(
        { error: "Gateway has no auth token configured" },
        { status: 400 }
      );
    }

    const url = `http://127.0.0.1:${gw.port}/v1/chat/completions`;

    // Use a longer timeout for streaming (agent tasks can run for minutes).
    // For non-streaming, 2 minutes is enough for the initial response.
    const timeout = stream ? 600000 : 120000;

    const openclawRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gw.token}`,
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages,
        stream,
        user: `mc-${agentId}`,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!openclawRes.ok) {
      const errText = await openclawRes.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `OpenClaw error (${openclawRes.status}): ${errText}` },
        { status: openclawRes.status }
      );
    }

    const contentType = openclawRes.headers.get("content-type") || "";
    const isSSE = contentType.includes("text/event-stream");

    if (stream && isSSE && openclawRes.body) {
      return new Response(openclawRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response — return as JSON
    const data = await openclawRes.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Chat request failed";
    // Translate low-level errors to user-friendly messages
    const isNetwork =
      raw.includes("fetch failed") ||
      raw.includes("ECONNREFUSED") ||
      raw.includes("network") ||
      raw.includes("ECONNRESET") ||
      raw.includes("socket hang up");
    const isTimeout = raw.includes("TimeoutError") || raw.includes("timed out");

    const message = isNetwork
      ? "Could not reach the gateway. It may be restarting — try again in a moment."
      : isTimeout
      ? "The request timed out. The agent may still be processing — try again shortly."
      : raw;

    return NextResponse.json({ error: message }, { status: isNetwork ? 502 : 500 });
  }
}
