import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getDiscordConfig, getBotGuilds } from "@/lib/discord";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ guilds: [] });
    }

    const dc = getDiscordConfig(gw.profileDir);
    if (!dc?.token) {
      return NextResponse.json({ guilds: [] });
    }

    const guilds = await getBotGuilds(dc.token);
    return NextResponse.json({ guilds });
  } catch {
    return NextResponse.json({ guilds: [] });
  }
}
