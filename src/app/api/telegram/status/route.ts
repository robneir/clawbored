import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { isTelegramConnected, getTelegramConfig, validateBotToken } from "@/lib/telegram";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ connected: false, configured: false });
    }

    const config = getTelegramConfig(gw.profileDir);
    const connected = isTelegramConnected(gw.profileDir);

    // If connected, resolve the bot username from the Telegram API
    let botUsername = "";
    if (connected && config?.botToken) {
      const info = await validateBotToken(config.botToken);
      if (info) botUsername = info.username;
    }

    return NextResponse.json({
      connected,
      configured: !!config,
      botUsername,
    });
  } catch {
    return NextResponse.json({ connected: false, configured: false });
  }
}
