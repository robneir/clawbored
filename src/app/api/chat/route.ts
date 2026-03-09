import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getAgent, updateAgent } from "@/lib/agents";
import { CURATED_MODELS } from "@/lib/models";
import { listProviderKeysRaw } from "@/lib/provider-keys";
import { refreshExpiredOAuthTokens } from "@/lib/oauth-refresh";

type ProviderId = "anthropic" | "openai";

function isRateLimitError(status: number, text: string): boolean {
  if (status === 429) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("throttle")
  );
}

function isAuthError(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("oauth") ||
    lower.includes("token refresh") ||
    lower.includes("api key") ||
    lower.includes("invalid_api_key")
  );
}

function isProviderFailure(status: number, text: string): boolean {
  const lower = text.toLowerCase();
  if (status >= 500 && status < 600) {
    return (
      lower.includes("internal error") ||
      lower.includes("api_error") ||
      lower.includes("provider") ||
      lower.includes("upstream")
    );
  }
  return false;
}

function inferProviderFromModel(model?: string): ProviderId | null {
  if (!model || model === "default") return null;
  const lower = model.toLowerCase();
  if (lower.startsWith("claude-")) return "anthropic";
  if (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("chatgpt-")
  ) {
    return "openai";
  }
  return null;
}

function inferProviderFromError(text: string): ProviderId | null {
  const lower = text.toLowerCase();
  if (lower.includes("anthropic") || lower.includes("claude")) return "anthropic";
  if (lower.includes("openai") || lower.includes("gpt") || lower.includes("codex")) return "openai";
  return null;
}

function pickFallbackModel(
  failedProvider: ProviderId | null,
  connectedProviders: Set<string>
): { provider: ProviderId; modelId: string } | null {
  const providerOrder: ProviderId[] = failedProvider === "openai" ? ["anthropic", "openai"] : ["openai", "anthropic"];

  for (const provider of providerOrder) {
    if (provider === failedProvider) continue;
    if (!connectedProviders.has(provider)) continue;

    if (provider === "openai") {
      const preferred = CURATED_MODELS.find((m) => m.id === "gpt-4o");
      if (preferred) return { provider, modelId: preferred.id };
    }

    if (provider === "anthropic") {
      const preferred = CURATED_MODELS.find((m) => m.id === "claude-sonnet-4-6");
      if (preferred) return { provider, modelId: preferred.id };
    }

    const fallback = CURATED_MODELS.find((m) => m.provider === provider);
    if (fallback) return { provider, modelId: fallback.id };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, messages, stream = true } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const gw = await getGateway();
    if (!gw.token) {
      return NextResponse.json(
        { error: "Gateway has no auth token configured" },
        { status: 400 }
      );
    }

    const refreshedProviderSet = new Set<string>();
    if (gw.profileDir) {
      try {
        const refreshed = await refreshExpiredOAuthTokens(gw.profileDir);
        refreshed.refreshed.forEach((p) => refreshedProviderSet.add(p));
      } catch {
        // Non-fatal. We still have provider fallback handling below.
      }
    }

    const url = `http://127.0.0.1:${gw.port}/v1/chat/completions`;

    // Use a longer timeout for streaming (agent tasks can run for minutes).
    // For non-streaming, 2 minutes is enough for the initial response.
    const timeout = stream ? 600000 : 120000;

    const makeRequest = () =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gw.token}`,
        },
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          messages,
          stream,
          user: `mc-${agentId}`,
        }),
        signal: AbortSignal.timeout(timeout),
      });

    let openclawRes = await makeRequest();
    let fallbackApplied = false;
    let fallbackTarget = "";

    if (!openclawRes.ok) {
      const errText = await openclawRes.text().catch(() => "Unknown error");
      let finalErrText = errText;
      const shouldTryFallback =
        isRateLimitError(openclawRes.status, errText) ||
        isAuthError(openclawRes.status, errText) ||
        isProviderFailure(openclawRes.status, errText);

      if (shouldTryFallback) {
        // Try to heal auth issues in-place first before switching providers/models.
        if (isAuthError(openclawRes.status, errText) && gw.profileDir) {
          try {
            const refreshed = await refreshExpiredOAuthTokens(gw.profileDir);
            refreshed.refreshed.forEach((p) => refreshedProviderSet.add(p));
            if (refreshed.refreshed.length > 0) {
              openclawRes = await makeRequest();
              if (openclawRes.ok) {
                const contentType = openclawRes.headers.get("content-type") || "";
                const isSSE = contentType.includes("text/event-stream");

                if (stream && isSSE && openclawRes.body) {
                  return new Response(openclawRes.body, {
                    headers: {
                      "Content-Type": "text/event-stream",
                      "Cache-Control": "no-cache",
                      Connection: "keep-alive",
                      ...(refreshedProviderSet.size > 0
                        ? { "X-MC-Recovered-Auth": Array.from(refreshedProviderSet).join(",") }
                        : {}),
                    },
                  });
                }

                const data = await openclawRes.json();
                return NextResponse.json(data, {
                  headers: {
                    ...(refreshedProviderSet.size > 0
                      ? { "X-MC-Recovered-Auth": Array.from(refreshedProviderSet).join(",") }
                      : {}),
                  },
                });
              }
              finalErrText = await openclawRes.text().catch(() => finalErrText);
            }
          } catch {
            // Continue into provider fallback flow below.
          }
        }

        let currentModel = "default";
        let failedProvider = inferProviderFromError(errText);

        try {
          const agent = await getAgent(agentId);
          currentModel = agent.model || "default";
          if (!failedProvider) {
            failedProvider = inferProviderFromModel(currentModel);
          }
        } catch {
          // Ignore metadata read errors — continue without fallback.
        }

        const configured = await listProviderKeysRaw().catch(() => []);
        const connectedProviders = new Set(configured.map((p) => p.provider));
        const fallback = pickFallbackModel(failedProvider, connectedProviders);

        if (fallback) {
          try {
            await updateAgent(agentId, { model: fallback.modelId });
            fallbackApplied = true;
            fallbackTarget = fallback.modelId;
            // Small delay so the gateway picks up the config update before retry.
            await new Promise((resolve) => setTimeout(resolve, 250));
            openclawRes = await makeRequest();
            if (!openclawRes.ok) {
              finalErrText = await openclawRes.text().catch(() => "Unknown error");
            }
          } catch {
            // If fallback update fails, return the original provider error.
          }
        }
      }

      if (!openclawRes.ok) {
        const reconnectRequired = isAuthError(openclawRes.status, finalErrText);
        return NextResponse.json(
          {
            error: fallbackApplied
              ? `OpenClaw error (${openclawRes.status}): ${finalErrText}. Auto-fallback switched model to '${fallbackTarget}', but the retry still failed.`
              : `OpenClaw error (${openclawRes.status}): ${finalErrText}`,
            reconnectRequired,
            recovery: {
              refreshedProviders: Array.from(refreshedProviderSet),
              fallbackModel: fallbackApplied ? fallbackTarget : null,
            },
          },
          { status: openclawRes.status }
        );
      }
    }

    const contentType = openclawRes.headers.get("content-type") || "";
    const isSSE = contentType.includes("text/event-stream");

    if (stream && isSSE && openclawRes.body) {
      return new Response(openclawRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...(refreshedProviderSet.size > 0
            ? { "X-MC-Recovered-Auth": Array.from(refreshedProviderSet).join(",") }
            : {}),
          ...(fallbackApplied && fallbackTarget
            ? { "X-MC-Recovered-Fallback-Model": fallbackTarget }
            : {}),
        },
      });
    }

    // Non-streaming response — return as JSON
    const data = await openclawRes.json();
    return NextResponse.json(data, {
      headers: {
        ...(refreshedProviderSet.size > 0
          ? { "X-MC-Recovered-Auth": Array.from(refreshedProviderSet).join(",") }
          : {}),
        ...(fallbackApplied && fallbackTarget
          ? { "X-MC-Recovered-Fallback-Model": fallbackTarget }
          : {}),
      },
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Chat request failed";
    // Translate low-level errors to user-friendly messages
    const isNetwork =
      raw.includes("fetch failed") ||
      raw.includes("ECONNREFUSED") ||
      raw.includes("network") ||
      raw.includes("ECONNRESET") ||
      raw.includes("socket hang up");
    const isTimeout = raw.includes("TimeoutError") || raw.includes("timed out");

    const message = isNetwork
      ? "Could not reach the gateway. It may be restarting — try again in a moment."
      : isTimeout
      ? "The request timed out. The agent may still be processing — try again shortly."
      : raw;

    return NextResponse.json({ error: message }, { status: isNetwork ? 502 : 500 });
  }
}
