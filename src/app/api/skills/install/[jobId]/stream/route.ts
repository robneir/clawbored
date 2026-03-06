import { NextRequest } from "next/server";
import { addInstallSSEListener, getInstallStatus } from "@/lib/skills";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const status = getInstallStatus(jobId);

  if (!status) {
    return new Response("Install job not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {}
      };

      const removeListener = addInstallSSEListener(jobId, (entry) => {
        send(JSON.stringify(entry));
      });

      // Close stream when install is done
      const checkDone = setInterval(() => {
        const currentStatus = getInstallStatus(jobId);
        if (!currentStatus || currentStatus === "complete" || currentStatus === "failed") {
          if (currentStatus) {
            send(JSON.stringify({ ts: Date.now(), message: `__STATUS__:${currentStatus}` }));
          }
          clearInterval(checkDone);
          removeListener();
          try {
            controller.close();
          } catch {}
        }
      }, 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
