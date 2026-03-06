import { NextResponse } from "next/server";
import { stopGateway } from "@/lib/gateway";

export async function POST() {
  try {
    const gw = await stopGateway();
    return NextResponse.json(gw);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to stop gateway" },
      { status: 500 }
    );
  }
}
