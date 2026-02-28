import { NextRequest, NextResponse } from "next/server";
import { getInstance, deleteInstance } from "@/lib/instances";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const instance = getInstance(name);
    return NextResponse.json(instance);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Instance not found" },
      { status: 404 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const result = await deleteInstance(name);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete instance" },
      { status: 500 }
    );
  }
}
