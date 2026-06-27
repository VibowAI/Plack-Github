import { getGeminiClient } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { content, selection, instruction } = await req.json();

    if (!content || !instruction) {
      return NextResponse.json({ error: "Document content and instruction are required" }, { status: 400 });
    }

    const ai = getGeminiClient();

    const editPrompt = `You are a professional editor. Your task is to modify the provided text according to the user's instructions.

CONTEXT TEXT OR WHOLE DOCUMENT:
"""
${content}
"""

${selection ? `THE SPECIFC RANGE SELECTED FOR MODIFICATION:\n"""\n${selection}\n"""` : ''}

USER EDIT INSTRUCTION:
"${instruction}"

RULES:
1. Apply the user instruction accurately and elegantly.
2. Return ONLY the modified text. Do NOT wrap it in conversational greetings, explanations, or backticks unless the user explicitly requested code backticks. 
3. Maintain the language, formatting, and markdown structure of the original document where possible.
4. If a specific range was selected, return the replacement for that selected range. If no selection was provided, return the full modified document.`;

    const response = await ai.models.generateContent({
      model: "models/gemini-3.1-flash-lite-preview",
      contents: editPrompt,
      config: {
        temperature: 0.3,
      }
    });

    const editedText = response.text || "";
    return NextResponse.json({ text: editedText.trim() });

  } catch (error: any) {
    console.error("[DOCUMENT EDIT ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to process document edit instruction" }, { status: 500 });
  }
}
