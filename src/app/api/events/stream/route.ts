import { NextRequest } from "next/server";
import { listAgents } from "@/lib/agents";
import { getSessionIndex } from "@/lib/sessions";
import { getGateway } from "@/lib/gateway";
import { getUnreadSummary, detectAndAppendEvents } from "@/lib/notifications";
import { getActivityFeed } from "@/lib/activity";

export const dynamic = "force-dynamic";

const TICK_MS = 2000;
const PING_MS = 15000;
const BUSY_THRESHOLD_MS = 15_000;

interface AgentSnapshot {
  id: string;
  displayName: string;
  template: string;
  status: string;
  avatar: string;
  model: string;
  busy: boolean;
}

async function getAgentsWithBusy(): Promise<AgentSnapshot[]> {
  const agents = await listAgents();
  return Promise.all(
    agents.map(async (agent) => {
      let busy = false;
      try {
        const sessions = await getSessionIndex(agent.id);
        if (sessions.length > 0) {
          busy = Date.now() - (sessions[0].updatedAt || 0) < BUSY_THRESHOLD_MS;
        }
      } catch {}
      return {
        id: agent.id,
        displayName: agent.displayName,
        template: agent.template,
        status: agent.status,
        avatar: agent.avatar,
        model: agent.model,
        busy,
      };
    })
  );
}

function hashSnapshot(obj: unknown): string {
  return JSON.stringify(obj);
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Detect client disconnect
      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      let lastHash = "";
      let lastPing = Date.now();

      // Helper to send SSE
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      }

      // Main loop
      while (!closed) {
        try {
          // Gather all state in parallel
          const [agents, gateway, activity] = await Promise.all([
            getAgentsWithBusy(),
            getGateway().catch(() => null),
            getActivityFeed({ limit: 50 }).catch(() => []),
          ]);

          // Notifications (side-effect: detects new events)
          let notifications = null;
          try {
            detectAndAppendEvents();
            notifications = getUnreadSummary();
          } catch {}

          const snapshot = { agents, gateway, notifications, activity };
          const hash = hashSnapshot(snapshot);

          // Only send if changed or first time
          if (hash !== lastHash) {
            lastHash = hash;
            send("sync", snapshot);
            lastPing = Date.now();
          } else if (Date.now() - lastPing >= PING_MS) {
            // Keep-alive ping
            send("ping", {});
            lastPing = Date.now();
          }
        } catch {
          // If gathering fails, send ping to keep connection alive
          if (Date.now() - lastPing >= PING_MS) {
            send("ping", {});
            lastPing = Date.now();
          }
        }

        // Wait for next tick
        if (!closed) {
          await new Promise((resolve) => setTimeout(resolve, TICK_MS));
        }
      }

      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
