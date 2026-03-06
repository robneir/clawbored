import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { listWorkspaceTree } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await getAgent(id);
    const tree = listWorkspaceTree(agent.workspace);
    return NextResponse.json({ workspace: agent.workspace, tree });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list workspace";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
