import { NextRequest, NextResponse } from "next/server";
import { execSync, spawnSync } from "node:child_process";
import { getGateway, profileFlag, profileArgs } from "@/lib/gateway";
import { listCronJobs, computeOccurrences, toggleCronJob, getNextRun } from "@/lib/cron";

export async function GET(req: NextRequest) {
  try {
    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json({ jobs: [], occurrences: [] });
    }

    const jobs = listCronJobs(gw.profileDir);

    // Enrich each job with next run time
    const jobsWithNextRun = jobs.map((job) => ({
      ...job,
      nextRun: getNextRun(job),
    }));

    const url = new URL(req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");

    if (startParam && endParam) {
      const rangeStart = new Date(startParam);
      const rangeEnd = new Date(endParam);

      if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
        return NextResponse.json(
          { error: "Invalid date parameters" },
          { status: 400 },
        );
      }

      const occurrences = computeOccurrences(jobs, rangeStart, rangeEnd);
      return NextResponse.json({ jobs: jobsWithNextRun, occurrences });
    }

    return NextResponse.json({ jobs: jobsWithNextRun, occurrences: [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load cron jobs" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json(
        { error: "Gateway not set up" },
        { status: 400 },
      );
    }

    // Try CLI first
    try {
      const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
      const pFlag = profileFlag(gw.profileName);
      execSync(
        `${ocPath} ${pFlag} cron delete ${jobId} --yes`.replace(/\s+/g, " ").trim(),
        { encoding: "utf-8", timeout: 10000, stdio: "pipe" },
      );
    } catch {
      // Fallback: remove directly from jobs.json
      const { removeCronJob } = await import("@/lib/cron");
      removeCronJob(gw.profileDir, jobId);
    }

    return NextResponse.json({ message: "Job deleted" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete cron job" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { jobId, enabled } = await req.json();
    if (!jobId || enabled === undefined) {
      return NextResponse.json(
        { error: "jobId and enabled are required" },
        { status: 400 },
      );
    }

    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json(
        { error: "Gateway not set up" },
        { status: 400 },
      );
    }

    toggleCronJob(gw.profileDir, jobId, enabled);
    return NextResponse.json({ message: `Job ${enabled ? "enabled" : "disabled"}` });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update cron job" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, scheduleKind, scheduleExpr, agentId, payloadKind, message, event, sessionTarget, tz } = body;

    if (!name || !scheduleKind || !scheduleExpr) {
      return NextResponse.json(
        { error: "name, scheduleKind, and scheduleExpr are required" },
        { status: 400 },
      );
    }

    const gw = await getGateway();
    if (!gw.profileDir || gw.status === "not_setup") {
      return NextResponse.json({ error: "Gateway not set up" }, { status: 400 });
    }

    const ocPath = execSync("which openclaw", { encoding: "utf-8" }).trim();
    const pArgs = profileArgs(gw.profileName);

    const args: string[] = [...pArgs, "cron", "add", "--name", name];

    switch (scheduleKind) {
      case "cron":
        args.push("--cron", scheduleExpr);
        if (tz) args.push("--tz", tz);
        break;
      case "every":
        args.push("--every", scheduleExpr);
        break;
      case "at":
        args.push("--at", scheduleExpr);
        break;
    }

    if (agentId) args.push("--agent", agentId);

    if (payloadKind === "agentTurn" && message) {
      args.push("--message", message);
    } else if (payloadKind === "systemEvent" && event) {
      args.push("--system-event", event);
    }

    if (sessionTarget === "isolated") {
      args.push("--session", "isolated");
    }

    const result = spawnSync(ocPath, args, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: "pipe",
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.trim() || result.stdout?.trim() || "CLI command failed";
      throw new Error(errMsg);
    }

    return NextResponse.json({ message: "Job created" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create cron job" },
      { status: 500 },
    );
  }
}
