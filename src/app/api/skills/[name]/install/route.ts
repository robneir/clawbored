import { NextRequest } from "next/server";
import { getSkillDetail, runInstall, generateJobId } from "@/lib/skills";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const body = await req.json();
  const { installId } = body;

  if (!installId) {
    return Response.json({ error: "installId is required" }, { status: 400 });
  }

  try {
    const detail = await getSkillDetail(name);
    const installOption = detail.install.find((i) => i.id === installId);

    if (!installOption) {
      return Response.json(
        { error: `Install option '${installId}' not found for skill '${name}'` },
        { status: 404 }
      );
    }

    const jobId = generateJobId();

    // Start install in background
    setTimeout(() => {
      runInstall(jobId, installOption);
    }, 0);

    return Response.json({ jobId, message: `Installing: ${installOption.label}` });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start install" },
      { status: 500 }
    );
  }
}
