import { NextRequest, NextResponse } from "next/server";
import { getActivityFeed, ActivityEventKind } from "@/lib/activity";

const VALID_KINDS: ActivityEventKind[] = [
  "user_message",
  "assistant_response",
  "tool_call",
  "tool_result",
  "model_change",
  "session_start",
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId") || undefined;
    const kind = url.searchParams.get("kind") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const before = url.searchParams.get("before")
      ? parseInt(url.searchParams.get("before")!, 10)
      : undefined;

    const eventKind =
      kind && VALID_KINDS.includes(kind as ActivityEventKind)
        ? (kind as ActivityEventKind)
        : undefined;

    const events = await getActivityFeed({ agentId, eventKind, limit, before });
    return NextResponse.json({ events });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
