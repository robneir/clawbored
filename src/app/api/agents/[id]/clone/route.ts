import { NextRequest, NextResponse } from "next/server";
import { cloneAgent } from "@/lib/agents";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clone = await cloneAgent(id);
    return NextResponse.json(clone, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to clone agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
