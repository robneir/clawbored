import { NextRequest, NextResponse } from "next/server";
import { deleteProviderKey } from "@/lib/provider-keys";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    await deleteProviderKey(provider);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
