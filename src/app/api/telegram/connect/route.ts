import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { enableTelegram, validateBotToken, saveAgentTelegramBinding } from "@/lib/telegram";
import { execSync } from "node:child_process";

/** POST: Connect Telegram by saving bot token and restarting gateway. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { botToken, agentId } = body;

    if (!botToken || typeof botToken !== "string") {
      return NextResponse.json(
        { error: "Bot token is required" },
        { status: 400 }
      );
    }

    // Validate the token against the Telegram API
    const botInfo = await validateBotToken(botToken);
    if (!botInfo) {
      return NextResponse.json(
        { error: "Invalid bot token. Check the token from @BotFather and try again." },
        { status: 400 }
      );
    }

    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    // Write Telegram config to openclaw.json
    enableTelegram(gw.profileDir, botToken, botInfo.username);

    // Bind to the agent if provided
    if (agentId) {
      saveAgentTelegramBinding(gw.profileDir, agentId);
    }

    // Restart the gateway so it picks up the new Telegram channel
    if (gw.profileName) {
      try {
        execSync(
          `launchctl kickstart -k gui/$(id -u)/ai.openclaw.${gw.profileName}`,
          { timeout: 10000, stdio: "pipe" }
        );
        // Wait briefly for gateway to come back up
        await new Promise((r) => setTimeout(r, 3000));
      } catch {
        // Gateway restart failed — config is saved, user can restart manually
      }
    }

    return NextResponse.json({
      ok: true,
      botUsername: botInfo.username,
      botName: botInfo.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to connect" },
      { status: 500 }
    );
  }
}
