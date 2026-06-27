import { GoogleGenAI } from "@google/genai";

export function getGeminiClientWithFailover(keys: (string | undefined)[]): GoogleGenAI | null {
  for (const key of keys) {
    if (key) {
      return new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return null;
}

export function getGeminiClient(): GoogleGenAI {
  const customAi = getGeminiClientWithFailover([
    process.env.MY_GEMINI_API_KEY, 
    process.env.MY_GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY
  ]);
  if (!customAi) {
    throw new Error("Gemini API key is missing. Please configure GEMINI_API_KEY in your Secrets panel.");
  }
  return customAi;
}

export function getGeminiClientForTitle(): GoogleGenAI {
  const customAi = getGeminiClientWithFailover([
    process.env.MY_GEMINI_API_KEY_2, 
    process.env.MY_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY
  ]);
  if (!customAi) {
    throw new Error("Gemini API key is missing for title generation.");
  }
  return customAi;
}
