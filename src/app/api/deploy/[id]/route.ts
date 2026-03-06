import { NextRequest, NextResponse } from "next/server";
import { getDeployment, getDeploymentLogs } from "@/lib/deployer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deployment = getDeployment(id);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    const logs = getDeploymentLogs(id);
    return NextResponse.json({
      id: deployment.id,
      name: deployment.name,
      status: deployment.status,
      startedAt: deployment.startedAt,
      logs,
      error: deployment.error,
      result: deployment.result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get deployment" },
      { status: 500 }
    );
  }
}
