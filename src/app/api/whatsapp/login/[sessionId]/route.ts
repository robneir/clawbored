import { NextResponse } from "next/server";
import { getGateway } from "@/lib/gateway";
import { getLoginSession, isWhatsAppConnected } from "@/lib/whatsapp";

/** GET: Poll a login session for QR code data and connection status. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = getLoginSession(sessionId);

    // Also check filesystem for connection (most reliable signal)
    const gw = await getGateway();
    const fsConnected = gw.profileDir ? isWhatsAppConnected(gw.profileDir) : false;

    if (!session) {
      // Session expired or never existed — check fs status
      return NextResponse.json({
        status: fsConnected ? "connected" : "expired",
        qr: "",
        error: fsConnected ? undefined : "Session expired",
      });
    }

    // Override session status if filesystem shows connected
    const status = fsConnected ? "connected" : session.status;

    return NextResponse.json({
      status,
      qr: session.qrBlock,
      error: session.error,
    });
  } catch {
    return NextResponse.json(
      { status: "error", qr: "", error: "Failed to check session" },
      { status: 500 }
    );
  }
}
