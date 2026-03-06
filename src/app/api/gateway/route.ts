import { NextRequest, NextResponse } from "next/server";
import { getGateway, disconnectGateway, detectProfiles, switchProfile } from "@/lib/gateway";

export async function GET() {
  try {
    let gw = await getGateway();

    // Auto-detect: if no profile is configured, scan for existing ones on disk
    if (gw.status === "not_setup") {
      const profiles = await detectProfiles();
      if (profiles.length > 0) {
        // Prefer a profile that's already running, otherwise take the first
        const best = profiles.find((p) => p.isRunning) || profiles[0];
        gw = await switchProfile(best.dir);
      }
    }

    return NextResponse.json(gw);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get gateway" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deleteFiles = searchParams.get("deleteFiles") === "true";
    await disconnectGateway({ deleteFiles });

    // Auto-switch to another existing profile if one is available
    const remaining = await detectProfiles();
    if (remaining.length > 0) {
      const switched = await switchProfile(remaining[0].dir);
      return NextResponse.json({
        message: "Switched to profile",
        switchedTo: switched.profileName,
      });
    }

    return NextResponse.json({ message: "Gateway disconnected" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect gateway" },
      { status: 500 }
    );
  }
}
