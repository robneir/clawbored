import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { startLoginSession, stopLoginSession, enableWhatsApp } from "@/lib/whatsapp";
import { execSync } from "node:child_process";

/** POST: Start a WhatsApp login session (spawns CLI for QR code). */
export async function POST() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    // Enable WhatsApp plugin + channel config. Returns true if config changed.
    const configChanged = enableWhatsApp(gw.profileDir);

    // If config changed (plugin just enabled), restart the gateway so it loads the plugin.
    // The login CLI command works independently, but the gateway needs the plugin
    // to handle WhatsApp messages after linking.
    if (configChanged && gw.profileName) {
      try {
        // Validate config before restart
        execSync(
          `openclaw --profile ${gw.profileName} doctor --fix`,
          { timeout: 15000, stdio: "pipe" }
        );
      } catch {
        // doctor might fail if gateway is in an odd state — continue anyway
      }

      try {
        // Kickstart the launchd service (-k kills first, then restarts)
        execSync(
          `launchctl kickstart -k gui/$(id -u)/ai.openclaw.${gw.profileName}`,
          { timeout: 10000, stdio: "pipe" }
        );
        // Wait briefly for gateway to come back up
        await new Promise((r) => setTimeout(r, 3000));
      } catch {
        // Gateway restart failed — the login CLI might still work
      }
    }

    const sessionId = startLoginSession(gw.profileDir);
    return NextResponse.json({ sessionId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start login" },
      { status: 500 }
    );
  }
}

/** DELETE: Stop an active login session. */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (sessionId) {
      stopLoginSession(sessionId);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
