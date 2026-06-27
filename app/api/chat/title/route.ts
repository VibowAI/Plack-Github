import { getGeminiClientForTitle } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let chatId: string | undefined = undefined;
  let firstMessage: string | undefined = undefined;
  try {
    const payload = await req.json();
    firstMessage = payload.firstMessage;
    chatId = payload.chatId;

    if (!firstMessage) {
      return NextResponse.json({ error: "firstMessage is required" }, { status: 400 });
    }

    const ai = getGeminiClientForTitle();
    const response = await ai.models.generateContent({
      model: "models/gemini-2.5-flash-lite",
      contents: `Generate a concise conversation title.

Rules:
* 3 to 8 words
* No quotes
* No punctuation at start/end
* Title case
* Summarize the main topic

Return only the title.

User message:
${firstMessage}`,
    });

    let title = response.text?.trim() || "";
    title = title.replace(/^["']|["']$/g, "").trim();

    if (!title) {
      throw new Error("Empty title generated");
    }

    return NextResponse.json({ title });
  } catch (error: any) {
    let fallbackTitle = firstMessage?.slice(0, 60) || "New Conversation";
    console.error("[TITLE GENERATOR ERROR]", error);
    return NextResponse.json({ title: fallbackTitle }, { status: 200 });
  }
}
