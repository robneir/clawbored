import { NextRequest } from "next/server";
import { getAutofixSession, addAutofixSSEListener } from "@/lib/autofix";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getAutofixSession(id);

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {}
      };

      const removeListener = addAutofixSSEListener(id, (entry) => {
        send(JSON.stringify(entry));
      });

      // Close stream when session reaches terminal state
      const checkDone = setInterval(() => {
        const s = getAutofixSession(id);
        if (s && (s.status === "complete" || s.status === "failed")) {
          send(JSON.stringify({ ts: Date.now(), message: `__STATUS__:${s.status}` }));
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
