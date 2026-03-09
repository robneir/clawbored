import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getOAuthTokenHealth, refreshExpiredOAuthTokens } from "@/lib/oauth-refresh";

export async function GET(req: NextRequest) {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({
        providers: [],
        refreshedProviders: [],
        refreshErrors: [],
      });
    }

    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    let refreshedProviders: string[] = [];
    let refreshErrors: string[] = [];

    if (refresh) {
      const refreshed = await refreshExpiredOAuthTokens(gw.profileDir);
      refreshedProviders = refreshed.refreshed;
      refreshErrors = refreshed.errors;
    }

    const providers = getOAuthTokenHealth(gw.profileDir);
    return NextResponse.json({
      providers,
      refreshedProviders,
      refreshErrors,
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to check auth health";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

