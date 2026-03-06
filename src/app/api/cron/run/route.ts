import { NextRequest, NextResponse } from "next/server";
import { execSync, spawnSync } from "node:child_process";
import { getGateway, profileArgs } from "@/lib/gateway";

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json({ error: "Gateway not set up" }, { status: 400 });
    }

    const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
    const pArgs = profileArgs(gw.profileName);

    const result = spawnSync(ocPath, [...pArgs, "cron", "run", jobId], {
      encoding: "utf-8",
      timeout: 60000,
      stdio: "pipe",
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.trim() || result.stdout?.trim() || "Failed to trigger job";
      throw new Error(errMsg);
    }

    return NextResponse.json({ message: "Job triggered successfully" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger job" },
      { status: 500 },
    );
  }
}
