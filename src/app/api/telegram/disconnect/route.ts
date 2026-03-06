import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { disableTelegram } from "@/lib/telegram";
import { execSync } from "node:child_process";

/** POST: Disconnect Telegram — remove config and restart gateway. */
export async function POST() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    // Remove Telegram config and bindings from openclaw.json
    disableTelegram(gw.profileDir);

    // Restart the gateway so it drops the Telegram channel
    if (gw.profileName) {
      try {
        execSync(
          `launchctl kickstart -k gui/$(id -u)/ai.openclaw.${gw.profileName}`,
          { timeout: 10000, stdio: "pipe" }
        );
      } catch {
        // Gateway restart failed — config is already removed
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}
