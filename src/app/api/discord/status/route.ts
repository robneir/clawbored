import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import {
  getDiscordConfig,
  validateBotToken,
  getBotApplicationId,
} from "@/lib/discord";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ configured: false });
    }

    const dc = getDiscordConfig(gw.profileDir);
    if (!dc || !dc.token) {
      return NextResponse.json({ configured: false });
    }

    const { valid, bot } = await validateBotToken(dc.token);
    if (!valid) {
      return NextResponse.json({ configured: true, valid: false });
    }

    const appId = await getBotApplicationId(dc.token);

    return NextResponse.json({
      configured: true,
      valid: true,
      bot,
      applicationId: appId,
    });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
