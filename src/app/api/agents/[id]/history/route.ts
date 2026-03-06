import { NextRequest, NextResponse } from "next/server";
import { loadChatHistory } from "@/lib/sessions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);
    const sessionId = url.searchParams.get("sessionId") || undefined;

    const messages = await loadChatHistory(id, limit, sessionId);
    return NextResponse.json({ messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load chat history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
