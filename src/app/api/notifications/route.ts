import { NextRequest, NextResponse } from "next/server";
import {
  getUnreadSummary,
  markAsRead,
  detectAndAppendEvents,
  addEvent,
  dismissEvent,
  dismissAllEvents,
  getUndismissedCount,
} from "@/lib/notifications";

/** GET: Return unread summary + notification events. Side-effect: detects new events. */
export async function GET() {
  try {
    const events = detectAndAppendEvents();
    const summary = getUnreadSummary();
    const undismissedCount = getUndismissedCount();

    return NextResponse.json({
      ...summary,
      events,
      undismissedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check notifications" },
      { status: 500 },
    );
  }
}

/** POST: Action-based dispatch. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "markRead": {
        const { profileName, agentId } = body;
        if (!profileName || !agentId) {
          return NextResponse.json({ error: "profileName and agentId required" }, { status: 400 });
        }
        markAsRead(profileName, agentId);
        return NextResponse.json({ ok: true });
      }

      case "addEvent": {
        const { type, profileName, title, preview, agentId, agentName } = body;
        const event = addEvent({ type, profileName, title, preview, agentId, agentName });
        return NextResponse.json({ ok: true, event });
      }

      case "dismiss": {
        const { eventId } = body;
        if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
        dismissEvent(eventId);
        return NextResponse.json({ ok: true });
      }

      case "dismissAll": {
        dismissAllEvents();
        return NextResponse.json({ ok: true });
      }

      default: {
        // Backward compatibility: no action field → treat as markRead
        const { profileName, agentId } = body;
        if (profileName && agentId) {
          markAsRead(profileName, agentId);
          return NextResponse.json({ ok: true });
        }
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      }
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process notification action" },
      { status: 500 },
    );
  }
}
