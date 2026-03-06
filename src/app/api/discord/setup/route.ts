import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import {
  validateBotToken,
  saveDiscordChannel,
  removeDiscordChannel,
} from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const { valid, bot } = await validateBotToken(token);
    if (!valid) {
      return NextResponse.json({ error: "Invalid bot token" }, { status: 400 });
    }

    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ error: "No gateway profile configured" }, { status: 400 });
    }

    saveDiscordChannel(gw.profileDir, token);
    return NextResponse.json({ ok: true, bot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ error: "No gateway profile configured" }, { status: 400 });
    }

    removeDiscordChannel(gw.profileDir);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove" },
      { status: 500 }
    );
  }
}
