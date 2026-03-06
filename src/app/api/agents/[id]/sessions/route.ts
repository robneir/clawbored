import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessions = await listSessions(id);
    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
