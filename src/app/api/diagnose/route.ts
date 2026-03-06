import { NextResponse } from "next/server";
import { runDiagnostics } from "@/lib/diagnostics";

export async function POST() {
  try {
    const result = await runDiagnostics();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diagnostics failed" },
      { status: 500 }
    );
  }
}
