import { NextRequest, NextResponse } from "next/server";
import { startInstance } from "@/lib/instances";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const result = await startInstance(name);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start instance" },
      { status: 500 }
    );
  }
}
