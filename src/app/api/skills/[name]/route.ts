import { NextRequest } from "next/server";
import { getSkillDetail, removeSkill } from "@/lib/skills";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const detail = await getSkillDetail(name);
    return Response.json(detail);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to get skill detail" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    await removeSkill(name);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to remove skill" },
      { status: 400 }
    );
  }
}
