import { getGeminiClient } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const searchParams = req.nextUrl.searchParams;
  
  // Custom query parameters for live debugging/testing combinations
  const requestedModel = searchParams.get("model") || "models/gemini-3.1-flash-lite-preview";
  const requestedTool = searchParams.get("tool") || "googleSearch"; // 'googleSearch' | 'googleSearchRetrieval' | 'none'
  const useExternalSearch = searchParams.get("external") === "true"; // Simulate or format using external search API mock
  
  const chatId = "debug-websearch-test-session";
  const requestId = "debug-req-" + Math.random().toString(36).substr(2, 9);
  
  const results: any[] = [];
  let totalGeminiCalls = 0;
  let totalSearchCalls = 0;
  let modelsUsed: string[] = [];

  // Log Gemini request configuration as requested
  const toolsConfig = requestedTool === "googleSearch" 
    ? [{ googleSearch: {} }] 
    : requestedTool === "googleSearchRetrieval"
      ? [{ googleSearchRetrieval: {} } as any]
      : [];

  console.log("[GEMINI CONFIG]", {
    model: requestedModel,
    tools: toolsConfig,
    grounding: requestedTool !== "none" ? "Google Search Grounding requested" : "None",
  });

  // Diagnostic execution
  if (useExternalSearch) {
    // 1. External search mock/provider workflow:
    // User Message -> DuckDuckGo/Mock Search -> Gemini summarizing matches -> Final Response
    totalSearchCalls += 1;
    totalGeminiCalls += 1;
    modelsUsed.push(requestedModel);

    console.log("[GEMINI CALL]", {
      timestamp: new Date().toISOString(),
      purpose: "Source Summarization",
      model: requestedModel,
      chatId,
      requestId: requestId + "-ext-summary",
    });

    try {
      const ai = getGeminiClient();
      const mockSearchResults = [
        { title: "Gemini 3 Search Grounding Quotas", snippet: "Gemini 3 Search Grounding uses an independent quota bucket under Google GenAI SDK. If this quota is 0, requests with tools: [{ googleSearch: {} }] fail with 429 RESOURCE_EXHAUSTED." },
        { title: "Resolving 429 Resource Exhausted on Grounding", snippet: "Users experiencing 429 errors only when Web Search is enabled should verify their project's Search Grounding limits. Grounding utilizes a distinct tier separate from basic generation tokens." }
      ];

      const summarizationPrompt = `Summarize the following search mock results for New York time or custom query: ${JSON.stringify(mockSearchResults)}`;
      
      const summaryResponse = await ai.models.generateContent({
        model: requestedModel,
        contents: summarizationPrompt,
        config: { temperature: 0.1 }
      });

      results.push({
        step: "External Search Mock & Summarization Successful",
        summaryText: summaryResponse.text,
        inputSources: mockSearchResults
      });
    } catch (err: any) {
      results.push({
        step: "External Summarization Failed",
        error: err.message || String(err)
      });
    }
  } else {
    // 2. Native Search Grounding workflow:
    totalSearchCalls += 1;
    totalGeminiCalls += 1;
    modelsUsed.push(requestedModel);

    console.log("[GEMINI CALL]", {
      timestamp: new Date().toISOString(),
      purpose: "Final Answer Generation",
      model: requestedModel,
      chatId,
      requestId: requestId + "-native-grounding",
    });

    try {
      const ai = getGeminiClient();
      const runConfig: any = {
        temperature: 0.1,
      };

      if (requestedTool === "googleSearch") {
        runConfig.tools = [{ googleSearch: {} }];
      } else if (requestedTool === "googleSearchRetrieval") {
        // Test old style/alternative naming if needed
        runConfig.tools = [{ googleSearchRetrieval: {} }];
      }

      console.log(`[WEB SEARCH GEMINI REQUEST]
timestamp: ${new Date().toISOString()}
chatId: ${chatId}
model: ${requestedModel}
purpose: Final Answer Generation`);

      const response = await ai.models.generateContent({
        model: requestedModel,
        contents: "What is the current local time or latest news in New York today?",
        config: runConfig
      });

      results.push({
        step: "Native Grounding Request Successful",
        text: response.text,
        groundingMetadata: response.candidates?.[0]?.groundingMetadata || null
      });
    } catch (err: any) {
      results.push({
        step: "Native Grounding Request Failed",
        error: err.message || String(err),
        suggestion: "If error is 429 / RESOURCE_EXHAUSTED, it confirms your Google AI Studio project has no 'Gemini 3 Search Grounding' quota provisioned."
      });
    }
  }

  const executionTimeMs = Date.now() - startTime;

  // Print summary to match the requested output configuration
  console.log("[REQUEST SUMMARY]", {
    chatId,
    totalGeminiRequests: totalGeminiCalls,
    breakdown: useExternalSearch 
      ? ["External Search Simulation", "Source Summarization"]
      : ["Native Grounding & Answer Generation"]
  });

  return NextResponse.json({
    "Total Gemini Calls": totalGeminiCalls,
    "Total Search Calls": totalSearchCalls,
    "Models Used": modelsUsed,
    "Execution Time": `${executionTimeMs}ms`,
    "Requested Configuration": {
      model: requestedModel,
      toolRequested: requestedTool,
      useExternalSearch
    },
    results
  });
}
