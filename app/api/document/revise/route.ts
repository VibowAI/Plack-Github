import { getGeminiClient } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, currentContent, documentTitle } = await req.json();

    const ai = getGeminiClient();

    const systemPrompt = `You are a professional document editor. 
Your task is to REWRITE or MODIFY the document content below based on the user's specific request.

RULES:
1. Return ONLY the new document content in clean Markdown.
2. DO NOT include any conversational filler, explanations, or "Here is the revised document".
3. Preserve the general tone and style of the document unless asked otherwise.
4. If the user asks for a simple change, apply it precisely.
5. If the user asks for a major rewrite, ensure it is high quality.
6. The VERY FIRST LINE of your response MUST BE the document title formatted as an H1 heading (e.g. "# The Title"). Even if the user does not explicitly ask to change the title, keep the old title but formatted as an H1 on the first line.
7. DO NOT wrap the output in <document> tags or any other XML tags. Just return the raw markdown content.

USER REQUEST: "${prompt}"

CURRENT DOCUMENT (Title is on the first line):
---
${currentContent}
---`;

    const result = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents: systemPrompt
    });
    
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result) {
          const chunkText = chunk.text || "";
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (error: any) {
    console.error("Document revision API error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
