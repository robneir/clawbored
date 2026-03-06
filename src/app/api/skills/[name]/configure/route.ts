import { NextRequest } from "next/server";
import { configureSkillApiKey } from "@/lib/skills";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const body = await req.json();
  const { apiKey } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }

  try {
    await configureSkillApiKey(name, apiKey);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to configure API key" },
      { status: 500 }
    );
  }
}
