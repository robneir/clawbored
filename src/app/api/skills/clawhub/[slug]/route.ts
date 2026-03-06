import { inspectClawHubSkill } from "@/lib/skills";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || slug.trim().length === 0) {
    return Response.json({ error: "Slug is required" }, { status: 400 });
  }

  try {
    const detail = await inspectClawHubSkill(slug.trim());
    if (!detail) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }
    return Response.json(detail);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Inspect failed" },
      { status: 500 }
    );
  }
}
