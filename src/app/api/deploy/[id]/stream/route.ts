import { NextRequest } from "next/server";
import { getDeployment, addSSEListener } from "@/lib/deployer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deployment = getDeployment(id);

  if (!deployment) {
    return new Response("Deployment not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {}
      };

      const removeListener = addSSEListener(id, (entry) => {
        send(JSON.stringify(entry));
      });

      // Close stream when deployment is done
      const checkDone = setInterval(() => {
        const d = getDeployment(id);
        if (d && (d.status === "complete" || d.status === "failed")) {
          send(JSON.stringify({ ts: Date.now(), message: `__STATUS__:${d.status}` }));
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
