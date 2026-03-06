import { NextRequest, NextResponse } from "next/server";
import { startAutofix } from "@/lib/autofix";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, errorMessage, recentMessages } = body;

    if (!agentId || !errorMessage) {
      return NextResponse.json(
        { error: "agentId and errorMessage are required" },
        { status: 400 }
      );
    }

    const { sessionId } = await startAutofix({
      agentId,
      errorMessage,
      recentMessages,
    });

    return NextResponse.json({ sessionId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start auto-fix";
    const status = message.includes("already running") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
