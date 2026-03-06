import { NextResponse } from "next/server";
import { startGateway } from "@/lib/gateway";

export async function POST() {
  try {
    const gw = await startGateway();
    return NextResponse.json(gw);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start gateway" },
      { status: 500 }
    );
  }
}
