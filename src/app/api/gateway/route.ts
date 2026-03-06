import { NextRequest, NextResponse } from "next/server";
import { getGateway, deleteProfile, disconnectGateway, detectProfiles, switchProfile } from "@/lib/gateway";

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

    if (deleteFiles) {
      // Use deleteProfile() which handles switching to another profile
      // BEFORE resetting state — avoids a transient "not_setup" that
      // would trigger the setup wizard via SSE.
      const gw = await getGateway().catch(() => null);
      if (gw?.profileDir) {
        await deleteProfile(gw.profileDir);
      } else {
        await disconnectGateway({ deleteFiles: true });
      }
    } else {
      await disconnectGateway({ deleteFiles: false });
    }

    // Return the current gateway state so the frontend gets the full picture
    const current = await getGateway().catch(() => null);
    return NextResponse.json(current || { status: "not_setup", live: false });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect gateway" },
      { status: 500 }
    );
  }
}
