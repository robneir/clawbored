import { NextRequest } from "next/server";
import { installFromClawHub, generateJobId } from "@/lib/skills";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug } = body;

  if (!slug || typeof slug !== "string") {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }

  const jobId = generateJobId();

  // Start install in background
  setTimeout(() => {
    installFromClawHub(jobId, slug);
  }, 0);

  return Response.json({ jobId, message: `Installing ${slug} from ClawHub...` });
}
