import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getAgentBinding, saveAgentBinding, removeAgentBinding } from "@/lib/discord";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ binding: null });
    }

    const binding = getAgentBinding(gw.profileDir, id);
    return NextResponse.json({ binding });
  } catch {
    return NextResponse.json({ binding: null });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { guildId, guildName, channelId, channelName } = await req.json();

    if (!guildId || !channelId) {
      return NextResponse.json({ error: "guildId and channelId are required" }, { status: 400 });
    }

    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ error: "No gateway configured" }, { status: 400 });
    }

    saveAgentBinding(gw.profileDir, id, guildId, guildName || "", channelId, channelName || "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save binding" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ error: "No gateway configured" }, { status: 400 });
    }

    removeAgentBinding(gw.profileDir, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove binding" },
      { status: 500 }
    );
  }
}
