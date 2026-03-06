import { NextRequest } from "next/server";
import { exploreClawHub } from "@/lib/skills";
import type { ClawHubSortOption } from "@/lib/skills";

const VALID_SORTS: ClawHubSortOption[] = ["trending", "downloads", "stars", "installs", "newest"];

export async function GET(req: NextRequest) {
  const sort = (req.nextUrl.searchParams.get("sort") || "trending") as ClawHubSortOption;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 50);
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;

  if (!VALID_SORTS.includes(sort)) {
    return Response.json({ error: `Invalid sort. Use: ${VALID_SORTS.join(", ")}` }, { status: 400 });
  }

  try {
    const result = await exploreClawHub(sort, limit, cursor);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Browse failed" },
      { status: 500 }
    );
  }
}
