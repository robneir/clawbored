import { NextRequest, NextResponse } from "next/server";
import { validateBotToken } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const result = await validateBotToken(token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
