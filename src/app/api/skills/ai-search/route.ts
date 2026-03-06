import { NextRequest, NextResponse } from "next/server";
import { listAgents } from "@/lib/agents";
import { sendMessage } from "@/lib/chat";
import { getGateway } from "@/lib/gateway";

export interface AiSkillResult {
  name: string;
  description: string;
  sourceUrl: string;
  whyRecommended: string;
  popularitySignal: string;
  installHint: string;
  category: string;
}

// Simple in-memory cache (10-minute TTL)
const cache = new Map<string, { results: AiSkillResult[]; agentId: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

const SYSTEM_PROMPT = `You are a skill/tool recommendation engine. The user is looking for AI agent skills, MCP servers, or tools to extend their AI agent's capabilities.

Search the internet and recommend 3-6 popular, well-maintained skills or MCP servers that match the query. Focus on:
- Widely-used, actively maintained projects
- Skills available on ClawHub, npm, or GitHub
- MCP servers from the Smithery registry or official sources

Return ONLY a JSON array (no markdown, no explanation) with objects matching this schema:
{
  "name": "string — human-readable name",
  "description": "string — one sentence description",
  "sourceUrl": "string — GitHub/npm/registry URL",
  "whyRecommended": "string — why this is a good pick",
  "popularitySignal": "string — e.g. '15K GitHub stars', '50K weekly downloads'",
  "installHint": "string — e.g. 'clawhub install @user/skill' or 'npx @smithery/cli install @server'",
  "category": "string — e.g. 'browser', 'database', 'code', 'communication', 'productivity'"
}

If you cannot find relevant results, return an empty array: []`;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ error: "Query too short" }, { status: 400 });
    }

    const normalized = normalizeQuery(query);

    // Check cache
    const cached = cache.get(normalized);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({
        results: cached.results,
        agentId: cached.agentId,
        searchedAt: cached.ts,
        cached: true,
      });
    }

    // Check gateway is running
    const gw = await getGateway();
    if (!gw.live) {
      return NextResponse.json({ error: "gateway_offline" }, { status: 503 });
    }

    // Find main agent
    const agents = await listAgents();
    if (agents.length === 0) {
      return NextResponse.json({ error: "no_agent" }, { status: 404 });
    }
    const agent = agents[0];

    // Send message to agent (non-streaming)
    const res = await sendMessage(
      agent.id,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Find skills and tools for: ${query}` },
      ],
      false
    );

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Parse JSON from response — handle potential markdown wrapping
    let results: AiSkillResult[] = [];
    try {
      // Strip markdown code fences if present
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        results = parsed.filter(
          (r: Record<string, unknown>) => r.name && r.description
        );
      }
    } catch {
      return NextResponse.json({ error: "parse_failed" }, { status: 502 });
    }

    // Cache the result
    const ts = Date.now();
    cache.set(normalized, { results, agentId: agent.id, ts });

    // Evict old entries
    for (const [key, val] of cache) {
      if (Date.now() - val.ts > CACHE_TTL) cache.delete(key);
    }

    return NextResponse.json({
      results,
      agentId: agent.id,
      searchedAt: ts,
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI search failed";
    if (message.includes("timeout") || message.includes("Timeout")) {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
