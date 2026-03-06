import { NextRequest, NextResponse } from "next/server";
import { detectProfiles, switchProfile, deleteProfile } from "@/lib/gateway";

/** List all detected OpenClaw profiles on disk. */
export async function GET() {
  try {
    const profiles = await detectProfiles();
    return NextResponse.json(profiles);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to detect profiles" },
      { status: 500 }
    );
  }
}

/** Switch active profile. Body: { profileDir: string } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profileDir } = body;

    if (!profileDir || typeof profileDir !== "string") {
      return NextResponse.json({ error: "profileDir is required" }, { status: 400 });
    }

    const gw = await switchProfile(profileDir);
    return NextResponse.json(gw);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to switch profile" },
      { status: 500 }
    );
  }
}

/** Delete a profile. Body: { profileDir: string } */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { profileDir } = body;

    if (!profileDir || typeof profileDir !== "string") {
      return NextResponse.json({ error: "profileDir is required" }, { status: 400 });
    }

    await deleteProfile(profileDir);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete profile" },
      { status: 500 }
    );
  }
}
