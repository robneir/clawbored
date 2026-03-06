import { NextRequest, NextResponse } from "next/server";
import { setupGateway } from "@/lib/deployer";
import { switchProfile } from "@/lib/gateway";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Connect to an existing profile (wizard "Connect" button)
    if (body.mode === "connect" && body.profileDir) {
      const gw = await switchProfile(body.profileDir);
      return NextResponse.json({ connected: true, status: gw.status });
    }

    // Create a new profile (wizard "Create Instance" or deploy page)
    const result = await setupGateway({
      profileName: body.profileName,
      port: body.port ? Number(body.port) : undefined,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to setup gateway" },
      { status: 500 }
    );
  }
}
