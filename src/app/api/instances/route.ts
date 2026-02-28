import { NextResponse } from "next/server";
import { listInstances, deleteAllInstances } from "@/lib/instances";

export async function GET() {
  try {
    const instances = await listInstances();
    return NextResponse.json(instances);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list instances" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = await deleteAllInstances();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete instances" },
      { status: 500 }
    );
  }
}
