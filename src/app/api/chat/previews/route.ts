import { NextRequest, NextResponse } from "next/server";
import { getSessionPreviews } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { agentIds } = body;

    if (!Array.isArray(agentIds)) {
      return NextResponse.json(
        { error: "agentIds array required" },
        { status: 400 }
      );
    }

    const previews = await getSessionPreviews(agentIds);
    return NextResponse.json(previews);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load previews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
