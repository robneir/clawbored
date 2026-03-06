import { listSkills } from "@/lib/skills";

export async function GET() {
  try {
    const skills = await listSkills();
    return Response.json(skills);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list skills" },
      { status: 500 }
    );
  }
}
