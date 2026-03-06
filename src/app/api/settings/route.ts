import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, saveAuthConfig, hasApiKey, clearAuthConfig, getApiKey } from "@/lib/auth";
import { saveProviderKey } from "@/lib/provider-keys";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function GET() {
  try {
    const config = await getAuthConfig();
    const apiKey = await getApiKey();
    return NextResponse.json({
      hasApiKey: await hasApiKey(),
      authMethod: config.authMethod || (apiKey ? "api-key" : null),
      provider: config.provider || "anthropic",
      configuredAt: config.configuredAt || null,
      keyHint: apiKey ? `...${apiKey.slice(-4)}` : null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, provider, authMethod } = body;

    if (authMethod === "subscription") {
      const claudeAuth = detectClaudeSubscription();

      if (claudeAuth.authenticated) {
        await saveAuthConfig({
          authMethod: "subscription",
          provider: provider || "anthropic",
          subscriptionType: claudeAuth.plan,
          claudeCliPath: claudeAuth.cliPath,
        });
        return NextResponse.json({ success: true, plan: claudeAuth.plan });
      } else {
        return NextResponse.json(
          { error: claudeAuth.error || "Claude subscription not detected." },
          { status: 400 }
        );
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    // Save the API key to auth-profiles.json (propagates to all agents)
    await saveProviderKey(provider || "anthropic", apiKey);

    // Save auth method metadata
    await saveAuthConfig({
      authMethod: "api-key",
      provider: provider || "anthropic",
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}

function detectClaudeSubscription(): { authenticated: boolean; plan?: string; cliPath?: string; error?: string } {
  try {
    let cliPath: string;
    try {
      cliPath = execSync("which claude", { encoding: "utf-8" }).trim();
    } catch {
      return { authenticated: false, error: "Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code then sign in with your subscription." };
    }

    try {
      execSync(`"${cliPath}" --version 2>&1`, { encoding: "utf-8", timeout: 5000 }).trim();

      const home = homedir();
      const claudeDir = join(home, ".claude");

      if (!existsSync(claudeDir)) {
        return { authenticated: false, error: "Claude CLI is installed but not signed in. Run 'claude' in your terminal to sign in first." };
      }

      let plan = "Pro";
      try {
        const statusOutput = execSync(`"${cliPath}" --help 2>&1 | head -5`, { encoding: "utf-8", timeout: 5000 });
        if (statusOutput.toLowerCase().includes("max")) plan = "Max";
        if (statusOutput.toLowerCase().includes("team")) plan = "Team";
      } catch {}

      return { authenticated: true, plan, cliPath };
    } catch {
      return { authenticated: false, error: "Claude CLI found but unable to verify authentication." };
    }
  } catch (err) {
    return { authenticated: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function DELETE() {
  try {
    await clearAuthConfig();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}
