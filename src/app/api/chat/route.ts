import { NextRequest, NextResponse } from "next/server";
import { getInstance } from "@/lib/instances";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instanceName, messages, stream = true } = body;

    if (!instanceName) {
      return NextResponse.json(
        { error: "instanceName is required" },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const inst = getInstance(instanceName);
    if (!inst.token) {
      return NextResponse.json(
        { error: `Instance "${instanceName}" has no auth token` },
        { status: 400 }
      );
    }

    const url = `http://127.0.0.1:${inst.port}/v1/chat/completions`;

    const openclawRes = await fetch(url, {
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

    if (!openclawRes.ok) {
      const errText = await openclawRes.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `OpenClaw error (${openclawRes.status}): ${errText}` },
        { status: openclawRes.status }
      );
    }

    if (stream && openclawRes.body) {
      // Forward the SSE stream to the client
      return new Response(openclawRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const data = await openclawRes.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
