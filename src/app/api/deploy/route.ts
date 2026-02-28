import { NextRequest, NextResponse } from "next/server";
import { startDeployment } from "@/lib/deployer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, displayName, template } = body;

    if (!name) {
      return NextResponse.json({ error: "Instance name is required" }, { status: 400 });
    }

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(name)) {
      return NextResponse.json(
        { error: "Name must be lowercase alphanumeric with hyphens only" },
        { status: 400 }
      );
    }

    const result = await startDeployment({ name, displayName, template });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start deployment" },
      { status: 500 }
    );
  }
}
