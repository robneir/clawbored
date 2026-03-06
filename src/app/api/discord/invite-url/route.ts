import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getDiscordConfig, getBotApplicationId, generateInviteUrl } from "@/lib/discord";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ error: "No gateway configured" }, { status: 400 });
    }

    const dc = getDiscordConfig(gw.profileDir);
    if (!dc?.token) {
      return NextResponse.json({ error: "Discord not configured" }, { status: 400 });
    }

    const appId = await getBotApplicationId(dc.token);
    if (!appId) {
      return NextResponse.json({ error: "Could not determine application ID" }, { status: 500 });
    }

    return NextResponse.json({ url: generateInviteUrl(appId) });
  } catch {
    return NextResponse.json({ error: "Failed to generate invite URL" }, { status: 500 });
  }
}
