import { getGeminiClient } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt } from "@/lib/ai/system-prompts";
import { getMemories, saveMemory, updateMemory, deleteMemory } from "@/lib/supabase/memories";
import { createAdminClient } from "@/lib/supabase/client";
import { detectDocumentTrigger } from "@/lib/ai/intent";
import { classifyMemory } from "@/lib/ai/memory-classifier";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  parts?: any[];
}

let chatRequestCount = 0;

export async function POST(req: NextRequest) {
  let chatId: string | undefined = undefined;
  let model = "models/gemini-3.1-flash-lite-preview";
  try {
    const payload = await req.json();
    chatId = payload.chatId;
    model = payload.model || "models/gemini-3.1-flash-lite-preview";
    const isDeepResearch = payload.isDeepResearch === true;
    const { 
      messages, 
      systemInstructionOverride, 
      useWebSearch,
      messageId,
      userId,
      autoSaveMemories = true,
      deepResearchWebSearch = true,
      preferredDomains = [],
      activeMemories
    } = payload;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    chatRequestCount++;
    console.log(`[MODEL] GEMINI CHAT REQUEST | Chat ID: ${chatId || 'N/A'} | Model: ${model} | DeepResearch: ${isDeepResearch} | Count: ${chatRequestCount}`);

    const ai = getGeminiClient();

    // 1. Retrieve Memories
    let memoryContext = "";
    let memoriesUsedCount = 0;
    let memoriesUsedList: any[] = [];
    
    // First priority: Manual memories passed from frontend picker
    if (activeMemories && Array.isArray(activeMemories) && activeMemories.length > 0) {
      memoriesUsedCount = activeMemories.length;
      memoriesUsedList = activeMemories;
      memoryContext = "=== USER MEMORIES ===\nThese are specific memories explicitly selected by the user for this conversation priority:\n";
      console.log(`[SYSTEM PROMPT MEMORIES] Injecting ${activeMemories.length} explicitly selected memories.`);
      activeMemories.forEach((m: any, i: number) => {
        memoryContext += `${i + 1}. [${m.category || 'User Fact'}] ${m.content}\n`;
      });
      memoryContext += "=====================\n\n";
    } 
    // Second priority: Automatic memories fetched from DB
    else if (userId) {
      try {
        const fetchAll = await getMemories(userId);
        const autoLimit = fetchAll.slice(0, 15); // limit somewhat
        memoriesUsedList = autoLimit;
        
        if (autoLimit.length > 0) {
          memoriesUsedCount = autoLimit.length;
          memoryContext = "=== USER MEMORIES ===\nThese are things you have remembered about the user from previous conversations:\n";
          console.log(`[SYSTEM PROMPT MEMORIES] Injecting ${autoLimit.length} auto-retrieved memories into system prompt.`);
          autoLimit.forEach((m, i) => {
            memoryContext += `${i + 1}. [${m.category}] ${m.content}\n`;
          });
          memoryContext += "=====================\n\n";
        }
      } catch (err) {
        console.error("[MEMORY] Failed to fetch memories automatically", err);
      }
    }

    // Extract Adaptive User Profile Summary from dialogue history (no storage limit, memory-free)
    let profileSummary: any = null;
    if (messages && messages.length > 1) {
      try {
        const recentMessages = messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || ""}`).join("\n");
        const profilePrompt = `You are a high-fidelity user profiling assistant for Plack. 
Analyze the dialogue history between a User and their Assistant below. 
Deduce:
1. "writingStyle": user's preferred writing style (e.g. Concise, Academic, Playful, Bullet-points, Creative)
2. "uiStyle": user's preferred UI / Design style (e.g. Minimalist card style, information-dense, dark workspace)
3. "interests": user's recurring topics or values (e.g. distributed systems, UI prototyping, creative copywriting)
4. "projectTypes": user's common project format (e.g. fullstack web application, system design specification)

Dialogue history:
${recentMessages}

Respond with exactly a JSON object, containing nothing else, in this exact format:
{
  "writingStyle": "brief deduction",
  "uiStyle": "brief deduction",
  "interests": "brief deduction",
  "projectTypes": "brief deduction"
}`;
        const profileRes = await ai.models.generateContent({
          model: "models/gemini-3.1-flash-lite-preview",
          contents: [{ role: 'user', parts: [{ text: profilePrompt }] }],
          config: { responseMimeType: "application/json" }
        });
        profileSummary = JSON.parse(profileRes.text || "{}");
        console.log("[ADAPTIVE PROFILE FETCHED]", profileSummary);
      } catch (err) {
        console.warn("[ADAPTIVE PROFILE] Inference failed, proceeding", err);
      }
    }

    // Map message history to GenAI SDK Content format
    let userText = "";
    const contents = messages.map((m: ChatMessage) => {
      if (m.role === 'user') {
        if (typeof m.content === 'string') userText = m.content;
        else if (m.parts) {
          const textPart = m.parts.find(p => p.text);
          if (textPart) userText = textPart.text;
        }
      }
      if (m.parts && m.parts.length > 0) {
        return {
          role: m.role,
          parts: m.parts.map(p => {
            if (p.inlineData) {
              return {
                inlineData: {
                  mimeType: p.inlineData.mimeType,
                  data: p.inlineData.data
                }
              };
            }
            return { text: p.text || "" };
          })
        };
      }
      return {
        role: m.role,
        parts: [{ text: m.content }]
      };
    });

    const encoder = new TextEncoder();
    let isClientConnected = true;
    let fullResponseText = "";

    let savedMemoryPayload: any = null;
    let memoryReviewNeeded: any = null;
    let memoryUpdateNeeded: any = null;
    let memoryDeleteNeeded: any = null;
    let isMemoryLimitReached = false;
    let isMemorySaveFailed = false;

    // DEEP RESEARCH MODE WORKFLOW
    if (isDeepResearch) {
      const customReadableStream = new ReadableStream({
        async start(controller) {
          try {
            // Find user message query
            const lastUserMessage = messages[messages.length - 1];
            let userPrompt = "deep research";
            if (lastUserMessage) {
              if (typeof lastUserMessage.content === 'string' && lastUserMessage.content) {
                userPrompt = lastUserMessage.content;
              } else if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
                const textPart = lastUserMessage.parts.find((p: any) => p.text && typeof p.text === 'string');
                if (textPart) userPrompt = textPart.text;
              }
            }

            const timeline = [
              "Understanding request",
              "Planning research",
              "Searching sources",
              "Analyzing sources",
              "Cross-checking information",
              "Generating report",
              "Completed"
            ];

            // 1. UNDERSTANDING REQUEST
            if (memoriesUsedCount > 0) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                memoriesUsedCount,
                memoriesUsed: memoriesUsedList,
                isManualMemories: activeMemories && activeMemories.length > 0
              }) + "\n"));
            }
            if (memoryUpdateNeeded) {
              controller.enqueue(encoder.encode(JSON.stringify({ memoryUpdateNeeded }) + "\n"));
            }
            if (profileSummary) {
              controller.enqueue(encoder.encode(JSON.stringify({ profileSummary }) + "\n"));
            }

            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 0, 
              researchStatus: "Analyzing prompt intent..." 
            }) + "\n"));

            // 2. PLANNING RESEARCH
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 1, 
              researchStatus: "Generating search query strategies..." 
            }) + "\n"));

            let searchQueries = [userPrompt];
            try {
              const queryGenerationPrompt = `We are conducting in-depth research on: "${userPrompt}".
              Formulate exactly three discrete, distinct search queries that explore this topic from multiple dimensions (theoretical, empirical, current context, counterarguments, etc.).
              Return ONLY a JSON array of strings, with no markdown tags or text around it. Example: ["query 1", "query 2", "query 3"]`;
              
              const queryResponse = await ai.models.generateContent({
                model: "models/gemini-3.1-flash-lite-preview",
                contents: queryGenerationPrompt
              });

              const responseText = queryResponse.text || "";
              const cleanedJson = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
              const parsedQueries = JSON.parse(cleanedJson);
              if (Array.isArray(parsedQueries) && parsedQueries.length > 0) {
                searchQueries = parsedQueries;
              }
            } catch (err: any) {
              console.warn("[DEEP RESEARCH] Failed to generate multi-queries, falling back to original user prompt", err.message || err);
            }

            // 3. SEARCHING SOURCES
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 2, 
              researchStatus: `Acquiring references for multi-perspective search queries (${searchQueries.length} channels)...` 
            }) + "\n"));

            let searchSources: any[] = [];
            const searchTavily = async (queryStr: string, useStrictDomains = true) => {
              if (!deepResearchWebSearch) {
                console.log("[DEEP RESEARCH] Web search is toggled OFF. Reasoning only.");
                return [];
              }
              if (!process.env.TAVILY_API_KEY) {
                console.warn("[WEB_SEARCH] Tavily API Key missing during Deep Research");
                return [];
              }
              try {
                let finalQuery = queryStr;
                if (useStrictDomains && preferredDomains && preferredDomains.length > 0) {
                  const sitesFilter = preferredDomains.map((d: string) => `site:${d}`).join(" OR ");
                  finalQuery = `(${queryStr}) (${sitesFilter})`;
                }
                const res = await fetch("https://api.tavily.com/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    api_key: process.env.TAVILY_API_KEY,
                    query: finalQuery,
                    search_depth: "basic",
                    max_results: 3
                  })
                });
                if (res.ok) {
                  const d = await res.json();
                  return d.results || [];
                }
              } catch (e) {
                console.error(`[WEB_SEARCH] Tavily query fail for ${queryStr}`, e);
              }
              return [];
            };

            for (let i = 0; i < searchQueries.length; i++) {
              const currentQuery = searchQueries[i];
              controller.enqueue(encoder.encode(JSON.stringify({ 
                researchStatus: `Searching index database for: "${currentQuery.substring(0, 35)}..." (${i+1}/${searchQueries.length})` 
              }) + "\n"));

              let results: any[] = [];
              const hasPreferredDomains = preferredDomains && preferredDomains.length > 0;

              if (hasPreferredDomains) {
                const domainResults = await searchTavily(currentQuery, true);
                results.push(...domainResults);
              }

              if (deepResearchWebSearch && (!hasPreferredDomains || results.length < 3)) {
                // Get additional general web results
                const generalResults = await searchTavily(currentQuery, false);
                
                // Deduplicate URLs
                const existingUrls = new Set(results.map((r: any) => r.url));
                generalResults.forEach((r: any) => {
                  if (!existingUrls.has(r.url)) {
                    results.push(r);
                  }
                });
              }

              results.forEach((r: any) => {
                searchSources.push({
                  title: r.title,
                  url: r.url,
                  content: r.content
                });
              });
            }

            // Fallback default search if nothing found
            if (searchSources.length === 0 && deepResearchWebSearch) {
              console.log("[DEEP RESEARCH] No search resources gathered. Searching base query as fallback...");
              const fallbackResults = await searchTavily(userPrompt, false);
              fallbackResults.forEach((r: any) => {
                searchSources.push({
                  title: r.title,
                  url: r.url,
                  content: r.content
                });
              });
            }

            // Stream sources back to clients
            if (searchSources.length > 0) {
              controller.enqueue(encoder.encode(JSON.stringify({ sources: searchSources }) + "\n"));
            }

            // 4. ANALYZING SOURCES
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 3, 
              researchStatus: "Cross-referencing resources and identifying critical conflicts..." 
            }) + "\n"));

            let sourcesContext = "COORDINATED SOURCES:\n\n";
            searchSources.forEach((src, idx) => {
              sourcesContext += `[Source ${idx+1}]\nTitle: ${src.title}\nURL: ${src.url}\nContent: ${src.content}\n\n`;
            });

            const synthesisPrompt = `You are Plack's Head of Research. We are analyzing: "${userPrompt}".
            Below are our gathered sources:\n\n${sourcesContext}\n\n
            Perform a meticulous step-by-step comparative analysis. Locate any direct contradictions, complementary insights, or factual gaps across these sources. Formulate initial draft claims.
            Express your thoughts and synthesis steps out loud.`;

            const synthStream = await ai.models.generateContentStream({
              model: "models/gemini-3.1-flash-lite-preview",
              contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
              config: { temperature: 0.5 }
            });

            let draftSynthesis = "";
            for await (const chunk of synthStream) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              draftSynthesis += text;
              // Stream as models thoughts
              controller.enqueue(encoder.encode(JSON.stringify({ thought: text }) + "\n"));
            }

            // 5. CROSS-CHECKING INFORMATION
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 4, 
              researchStatus: "Running fact auditing algorithms and resolving duplicate points..." 
            }) + "\n"));

            const verificationPrompt = `You are Plack's Principal Quality Verifier. 
            Review the drafted analysis below against the original source materials.
            
            Original materials:\n${sourcesContext.substring(0, 4000)}
            
            Draft analysis:\n${draftSynthesis}
            
            Evaluate and audit:
            1. Factual consistency: Are all assertions backed up by the sources?
            2. Structural check: Identify any duplicate arguments or repetitive statements.
            3. Citations correctness: Check if indices are mapped correctly.
            Provide your comprehensive critique and list recommended enhancements. Express your evaluation thoughts out loud so we can improve the final report.`;

            const verifyStream = await ai.models.generateContentStream({
              model: "models/gemini-3.1-flash-lite-preview",
              contents: [{ role: 'user', parts: [{ text: verificationPrompt }] }],
              config: { temperature: 0.3 }
            });

            let peerReview = "";
            for await (const chunk of verifyStream) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              peerReview += text;
              controller.enqueue(encoder.encode(JSON.stringify({ thought: text }) + "\n"));
            }

            // 6. GENERATING REPORT
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 5, 
              researchStatus: "Synthesizing critique and compiling publication-quality document..." 
            }) + "\n"));

            const compilerPrompt = `You are Plack's Editorial Director. Compile the definitive public-facing research document based on:
            
            Query: "${userPrompt}"
            Sources: \n${sourcesContext}
            Draft Synthesis: \n${draftSynthesis}
            Audit Peer Review Criticism: \n${peerReview}
            
            Synthesize the materials and correct any flaws identified in the audit notes. 
            You must structure your response EXACTLY into the following markdown parts:
            
            # Executive Summary
            [A professional, highly polished overview summarizing the entire topic findings]
            
            # Detailed Findings
            [Clean structured thematic paragraphs with clear subdivisions. Cite things as (Source X) where relevant]
            
            # Key Insights
            [Unpack deep key takeaways as synthesized bullets]
            
            # Sources
            [Numbered list of sources. Format: [Name of Source](URL) - snippet detail]
            
            # Limitations
            [Document any unresolved conflicts, gaps in materials, or known unknowns]`;

            const compilerStream = await ai.models.generateContentStream({
              model: "models/gemini-3.1-flash-lite-preview",
              contents: [{ role: 'user', parts: [{ text: compilerPrompt }] }],
              config: { temperature: 0.4 }
            });

            for await (const chunk of compilerStream) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              controller.enqueue(encoder.encode(JSON.stringify({ text: text }) + "\n"));
            }

            // 7. COMPLETED
            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 7, 
              researchStatus: "Deep Research analysis pipeline complete." 
            }) + "\n"));


          } catch (err: any) {
            console.error("[DEEP RESEARCH STREAM FAILS]", err);
            controller.enqueue(encoder.encode(JSON.stringify({ error: err.message || "Deep Research stream error" }) + "\n"));
          } finally {
            controller.close();
          }
        }
      });

      return new Response(customReadableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    let finalUseWebSearch = useWebSearch;

    // AI Classification to determine Web Search (if not manually enabled)
    const lastUserMessage = messages[messages.length - 1];
    let queryForSearch = "";
    if (lastUserMessage) {
      if (typeof lastUserMessage.content === 'string' && lastUserMessage.content) {
        queryForSearch = lastUserMessage.content;
      } else if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
        const textPart = lastUserMessage.parts.find((p: any) => p.text && typeof p.text === 'string');
        if (textPart) queryForSearch = textPart.text;
      }
    }

    if (!finalUseWebSearch && queryForSearch && !isDeepResearch) {
      try {
        const classifyPrompt = `Based on the following query, determine if a web search is required to provide an accurate response.
Web search is required if the query involves:
- current events
- recent information
- factual verification (e.g. checking data, news, prices)
- source requirements

Query: "${queryForSearch}"
Respond with a JSON object: { "requiresSearch": boolean }`;
        const classifyRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{ role: 'user', parts: [{ text: classifyPrompt }] }],
          config: { responseMimeType: "application/json" }
        });
        const classifyData = JSON.parse(classifyRes.text || "{}");
        if (classifyData.requiresSearch === true) {
          finalUseWebSearch = true;
          console.log("[WEB_SEARCH_CLASSIFIER] Auto-activated Web Search for query.");
        }
      } catch (err) {
        console.warn("[WEB_SEARCH_CLASSIFIER] Classification failed, continuing normal flow.");
      }
    }

    // STANDARD CHAT / WEB SEARCH WORKFLOWS
    let searchSources: any[] = [];

    if (finalUseWebSearch) {
      if (!process.env.TAVILY_API_KEY) {
        console.error("[ERROR] Web Search API key missing");
      } else {
        const lastUserMessage = messages[messages.length - 1];
        let query = "";
        if (lastUserMessage) {
          if (typeof lastUserMessage.content === 'string' && lastUserMessage.content) {
            query = lastUserMessage.content;
          } else if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
            const textPart = lastUserMessage.parts.find((p: any) => p.text && typeof p.text === 'string');
            if (textPart) {
              query = textPart.text;
            }
          }
        }

        if (query) {
          console.log(`[WEB_SEARCH] Starting search for query: ${query.substring(0, 50)}...`);

          try {
            const tavilyRes = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query: query,
                search_depth: "basic",
                max_results: 5,
                include_answer: false,
                include_images: false,
                include_raw_content: false
              })
            });

            if (!tavilyRes.ok) {
               throw new Error(`Tavily API failed with status ${tavilyRes.status}`);
            }
            
            const tavilyData = await tavilyRes.json();
            const results = tavilyData.results || [];
            
            console.log(`[WEB_SEARCH] Tavily response received. Results: ${results?.length}`);
            
            searchSources = results.map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content
            }));

            console.log("[WEB_SEARCH] SUCCESS", {
              chatId: chatId || "N/A",
              sourceCount: searchSources.length
            });
            
            if (searchSources.length > 0) {
              let contextStr = "WEB SEARCH RESULTS:\n\n";
              searchSources.forEach((src: any, i: number) => {
                contextStr += `[Source ${i + 1}]\nTitle: ${src.title}\nURL: ${src.url}\nContent: ${src.content}\n\n`;
              });
              contextStr += `User Question:\n${query}\n\n(Base your answer primarily on the Web Search Results above if relevant. Ensure you cite your facts. Provide a helpful response.)`;
              
              if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
                const textPartIndex = lastUserMessage.parts.findIndex((p: any) => p.text && typeof p.text === 'string');
                if (textPartIndex !== -1) {
                  lastUserMessage.parts[textPartIndex].text = contextStr;
                } else {
                  lastUserMessage.parts.push({ text: contextStr });
                }
              } else {
                lastUserMessage.content = contextStr;
              }
            } else {
              console.log("[WEB_SEARCH] No web results were found.");
            }
          } catch (err: any) {
            console.error("[TAVILY ERROR]", err);
          }
        }
      }
    }
  
    const isDocIntent = detectDocumentTrigger(userText);
    
    // Fetch all current memories for classification context
    let currentMemoriesForClassification: any[] = [];
    if (userId) {
      try {
        currentMemoriesForClassification = await getMemories(userId);
      } catch (err) {}
    }

    const classification = await classifyMemory(userText, currentMemoriesForClassification);
    
    if (classification) {
      console.log(`[INTENT DETECTED]: ${classification.intent}`);
      console.log(`[INTENT CONFIDENCE]: ${Math.round(classification.confidence * 100)}%`);
      if (classification.intent === 'MEMORY_UPDATE' || classification.intent === 'MEMORY_DELETE') {
        const scoreVal = Math.round(classification.confidence * 100);
        console.log(`[MEMORY MATCH]: ID ${classification.targetMemoryId || 'None'} Match with ${scoreVal}% score`);
      } else {
        console.log(`[MEMORY MATCH]: None`);
      }
    } else {
      console.log(`[INTENT DETECTED]: NORMAL_CHAT`);
      console.log(`[INTENT CONFIDENCE]: 100%`);
      console.log(`[MEMORY MATCH]: None`);
    }

    const isMemoryIntent = !!(
      classification && 
      ['MEMORY_ADD', 'MEMORY_UPDATE', 'MEMORY_DELETE'].includes(classification.intent) && 
      classification.confidence >= 0.90
    );

    if (isMemoryIntent && userId && classification) {
      try {
        if (classification.intent === 'MEMORY_UPDATE' && classification.targetMemoryId) {
          let oldContent = "";
          try {
            const supabase = createAdminClient();
            const { data: memData } = await supabase
              .from('memories')
              .select('content')
              .eq('id', classification.targetMemoryId)
              .single();
            if (memData) {
              oldContent = memData.content;
            }
          } catch (err) {
            console.error("[MEMORY UPDATE FETCH ERROR]", err);
          }
          
          memoryUpdateNeeded = {
            targetMemoryId: classification.targetMemoryId,
            oldContent: oldContent || "Unknown memory content",
            newContent: classification.memory,
            category: classification.category
          };
          console.log(`[MEMORY UPDATE PROPOSAL]: ${classification.targetMemoryId} ${oldContent || "Unknown"} -> ${classification.memory}`);
        } else if (classification.intent === 'MEMORY_DELETE' && classification.targetMemoryId) {
          let content = "";
          try {
            const supabase = createAdminClient();
            const { data: memData } = await supabase
              .from('memories')
              .select('content')
              .eq('id', classification.targetMemoryId)
              .single();
            if (memData) {
              content = memData.content;
            }
          } catch (err) {
            console.error("[MEMORY DELETE FETCH ERROR]", err);
          }
          
          memoryDeleteNeeded = {
            targetMemoryId: classification.targetMemoryId,
            content: content || "Unknown memory content",
            category: classification.category
          };
          console.log(`[MEMORY DELETE PROPOSAL]: ${classification.targetMemoryId} deletion`);
        } else if (classification.intent === 'MEMORY_ADD') {
          memoryReviewNeeded = {
            category: classification.category,
            content: classification.memory,
            summary: classification.memory
          };
          console.log("[MEMORY ADD PROPOSAL]: Memory Add Proposal detected");
        }
      } catch (err) {
        console.error("[MEMORY REDESIGN PROCESSING FAILED]", err);
      }
    }

    const systemPromptConfig = getSystemPrompt(model);
    let baseInstruction = systemPromptConfig.prompt;

    if (isMemoryIntent) {
      baseInstruction += "\n\nCRITICAL CONTEXT: The user wants to store, update, or remove a preference/detail. A proposal has been generated for validation. You are STRICTLY FORBIDDEN from generating any `<document>` or `</document>` tags. Under no context should you create documents, workspaces, or canvas elements.";
      if (memoryReviewNeeded || memoryUpdateNeeded || memoryDeleteNeeded) {
        baseInstruction += `\n\nPROPOSAL SHOWN: A proposal has been generated on screen for the user to 'Accept' or 'Reject'. Respond naturally confirming you see their request but do NOT state it is saved yet (e.g. 'I see you want to remember that. Please confirm the memory prompt below so I can save it!')`;
      }
      baseInstruction += "\nChoose standard human dialog, short and natural.";
    } else if (classification && ['MEMORY_ADD', 'MEMORY_UPDATE', 'MEMORY_DELETE'].includes(classification.intent) && classification.confidence < 0.90) {
      baseInstruction += `\n\nCLARIFICATION REQUIRED: The user mentioned a memory-type action, but confidence is low (${Math.round(classification.confidence * 100)}%). Do NOT update memories or trigger proposals. Instead, ask the user for clarification (e.g., ask if they intended to update/delete/save a memory, and confirm what the exact content of that memory should be).`;
    }

    if (profileSummary && Object.keys(profileSummary).length > 0) {
      baseInstruction += `\n\nADAPTIVE USER PROFILE SUMMARY (Use this implicitly to shape your response style without mentioning it. Do not store these as memories):
      ${profileSummary?.writingStyle ? `- Writing Style: ${profileSummary.writingStyle}` : ''}
      ${profileSummary?.preferredUI ? `- Preferred UI Style: ${profileSummary.preferredUI}` : ''}
      ${profileSummary?.recurringInterests ? `- Recurring Interests: ${profileSummary.recurringInterests}` : ''}
      ${profileSummary?.commonProjects ? `- Common Projects: ${profileSummary.commonProjects}` : ''}`;
    }

    const systemInstruction = systemInstructionOverride 
      ? `${memoryContext}${baseInstruction}\n${systemInstructionOverride}`
      : `${memoryContext}${baseInstruction}`;

    const config: any = {
      systemInstruction,
      temperature: 0.7,
    };

    let currentContents: any[] = [...contents];

    const customReadableStream = new ReadableStream({
      async start(controller) {
        console.log(`[GENERATION START] | chatId: ${chatId || 'N/A'} | model: ${model}`);
        try {
          if (memoriesUsedCount > 0) {
            controller.enqueue(encoder.encode(JSON.stringify({ 
              memoriesUsedCount,
              memoriesUsed: memoriesUsedList,
              isManualMemories: activeMemories && activeMemories.length > 0
            }) + "\n"));
          }
          if (memoryUpdateNeeded) {
            controller.enqueue(encoder.encode(JSON.stringify({ memoryUpdateNeeded }) + "\n"));
          }
          if (memoryDeleteNeeded) {
            controller.enqueue(encoder.encode(JSON.stringify({ memoryDeleteNeeded }) + "\n"));
          }
          if (profileSummary) {
            controller.enqueue(encoder.encode(JSON.stringify({ profileSummary }) + "\n"));
          }
          if (searchSources && searchSources.length > 0) {
             controller.enqueue(encoder.encode(JSON.stringify({ sources: searchSources }) + "\n"));
          }
          if (savedMemoryPayload) {
             controller.enqueue(encoder.encode(JSON.stringify({ memorySaved: savedMemoryPayload }) + "\n"));
          }
          if (memoryReviewNeeded) {
             controller.enqueue(encoder.encode(JSON.stringify({ memoryReviewNeeded }) + "\n"));
          }
          if (isMemoryLimitReached) {
             controller.enqueue(encoder.encode(JSON.stringify({ memoryLimitReached: true }) + "\n"));
          }
          if (isMemorySaveFailed) {
             controller.enqueue(encoder.encode(JSON.stringify({ memorySaveFailed: true }) + "\n"));
          }

          const requestStartTime = Date.now();
          const requestId = messageId || `msg-${chatId || Math.random().toString(36).substr(2, 9)}`;

          console.log(`[STREAM START] | requestId: ${requestId} | model: ${model}`);

          const stream = await ai.models.generateContentStream({
            model: model,
            contents: currentContents,
            config: config
          });

          const durationMs = Date.now() - requestStartTime;
          console.log(`[PERFORMANCE] Gemini stream initialized in ${durationMs}ms`);

          // Background Memory Extraction Removed - Unified with AI Classification logic above

          let hasSentGrounding = false;
          let isFirstToken = true;
          for await (const chunk of stream) {
            if (isFirstToken) {
              console.log(`[STREAM FIRST TOKEN]`);
              isFirstToken = false;
            }
            const candidate = chunk.candidates?.[0];
            
            if (candidate?.groundingMetadata && !hasSentGrounding) {
              hasSentGrounding = true;
              if (isClientConnected) {
                controller.enqueue(encoder.encode(JSON.stringify({ groundingMetadata: candidate.groundingMetadata }) + "\n"));
              }
            }

            const parts = candidate?.content?.parts;
            if (parts && parts.length > 0) {
              for (const part of parts) {
                if (part.thought === true && part.text) {
                  if (isClientConnected) {
                    controller.enqueue(encoder.encode(JSON.stringify({ thought: part.text }) + "\n"));
                  }
                } else if (part.thought && typeof part.thought === 'string') {
                  if (isClientConnected) {
                    controller.enqueue(encoder.encode(JSON.stringify({ thought: part.thought }) + "\n"));
                  }
                } else if (part.text) {
                  fullResponseText += part.text;
                  if (isClientConnected) {
                    controller.enqueue(encoder.encode(JSON.stringify({ text: part.text }) + "\n"));
                  }
                }
              }
            }
          }
          console.log(`[GENERATION COMPLETE] | Full length: ${fullResponseText.length}`);
          
          // Persistence: Save the response even if client disconnected
          if (chatId) {
            try {
              const supabase = createAdminClient();
              const { error: saveErr } = await supabase
                .from('messages')
                .insert({
                  id: messageId, // Use the client-provided ID if it's UUID-compatible or generated
                  chat_id: chatId,
                  role: 'model',
                  content: fullResponseText
                });
              
              if (!saveErr) {
                console.log(`[RESPONSE SAVED] | Chat: ${chatId}`);
                // Also update chat updated_at
                await supabase
                  .from('chats')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', chatId);
              } else {
                console.error("[DATABASE] Failed to save background generation", saveErr);
              }
            } catch (dbErr) {
              console.error("[DATABASE] Exception saving background generation", dbErr);
            }
          }

        } catch (error: any) {
          console.error(`[STREAM FAILED]`, {
            chatId,
            model,
            error: error?.message,
          });
          if (isClientConnected) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: error.message || "Stream error" }) + "\n"));
          }
        } finally {
          if (isClientConnected) {
            controller.close();
          }
        }
      },
      cancel() {
        isClientConnected = false;
        console.log(`[CLIENT DISCONNECTED] | Generation will continue server-side for chatId: ${chatId || 'N/A'}`);
        console.log(`[GENERATION CONTINUING SERVER SIDE]`);
      }
    });

    return new Response(customReadableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error: any) {
    console.error("[ERROR] GEMINI API ERROR", {
      chatId,
      model,
      error: error?.message,
    });
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
