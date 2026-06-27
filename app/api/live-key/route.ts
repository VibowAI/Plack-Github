import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.MY_GEMINI_API_KEY || process.env.MY_GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }
  return NextResponse.json({ apiKey: key });
}
