import { getGeminiClient } from "@/lib/gemini";

export interface MemoryClassification {
  intent: 'NORMAL_CHAT' | 'MEMORY_ADD' | 'MEMORY_UPDATE' | 'MEMORY_DELETE' | 'DOCUMENT_EDIT' | 'FILE_EDIT' | 'PROFILE_UPDATE';
  confidence: number;
  category: 'preference' | 'fact' | 'personal' | 'project' | 'style';
  memory: string; // Concise third-person summary of the memory
  targetMemoryId?: string; // ID of the existing memory to update or delete
}

export async function classifyMemory(
  userText: string, 
  currentMemories: {id: string, content: string, category?: string}[] = [],
  conversationHistory: string = "",
  customKeys?: (string | undefined)[]
): Promise<MemoryClassification | null> {
  const ai = getGeminiClient(customKeys);
  
  console.log(`[MEMORY INTENT REQUEST] Analyzing user text for intent: "${userText}"`);

  let memoriesContext = "Currently stored memories for this user:\n";
  if (currentMemories.length > 0) {
    currentMemories.forEach(m => {
      memoriesContext += `[ID: ${m.id}] [Category: ${m.category || 'general'}] ${m.content}\n`;
    });
  } else {
    memoriesContext += "None.\n";
  }

  const classificationPrompt = `Analyze the user's message, conversation history, and currently stored memories to determine the user's true intent.

User Message: "${userText}"

Conversation History context (recent messages):
${conversationHistory || "None"}

${memoriesContext}

Supported Intents:
- "NORMAL_CHAT": Standard chatting, coding, queries, general conversations, or requests NOT explicitly targetting memory storage, document creation, file editing, or profile updates.
- "MEMORY_ADD": Explicitly demanding to "remember", "save", "keep in mind", "remember that I...", "store" a fact, preference, style, or detail. Note: General remarks like "I like pizza" without explicit intent to register/store memory should be classified as NORMAL_CHAT or lower confidence unless they explicitly want it remembered.
- "MEMORY_UPDATE": Requesting to change, correct, update, swap, or modify a previously saved memory (e.g., "Change my project from React to Svelte", "Update my favorite color to blue").
- "MEMORY_DELETE": Requesting to delete, forget, erase, clear, remove, or throw away an existing memory (e.g., "Forget that I am sweet", "Delete the preference about Python").
- "DOCUMENT_EDIT": Requests targeting creating, editing, rewriting, or modifying a document block/workspace artifact.
- "FILE_EDIT": Requests targeting modifying or writing files in the repository.
- "PROFILE_UPDATE": Explicit request to update user's profile card/settings.

COGNITIVE/CONFIDENCE RULES:
1. To safeguard against aggressive auto-detection, DO NOT assume generic words like "change", "update", "replace", "edit", "modify", "HTML" automatically mean a memory action.
2. If the user's command is ambiguous or incomplete, such as "Change it to HTML" or "Just update it", the intent could refer to editing a document, editing a file, compiling code, or editing a memory. Therefore, you MUST set "confidence" below 0.90 (e.g., 0.60 or 0.70) because the exact target is unclear.
3. For "MEMORY_UPDATE" or "MEMORY_DELETE", look through the stored memories. Find the most relevant matching memory and return its "targetMemoryId". If no relevant memory exists in the list, set confidence below 0.90.
4. "confidence" must be between 0.0 and 1.0. High confidence (>= 0.90) must represent a pristine, clear, unambiguous request!

Return a JSON object in this format:
{
  "intent": 'NORMAL_CHAT' | 'MEMORY_ADD' | 'MEMORY_UPDATE' | 'MEMORY_DELETE' | 'DOCUMENT_EDIT' | 'FILE_EDIT' | 'PROFILE_UPDATE',
  "confidence": number,
  "category": 'preference' | 'fact' | 'personal' | 'project' | 'style',
  "memory": "string (concise third-person statement, e.g. 'The user prefers Next.js')",
  "targetMemoryId": "string (matching memory ID from list if MEMORY_UPDATE or MEMORY_DELETE, else empty string or null)"
}

Examples:
- "Change my memory from learning React to learning HTML."
  Matching memory: "[ID: mem_1] The user is learning React."
  Output: { "intent": "MEMORY_UPDATE", "confidence": 0.98, "category": "preference", "memory": "The user is learning HTML", "targetMemoryId": "mem_1" }

- "Change it to HTML" (Ambiguous context)
  Output: { "intent": "MEMORY_UPDATE", "confidence": 0.65, "category": "preference", "memory": "The user prefers HTML", "targetMemoryId": "" }

- "Delete my preference about learning python"
  Matching memory: "[ID: mem_2] The user prefers playing with python."
  Output: { "intent": "MEMORY_DELETE", "confidence": 0.96, "category": "preference", "memory": "The user prefers playing with python", "targetMemoryId": "mem_2" }
`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: 'user', parts: [{ text: classificationPrompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = result.text || "{}";
    const classification = JSON.parse(text) as MemoryClassification;
    
    console.log("[INTENT DETECTED]", classification.intent);
    console.log("[INTENT CONFIDENCE]", classification.confidence);
    if (classification.targetMemoryId) {
      console.log("[MEMORY MATCH]", classification.targetMemoryId);
    }
    
    return classification;
  } catch (err) {
    console.error("[MEMORY CLASSIFICATION FAILED]", err);
    return null;
  }
}
