import { NextRequest } from "next/server";
import { searchClawHub } from "@/lib/skills";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return Response.json([]);
  }

  try {
    const results = await searchClawHub(q.trim());
    return Response.json(results);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
