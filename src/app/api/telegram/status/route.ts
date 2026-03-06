import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { isTelegramConnected, getTelegramConfig } from "@/lib/telegram";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ connected: false, configured: false });
    }

    const config = getTelegramConfig(gw.profileDir);
    const connected = isTelegramConnected(gw.profileDir);

    return NextResponse.json({
      connected,
      configured: !!config,
      botUsername: config?.botUsername || "",
    });
  } catch {
    return NextResponse.json({ connected: false, configured: false });
  }
}
