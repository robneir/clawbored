import { NextRequest, NextResponse } from "next/server";
import {
  getMessageAttachments,
  getAgentAttachments,
  readAttachmentFile,
} from "@/lib/attachments";

export async function GET(req: NextRequest) {
  try {
    const messageId = req.nextUrl.searchParams.get("messageId");
    const agentId = req.nextUrl.searchParams.get("agentId");
    const download = req.nextUrl.searchParams.get("download");

    if (download) {
      const file = readAttachmentFile(download);
      if (!file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename="${file.filename}"`,
          "Content-Length": String(file.buffer.length),
        },
      });
    }

    if (messageId) {
      const attachments = await getMessageAttachments(messageId);
      return NextResponse.json({ attachments });
    }

    if (agentId) {
      const attachments = await getAgentAttachments(agentId);
      return NextResponse.json({ attachments });
    }

    return NextResponse.json(
      { error: "messageId or agentId required" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get attachments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
