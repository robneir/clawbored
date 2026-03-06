import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { isWhatsAppConnected, getWhatsAppConfig } from "@/lib/whatsapp";

export async function GET() {
  try {
    const gw = await getGateway();
    if (!gw.profileDir) {
      return NextResponse.json({ connected: false, configured: false });
    }

    const config = getWhatsAppConfig(gw.profileDir);
    const connected = isWhatsAppConnected(gw.profileDir);

    return NextResponse.json({
      connected,
      configured: !!config,
    });
  } catch {
    return NextResponse.json({ connected: false, configured: false });
  }
}
