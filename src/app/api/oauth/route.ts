/**
 * OAuth API route — handles PKCE OAuth flows for both OpenAI and Anthropic.
 *
 * Two distinct flows:
 *   - **OpenAI**: Starts a localhost:1455 callback server, opens browser to
 *     auth.openai.com, receives the callback automatically, exchanges code
 *     for tokens. The frontend polls GET /api/oauth until connected.
 *   - **Anthropic**: Opens browser to claude.ai/oauth/authorize which redirects
 *     to console.anthropic.com/oauth/code/callback. The user copies the
 *     code#state string and pastes it back in the UI, which sends it here
 *     for token exchange.
 *
 * Both flows save credentials to auth-profiles.json, propagate to sub-agents,
 * and touch openclaw.json to trigger the gateway daemon's config watcher.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import {
  propagateAuthToAgents,
  removeProviderAuth,
  triggerGatewayAuthReload,
} from "@/lib/provider-keys";
import { addPendingOAuthToken } from "@/lib/mc-state";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { randomBytes, subtle } from "node:crypto";

// ── OpenAI Codex OAuth constants ─────────────────────────────────
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_REDIRECT_URI = "http://localhost:1455/auth/callback";
const OPENAI_SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

// ── Anthropic OAuth constants ────────────────────────────────────
const ANTHROPIC_CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_SCOPES = "org:create_api_key user:profile user:inference";

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee}
.box{text-align:center;padding:2rem}.check{font-size:3rem;margin-bottom:1rem}</style></head>
<body><div class="box"><div class="check">&#10003;</div><h2>Authentication Successful</h2>
<p>Return to Clawboard — the UI will update automatically.</p></div></body></html>`;

// ── Module-level state for pending flows ─────────────────────────
let pendingOpenAIFlow: {
  server: Server;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;

let pendingAnthropicFlow: {
  verifier: string;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;

function cleanupOpenAIFlow() {
  if (!pendingOpenAIFlow) return;
  try { clearTimeout(pendingOpenAIFlow.timeout); } catch {}
  try { pendingOpenAIFlow.server.close(); } catch {}
  pendingOpenAIFlow = null;
}

function cleanupAnthropicFlow() {
  if (!pendingAnthropicFlow) return;
  try { clearTimeout(pendingAnthropicFlow.timeout); } catch {}
  pendingAnthropicFlow = null;
}

// ── PKCE helpers ─────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = new Uint8Array(32);
  const buf = randomBytes(32);
  verifierBytes.set(buf);
  const verifier = base64urlEncode(verifierBytes);

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await subtle.digest("SHA-256", data);
  const challenge = base64urlEncode(new Uint8Array(hashBuffer));

  return { verifier, challenge };
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1] ?? "";
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getAccountId(accessToken: string): string | null {
  const payload = decodeJwt(accessToken);
  const auth = payload?.[JWT_CLAIM_PATH] as Record<string, unknown> | undefined;
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

// ── OpenAI Codex OAuth flow ──────────────────────────────────────

async function startOpenAICodexOAuth(profileDir: string | null): Promise<{ authorizeUrl: string }> {
  cleanupOpenAIFlow();

  const { verifier, challenge } = await generatePKCE();
  const state = randomBytes(16).toString("hex");

  const url = new URL(OPENAI_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OPENAI_CLIENT_ID);
  url.searchParams.set("redirect_uri", OPENAI_REDIRECT_URI);
  url.searchParams.set("scope", OPENAI_SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "pi");

  const authorizeUrl = url.toString();

  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "", "http://localhost");
      if (reqUrl.pathname !== "/auth/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      if (reqUrl.searchParams.get("state") !== state) {
        res.statusCode = 400;
        res.end("State mismatch");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      if (!code) {
        res.statusCode = 400;
        res.end("Missing authorization code");
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(SUCCESS_HTML);

      try {
        const tokenRes = await fetch(OPENAI_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: OPENAI_CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: OPENAI_REDIRECT_URI,
          }),
        });

        if (!tokenRes.ok) {
          console.error("[oauth] OpenAI token exchange failed:", tokenRes.status);
          cleanupOpenAIFlow();
          return;
        }

        const tokenData = await tokenRes.json() as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        };

        if (!tokenData.access_token || !tokenData.refresh_token || typeof tokenData.expires_in !== "number") {
          console.error("[oauth] OpenAI token response missing fields");
          cleanupOpenAIFlow();
          return;
        }

        const accountId = getAccountId(tokenData.access_token);

        await saveOAuthCredentials(profileDir, "openai-codex", {
          access: tokenData.access_token,
          refresh: tokenData.refresh_token,
          expires: Date.now() + tokenData.expires_in * 1000,
          accountId: accountId || undefined,
        });

        // Token exchange complete — credentials saved to auth-profiles.json
      } catch (err) {
        console.error("[oauth] OpenAI token exchange error:", err);
      }

      cleanupOpenAIFlow();
    } catch {
      res.statusCode = 500;
      res.end("Internal error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server
      .listen(1455, "127.0.0.1", () => resolve())
      .on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          try { server.close(); } catch {}
          reject(new Error("Port 1455 is in use. Close any previous auth windows and try again."));
        } else {
          reject(err);
        }
      });
  });

  const timeout = setTimeout(() => cleanupOpenAIFlow(), 5 * 60 * 1000);
  pendingOpenAIFlow = { server, timeout };

  try {
    execSync(`open "${authorizeUrl}"`, { timeout: 5000, stdio: "pipe" });
  } catch {}

  return { authorizeUrl };
}

// ── Anthropic OAuth flow ─────────────────────────────────────────

async function startAnthropicOAuth(): Promise<{ authorizeUrl: string }> {
  cleanupAnthropicFlow();

  const { verifier, challenge } = await generatePKCE();

  const params = new URLSearchParams({
    code: "true",
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: "code",
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });

  const authorizeUrl = `${ANTHROPIC_AUTHORIZE_URL}?${params.toString()}`;

  // Store verifier so we can exchange the code later
  const timeout = setTimeout(() => cleanupAnthropicFlow(), 10 * 60 * 1000);
  pendingAnthropicFlow = { verifier, timeout };

  try {
    execSync(`open "${authorizeUrl}"`, { timeout: 5000, stdio: "pipe" });
  } catch {}

  return { authorizeUrl };
}

async function exchangeAnthropicCode(
  profileDir: string | null,
  authCode: string,
): Promise<void> {
  if (!pendingAnthropicFlow) {
    throw new Error("No pending Anthropic auth flow. Click Connect first.");
  }

  const { verifier } = pendingAnthropicFlow;

  // Parse code#state format
  const splits = authCode.trim().split("#");
  const code = splits[0];
  const state = splits[1];

  const tokenRes = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      state,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    cleanupAnthropicFlow();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // 5-minute buffer on expiry (matching openclaw's implementation)
  const expiresAt = Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000;

  await saveOAuthCredentials(profileDir, "anthropic", {
    access: tokenData.access_token,
    refresh: tokenData.refresh_token,
    expires: expiresAt,
  });

  cleanupAnthropicFlow();
}

// ── Shared credential storage ────────────────────────────────────

async function saveOAuthCredentials(
  profileDir: string | null,
  provider: string,
  creds: { access: string; refresh: string; expires: number; accountId?: string },
) {
  // No profile dir yet (during setup wizard) — store as pending
  if (!profileDir) {
    addPendingOAuthToken(provider, creds);
    return;
  }

  // Stop gateway FIRST to prevent its graceful shutdown from overwriting
  // auth-profiles.json with stale in-memory snapshot
  try {
    const { stopGateway } = await import("@/lib/gateway");
    await stopGateway();
  } catch {}

  const mainAgentDir = join(profileDir, "agents", "main", "agent");
  mkdirSync(mainAgentDir, { recursive: true });
  const authProfilesPath = join(mainAgentDir, "auth-profiles.json");

  let authData: { version: number; profiles: Record<string, unknown> } = {
    version: 1,
    profiles: {},
  };
  if (existsSync(authProfilesPath)) {
    try {
      authData = JSON.parse(readFileSync(authProfilesPath, "utf-8"));
      if (!authData.profiles) authData.profiles = {};
    } catch {}
  }

  const profileId = `${provider}:default`;
  authData.profiles[profileId] = {
    type: "oauth",
    provider,
    access: creds.access,
    refresh: creds.refresh,
    expires: creds.expires,
    ...(creds.accountId ? { accountId: creds.accountId } : {}),
  };

  writeFileSync(authProfilesPath, JSON.stringify(authData, null, 2));
  propagateAuthToAgents(profileDir);
  triggerGatewayAuthReload(profileDir);

  // Restart gateway so it picks up new credentials
  try {
    const { startGateway } = await import("@/lib/gateway");
    await startGateway();
  } catch {}
}

// ── Route handlers ───────────────────────────────────────────────

/**
 * POST /api/oauth — Handle OAuth connection or direct token save.
 *
 * Actions:
 *   - { provider: "openai", action: "connect" } — Starts PKCE OAuth flow,
 *     opens browser to OpenAI auth page, listens on localhost:1455 for callback.
 *   - { provider: "anthropic", action: "connect" } — Starts PKCE OAuth flow,
 *     opens browser to claude.ai auth page, returns awaitingCode: true.
 *   - { provider: "anthropic", authCode: "..." } — Exchanges Anthropic auth code for tokens.
 *   - { provider, token } — Directly save a token to auth-profiles.json (manual fallback).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, token, action, authCode } = body;

    if (!provider || !["anthropic", "openai"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider. Must be 'anthropic' or 'openai'." },
        { status: 400 }
      );
    }

    const gw = await getGateway();
    // profileDir may be null during setup wizard — OAuth tokens get stored as
    // pending and flushed to auth-profiles.json when the gateway is created.
    const profileDir = gw.profileDir || null;

    // ── Action: "connect" — start OAuth flow ──
    if (action === "connect") {
      if (provider === "openai") {
        try {
          const { authorizeUrl } = await startOpenAICodexOAuth(profileDir);
          return NextResponse.json({ started: true, authorizeUrl });
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to start OAuth flow" },
            { status: 500 }
          );
        }
      }

      // Anthropic — opens browser, returns awaitingCode for UI to show paste input
      try {
        const { authorizeUrl } = await startAnthropicOAuth();
        return NextResponse.json({ started: true, authorizeUrl, awaitingCode: true });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to start OAuth flow" },
          { status: 500 }
        );
      }
    }

    // ── Action: exchange Anthropic auth code ──
    if (authCode && provider === "anthropic") {
      try {
        await exchangeAnthropicCode(profileDir, authCode);
        return NextResponse.json({ success: true, provider, tokenType: "oauth" });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to exchange code" },
          { status: 500 }
        );
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    let tokenType: "token" | "api_key";
    let providerValue: string;

    if (provider === "anthropic") {
      providerValue = "anthropic";
      tokenType = token.startsWith("sk-ant-oat") ? "token" : "api_key";
    } else {
      providerValue = "openai-codex";
      tokenType = "api_key";
    }

    // No profile dir yet — store as pending OAuth token for later flush
    if (!profileDir) {
      if (tokenType === "token") {
        // Setup tokens are OAuth-like — store as pending OAuth
        addPendingOAuthToken(provider, {
          access: token,
          refresh: "",
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        });
      } else {
        // Plain API key — use existing pending key mechanism
        const { addPendingKey } = await import("@/lib/mc-state");
        addPendingKey(provider, token);
      }
      return NextResponse.json({ success: true, provider, tokenType });
    }

    // Stop gateway first to prevent stale snapshot overwrites during shutdown
    try {
      const { stopGateway } = await import("@/lib/gateway");
      await stopGateway();
    } catch {}

    const mainAgentDir = join(profileDir, "agents", "main", "agent");
    mkdirSync(mainAgentDir, { recursive: true });
    const authProfilesPath = join(mainAgentDir, "auth-profiles.json");

    let authData: { version: number; profiles: Record<string, unknown> } = {
      version: 1,
      profiles: {},
    };
    if (existsSync(authProfilesPath)) {
      try {
        authData = JSON.parse(readFileSync(authProfilesPath, "utf-8"));
        if (!authData.profiles) authData.profiles = {};
      } catch {}
    }

    const profileId = `${providerValue}:default`;
    if (tokenType === "token") {
      authData.profiles[profileId] = {
        type: "token",
        provider: providerValue,
        token: token,
      };
    } else {
      authData.profiles[profileId] = {
        type: "api_key",
        provider: providerValue,
        key: token,
      };
    }

    writeFileSync(authProfilesPath, JSON.stringify(authData, null, 2));
    propagateAuthToAgents(profileDir);
    triggerGatewayAuthReload(profileDir);

    // Restart gateway
    try {
      const { startGateway } = await import("@/lib/gateway");
      await startGateway();
    } catch {}

    return NextResponse.json({ success: true, provider, tokenType });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save token" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/oauth — Check OAuth status for providers.
 */
export async function GET() {
  try {
    const gw = await getGateway();
    const providers: Record<string, { connected: boolean; type?: string }> = {
      anthropic: { connected: false },
      openai: { connected: false },
    };

    // Check auth-profiles.json on disk (if profile exists)
    if (gw.profileDir) {
      const mainAuthPath = join(
        gw.profileDir,
        "agents",
        "main",
        "agent",
        "auth-profiles.json"
      );
      if (existsSync(mainAuthPath)) {
        try {
          const authProfiles = JSON.parse(readFileSync(mainAuthPath, "utf-8"));
          const profiles = authProfiles?.profiles || {};

          for (const [key, value] of Object.entries(profiles)) {
            const profile = value as {
              provider?: string;
              type?: string;
              key?: string;
              token?: string;
              access?: string;
            };
            const hasCredential = !!(profile.key || profile.token || profile.access);
            if (
              hasCredential &&
              (profile.provider === "anthropic" || key.startsWith("anthropic:"))
            ) {
              providers.anthropic = { connected: true, type: profile.type };
            }
            if (
              hasCredential &&
              (profile.provider === "openai-codex" ||
                profile.provider === "openai" ||
                key.startsWith("openai"))
            ) {
              providers.openai = { connected: true, type: profile.type };
            }
          }
        } catch {}
      }
    }

    // Also check pending OAuth tokens (saved during wizard before profile exists)
    const { getPendingOAuthTokens, getPendingKeys } = await import("@/lib/mc-state");
    for (const pt of getPendingOAuthTokens()) {
      const key = pt.provider === "openai-codex" || pt.provider === "openai" ? "openai" : pt.provider;
      if (key === "anthropic" || key === "openai") {
        providers[key] = { connected: true, type: "oauth" };
      }
    }
    for (const pk of getPendingKeys()) {
      const key = pk.provider === "openai-codex" ? "openai" : pk.provider;
      if (key === "anthropic" || key === "openai") {
        providers[key] = { connected: true, type: "api_key" };
      }
    }

    return NextResponse.json({ providers });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to check OAuth status",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/oauth — Disconnect a provider.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider } = body;

    if (!provider || !["anthropic", "openai"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway profile" },
        { status: 400 }
      );
    }

    removeProviderAuth(gw.profileDir, provider);
    triggerGatewayAuthReload(gw.profileDir);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}

