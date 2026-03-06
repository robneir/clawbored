import { NextRequest, NextResponse } from "next/server";
import { listProviderKeys, saveProviderKey } from "@/lib/provider-keys";

export async function GET() {
  try {
    const keys = await listProviderKeys();
    return NextResponse.json({ keys });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "provider and apiKey are required" },
        { status: 400 }
      );
    }

    const result = await saveProviderKey(provider, apiKey);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
