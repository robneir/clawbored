import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";
import { getSessionIndex } from "@/lib/sessions";

const BUSY_THRESHOLD_MS = 15_000; // Agent considered "busy" if session updated within 15s

export async function GET() {
  try {
    const agents = await listAgents();

    // Check each agent's most recent session timestamp to determine busy status
    const agentsWithStatus = await Promise.all(
      agents.map(async (agent) => {
        try {
          const sessions = await getSessionIndex(agent.id);
          if (sessions.length > 0) {
            const elapsed = Date.now() - (sessions[0].updatedAt || 0);
            return { ...agent, busy: elapsed < BUSY_THRESHOLD_MS };
          }
        } catch {}
        return { ...agent, busy: false };
      })
    );

    return NextResponse.json(agentsWithStatus);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list agents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, displayName, template, model, soulMdContent } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json(
        { error: "id must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    const agent = await createAgent({ id, displayName, template, model, soulMdContent });
    return NextResponse.json(agent, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create agent";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
