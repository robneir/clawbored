import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { listCronRuns } from "@/lib/cron";

export async function GET(req: NextRequest) {
  try {
    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json({ runs: [] });
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const runs = listCronRuns(gw.profileDir, jobId, limit);
    return NextResponse.json({ runs });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load runs" },
      { status: 500 },
    );
  }
}
