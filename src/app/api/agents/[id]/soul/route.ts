import { NextRequest, NextResponse } from "next/server";
import { getAgentSoulMd, saveAgentSoulMd } from "@/lib/agents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const content = await getAgentSoulMd(id);
    return NextResponse.json({ content });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read SOUL.md" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content } = body;

    if (typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    await saveAgentSoulMd(id, content);
    return NextResponse.json({ message: "SOUL.md saved" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save SOUL.md" },
      { status: 500 }
    );
  }
}
