import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getDiscordConfig, getGuildChannels } from "@/lib/discord";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ channels: [] });
    }

    const dc = getDiscordConfig(gw.profileDir);
    if (!dc?.token) {
      return NextResponse.json({ channels: [] });
    }

    const channels = await getGuildChannels(dc.token, guildId);
    return NextResponse.json({ channels });
  } catch {
    return NextResponse.json({ channels: [] });
  }
}
