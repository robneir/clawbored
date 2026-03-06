import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { readWorkspaceFile } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = req.nextUrl.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json(
        { error: "path parameter is required" },
        { status: 400 }
      );
    }

    const agent = await getAgent(id);
    const result = readWorkspaceFile(agent.workspace, filePath);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to read file";
    const status =
      message === "File not found"
        ? 404
        : message === "Invalid file path"
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
