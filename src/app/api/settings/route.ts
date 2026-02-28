import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, saveAuthConfig, hasApiKey } from "@/lib/auth";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function GET() {
  try {
    const config = getAuthConfig();
    return NextResponse.json({
      hasApiKey: hasApiKey(),
      authMethod: config.authMethod || (config.anthropicApiKey ? "api-key" : null),
      provider: config.provider || "anthropic",
      configuredAt: config.configuredAt || null,
      keyHint: config.anthropicApiKey
        ? `...${config.anthropicApiKey.slice(-4)}`
        : null,
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
      // Attempt to connect via Claude CLI / OAuth
      // First check if Claude CLI is installed and authenticated
      const claudeAuth = detectClaudeSubscription();
      
      if (claudeAuth.authenticated) {
        saveAuthConfig({
          authMethod: "subscription",
          provider: provider || "anthropic",
          subscriptionType: claudeAuth.plan,
          claudeCliPath: claudeAuth.cliPath,
        });
        return NextResponse.json({ success: true, plan: claudeAuth.plan });
      } else {
        return NextResponse.json(
          { error: claudeAuth.error || "Claude subscription not detected. Please install Claude CLI and sign in first, or use an API key instead." },
          { status: 400 }
        );
      }
    }

    // API key flow
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    saveAuthConfig({
      anthropicApiKey: apiKey,
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
    // Check if claude CLI exists
    let cliPath: string;
    try {
      cliPath = execSync("which claude", { encoding: "utf-8" }).trim();
    } catch {
      return { authenticated: false, error: "Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code then sign in with your subscription." };
    }

    // Check if claude is authenticated by running a quick status check
    try {
      const output = execSync(`"${cliPath}" --version 2>&1`, { encoding: "utf-8", timeout: 5000 }).trim();
      
      // Check for auth files
      const home = homedir();
      const claudeDir = join(home, ".claude");
      
      if (!existsSync(claudeDir)) {
        return { authenticated: false, error: "Claude CLI is installed but not signed in. Run 'claude' in your terminal to sign in first." };
      }

      // If we get here, Claude CLI exists and has a config directory
      // Detect plan from the CLI output or config
      let plan = "Pro"; // Default assumption
      try {
        const statusOutput = execSync(`"${cliPath}" --help 2>&1 | head -5`, { encoding: "utf-8", timeout: 5000 });
        if (statusOutput.toLowerCase().includes("max")) plan = "Max";
        if (statusOutput.toLowerCase().includes("team")) plan = "Team";
      } catch {
        // Fine, default to Pro
      }

      return { authenticated: true, plan, cliPath };
    } catch {
      return { authenticated: false, error: "Claude CLI found but unable to verify authentication. Run 'claude' in your terminal to sign in." };
    }
  } catch (err) {
    return { authenticated: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
