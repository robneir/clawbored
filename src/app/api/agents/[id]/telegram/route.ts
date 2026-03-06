import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import {
  getAgentTelegramBinding,
  saveAgentTelegramBinding,
  removeAgentTelegramBinding,
} from "@/lib/telegram";

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

    const binding = getAgentTelegramBinding(gw.profileDir, id);
    return NextResponse.json({ binding });
  } catch {
    return NextResponse.json({ binding: null });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    saveAgentTelegramBinding(gw.profileDir, id);
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
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    removeAgentTelegramBinding(gw.profileDir, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove binding" },
      { status: 500 }
    );
  }
}
