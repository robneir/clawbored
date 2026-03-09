import { NextRequest, NextResponse } from "next/server";
import { startAutofix } from "@/lib/autofix";
import { getGateway } from "@/lib/gateway";
import { refreshExpiredOAuthTokens } from "@/lib/oauth-refresh";

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

    let refreshedProviders: string[] = [];
    try {
      const gw = await getGateway();
      if (gw.profileDir) {
        const refreshed = await refreshExpiredOAuthTokens(gw.profileDir);
        refreshedProviders = refreshed.refreshed;
      }
    } catch {
      // Non-fatal for auto-fix startup.
    }

    const { sessionId } = await startAutofix({
      agentId,
      errorMessage,
      recentMessages,
    });

    return NextResponse.json({ sessionId, refreshedProviders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start auto-fix";
    const status = message.includes("already running") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
