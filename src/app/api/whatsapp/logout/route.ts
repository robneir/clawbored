import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { disableWhatsApp } from "@/lib/whatsapp";
import { execSync } from "node:child_process";

/** POST: Disconnect WhatsApp — logout via CLI and remove config. */
export async function POST() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json(
        { error: "No gateway configured" },
        { status: 400 }
      );
    }

    // Try to logout via CLI first (cleans up Baileys session)
    try {
      const profileFlag = gw.profileName ? `--profile ${gw.profileName}` : "";
      execSync(
        `openclaw ${profileFlag} channels logout --channel whatsapp --account default`,
        { timeout: 15000, stdio: "pipe" }
      );
    } catch {
      // CLI might not be available or logout might fail — continue to clean config
    }

    // Remove WhatsApp config and bindings from openclaw.json
    disableWhatsApp(gw.profileDir);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}
