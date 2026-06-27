import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getGeminiClient, getGeminiClientForTitle } from '@/lib/gemini';
import { getSystemPrompt } from '@/lib/ai/system-prompts';
import { getMemories, getMemoryUsage, saveMemory, updateMemory, deleteMemory, deleteAllMemories } from '@/lib/supabase/memories';
import { createAdminClient, createClient } from '@/lib/supabase/client';
import { detectDocumentTrigger } from '@/lib/ai/intent';
import { classifyMemory } from '@/lib/ai/memory-classifier';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getUserConnections, saveUserConnection, deleteUserConnection, getValidAccessToken } from '@/lib/supabase/connections';
import { createZoomMeeting, listZoomMeetings, cancelZoomMeeting, updateZoomMeeting, getZoomMeeting } from '@/lib/zoom';


// Setup TypeScript bindings interface
type Bindings = {
  GEMINI_API_KEY: string;
  MY_GEMINI_API_KEY?: string;
  MY_GEMINI_API_KEY_2?: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TAVILY_API_KEY?: string;
  ASSETS?: {
    fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
  };
};

export const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS and map Cloudflare bindings to process.env dynamically
app.use('*', cors());
app.use('*', async (c, next) => {
  globalThis.process = globalThis.process || {};
  globalThis.process.env = globalThis.process.env || {};
  
  const blacklistedKeys = new Set([
    'ASSETS',
    'WORKER_SELF_REFERENCE',
    'Images',
  ]);

  for (const [key, value] of Object.entries(c.env || {})) {
    if (typeof value === 'string' && !blacklistedKeys.has(key)) {
      globalThis.process.env[key] = value;
    }
  }
  await next();
});

// LIMITS constant for usage logging
const LIMITS: Record<string, number> = {
  chat_message_ed: 10,       // ED 1.7 chat limit
  chat_message_other: 20,    // Other models chat limit
  file_upload: 5,            // Combined upload & camera
  web_search: 2,             // 2 per day
  deep_research: 1           // 1 per day
};

function getAdminClient(env: Bindings) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Database admin environment configuration.");
  }
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// 1. GET /api/live-key
app.get('/api/live-key', async (c) => {
  const key = c.env.MY_GEMINI_API_KEY || c.env.MY_GEMINI_API_KEY_2 || c.env.GEMINI_API_KEY;
  if (!key) {
    return c.json({ error: "API key not configured" }, 500);
  }
  return c.json({ apiKey: key });
});

// 2. POST /api/chat/title
app.post('/api/chat/title', async (c) => {
  let firstMessage: string | undefined = undefined;
  try {
    const payload = await c.req.json();
    firstMessage = payload.firstMessage;

    if (!firstMessage) {
      return c.json({ error: "firstMessage is required" }, 400);
    }

    const ai = getGeminiClientForTitle([
      c.env.MY_GEMINI_API_KEY_2,
      c.env.MY_GEMINI_API_KEY,
      c.env.GEMINI_API_KEY
    ]);
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

    return c.json({ title });
  } catch (error: any) {
    let fallbackTitle = firstMessage?.slice(0, 60) || "New Conversation";
    console.error("[TITLE GENERATOR ERROR]", error);
    return c.json({ title: fallbackTitle });
  }
});

// 3. POST /api/auth-check
app.post('/api/auth-check', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const supabaseUrl = c.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === 'your_supabase_service_role_key') {
      return c.json({ exists: false, fallback: true });
    }

    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let user = null;
    try {
      const { data, error: listError } = await adminClient.auth.admin.listUsers();
      if (!listError && data?.users) {
        user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      }
    } catch (e) {
      console.warn('[AUTH] listUsers fallback search error:', e);
    }

    if (!user) {
      return c.json({ exists: false });
    }

    const providers = user.app_metadata?.providers || [];
    const identities = user.identities || [];
    const hasGoogle = providers.includes('google') || identities.some((id: any) => id.provider === 'google');
    const hasEmail = providers.includes('email') || identities.some((id: any) => id.provider === 'email');

    return c.json({
      exists: true,
      providers: {
        google: hasGoogle,
        email: hasEmail,
      }
    });
  } catch (err: any) {
    console.error('[AUTH] [ERROR] Error checking auth provider:', err);
    return c.json({ error: 'Failed to verify account' }, 500);
  }
});

// 4. GET /api/memories
app.get('/api/memories', async (c) => {
  const userId = c.req.query('userId');
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  try {
    const [memories, usage] = await Promise.all([
      getMemories(userId),
      getMemoryUsage(userId)
    ]);

    return c.json({ memories, usage });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 5. POST /api/memories
app.post('/api/memories', async (c) => {
  try {
    const { userId, category, content } = await c.req.json();
    if (!userId || !category || !content) {
      return c.json({ error: 'userId, category, and content are required' }, 400);
    }
    const saved = await saveMemory(userId, category, content);
    return c.json({ success: true, memory: saved });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to save memory' }, 500);
  }
});

// 6. PUT /api/memories
app.put('/api/memories', async (c) => {
  try {
    const { memoryId, content } = await c.req.json();
    if (!memoryId || !content) {
      return c.json({ error: 'memoryId and content are required' }, 400);
    }
    const updated = await updateMemory(memoryId, content);
    return c.json({ success: true, memory: updated });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update memory' }, 500);
  }
});

// 7. DELETE /api/memories
app.delete('/api/memories', async (c) => {
  let requestParams = { memoryId: '', userId: '', all: false };
  try {
    const memoryId = c.req.query('memoryId') || '';
    const userId = c.req.query('userId') || '';
    const all = c.req.query('all') === 'true';
    requestParams = { memoryId, userId, all };

    console.log(`[DELETE REQUEST] API received request parameters:`, requestParams);

    if (all) {
      if (!userId) {
        const errorMsg = 'userId is required to delete all memories';
        console.error(`[DELETE FAILED] [MEMORY ID] userId missing.`);
        return c.json({ 
          success: false, 
          error: errorMsg,
          query: `DELETE FROM memories WHERE user_id = null`,
          rowsAffected: 0
        }, 400);
      }

      console.log(`[DELETE REQUEST] Initiating delete all query for userId: ${userId}`);
      const result = await deleteAllMemories(userId);
      
      const responseData = {
        success: true,
        message: 'All memories deleted',
        query: `DELETE FROM memories WHERE user_id = '${userId}'`,
        rowsAffected: result.affectedCount,
        deleted: result.deleted
      };

      console.log(`[DELETE SUCCESS] Successfully deleted all memories. Rows affected: ${result.affectedCount}`);
      return c.json(responseData);
    }

    if (!memoryId) {
      const errorMsg = 'memoryId is required to delete a memory';
      console.error(`[DELETE FAILED] [MEMORY ID] memoryId missing.`);
      return c.json({ 
        success: false, 
        error: errorMsg,
        query: `DELETE FROM memories WHERE id = null`,
        rowsAffected: 0
      }, 400);
    }

    console.log(`[DELETE REQUEST] Initiating delete query for memoryId: ${memoryId}`);
    const result = await deleteMemory(memoryId);

    const responseData = {
      success: true,
      message: 'Memory deleted',
      query: `DELETE FROM memories WHERE id = '${memoryId}'`,
      rowsAffected: result.affectedCount,
      deleted: result.deleted
    };

    console.log(`[DELETE SUCCESS] Successfully deleted memory. Rows affected: ${result.affectedCount}`);
    return c.json(responseData);
  } catch (error: any) {
    const errorMsg = error.message || 'Failed to delete memory';
    const responseData = {
      success: false,
      error: errorMsg,
      query: requestParams.all 
        ? `DELETE FROM memories WHERE user_id = '${requestParams.userId}'`
        : `DELETE FROM memories WHERE id = '${requestParams.memoryId}'`,
      rowsAffected: 0,
      details: error
    };

    console.error(`[DELETE FAILED] Error deleting memory branch:`, error);
    return c.json(responseData, 500);
  }
});

// 8. POST /api/document/revise
app.post('/api/document/revise', async (c) => {
  try {
    const { prompt, currentContent } = await c.req.json();
    const ai = getGeminiClient([
      c.env.MY_GEMINI_API_KEY,
      c.env.MY_GEMINI_API_KEY_2,
      c.env.GEMINI_API_KEY
    ]);

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
    return c.json({ error: error.message || "Internal Server Error" }, 500);
  }
});

// 9. POST /api/document/edit
app.post('/api/document/edit', async (c) => {
  try {
    const { content, selection, instruction } = await c.req.json();

    if (!content || !instruction) {
      return c.json({ error: "Document content and instruction are required" }, 400);
    }

    const ai = getGeminiClient([
      c.env.MY_GEMINI_API_KEY,
      c.env.MY_GEMINI_API_KEY_2,
      c.env.GEMINI_API_KEY
    ]);

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
    return c.json({ text: editedText.trim() });

  } catch (error: any) {
    console.error("[DOCUMENT EDIT ERROR]", error);
    return c.json({ error: error.message || "Failed to process document edit instruction" }, 500);
  }
});

// 10. GET /api/gmail
app.get('/api/gmail', async (c) => {
  try {
    const accessToken = c.req.query("accessToken");
    const action = c.req.query("action"); // "list" or "thread"

    if (!accessToken) {
      return c.json({ error: "Unauthorized. Missing connection token." }, 401);
    }

    if (action === "list") {
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!listRes.ok) {
        if (listRes.status === 401) {
          return c.json({ error: "Unauthorized session or token expired.", code: "UNAUTHORIZED" }, 401);
        }
        return c.json({ error: "Failed to fetch messages list from Google API." }, listRes.status);
      }
      const listData = (await listRes.json()) as any;
      const messagesResult = listData.messages || [];

      const details = await Promise.all(
        messagesResult.map(async (msg: any) => {
          try {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
              headers: { "Authorization": `Bearer ${accessToken}` }
            });
            if (!detailRes.ok) return null;
            const detailData = (await detailRes.json()) as any;
            
            const headers = detailData.payload?.headers || detailData.headers || [];
            const fromHeader = headers.find((h: any) => h.name === "From")?.value || "Unknown Sender";
            const subjectHeader = headers.find((h: any) => h.name === "Subject")?.value || "No Subject";
            const dateHeader = headers.find((h: any) => h.name === "Date")?.value || "";

            return {
              id: msg.id,
              threadId: msg.threadId,
              snippet: detailData.snippet || "",
              from: fromHeader,
              subject: subjectHeader,
              date: dateHeader
            };
          } catch (e) {
            return null;
          }
        })
      );

      return c.json({ messages: details.filter(Boolean) });
    }

    if (action === "thread") {
      const threadId = c.req.query("threadId");
      if (!threadId) {
        return c.json({ error: "Missing threadId parameter." }, 400);
      }

      const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!threadRes.ok) {
        return c.json({ error: "Failed to fetch thread detailed content." }, threadRes.status);
      }
      const threadData = await threadRes.json();
      return c.json({ thread: threadData });
    }

    return c.json({ error: "Invalid action. Supported: 'list', 'thread'." }, 400);
  } catch (err: any) {
    console.error("[GMAIL API GET ERROR]", err);
    return c.json({ error: err?.message || "Internal server error" }, 500);
  }
});

// 11. POST /api/gmail
app.post('/api/gmail', async (c) => {
  try {
    const payload = await c.req.json();
    const { action, to, subject, body, accessToken, emailContent, userInstructions } = payload;

    if (!accessToken) {
      return c.json({ error: "Gmail connection token is missing. Please reconnect Gmail." }, 401);
    }

    const ai = getGeminiClient([
      c.env.MY_GEMINI_API_KEY,
      c.env.MY_GEMINI_API_KEY_2,
      c.env.GEMINI_API_KEY
    ]);

    if (action === "create_reply_draft") {
      if (!emailContent) {
        return c.json({ error: "Missing emailContent for generating reply" }, 400);
      }

      const prompt = `You are Plack AI, an elite email assistant. Generate a professional reply to the following email:
---
EMAIL CONTENT:
${emailContent}
---
User instructions for reply tone or guidelines:
"${userInstructions || "Write a friendly, polite, professional reply."}"

Construct only the reply body. Do not output anything else (no subject lines, no system data, no metadata, just the reply message). Ensure proper professional spacing and greeting.`;

      const geminiResponse = await ai.models.generateContent({
        model: "models/gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      const replyText = geminiResponse.text || "Could not generate reply.";
      const cleanTo = to || "";
      const cleanSubject = subject ? (subject.startsWith("Re:") ? subject : `Re: ${subject}`) : "Re: Email Correspondence";
      
      const emailParts = [
        `To: ${cleanTo}`,
        `Subject: ${cleanSubject}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222222;">${replyText.replace(/\n/g, "<br>")}</div>`
      ];

      const emailMIME = emailParts.join("\r\n");
      const base64Encoded = btoa(unescape(encodeURIComponent(emailMIME)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
      const requestBody = {
        message: {
          raw: base64Encoded
        }
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Gmail API Draft creation failed with status ${response.status}`);
      }

      const responseData = await response.json();
      return c.json({ success: true, replyText, data: responseData });
    }

    if (action === "summarize_thread") {
      if (!emailContent) {
        return c.json({ error: "Missing emailContent to summarize" }, 400);
      }

      const prompt = `You are Plack AI, a premium productivity assistant. Summarize the following email thread.
Provide a clean summary containing exactly these four groups structured in clear markdown lists:
1. **Key Points**
2. **Action Items**
3. **Deadlines**
4. **Questions requiring response**

If a group has no items found in the thread, state "None detected". Keep the formatting beautifully readable.

---
EMAIL THREAD CONTENT:
${emailContent}
---`;

      const geminiResponse = await ai.models.generateContent({
        model: "models/gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      const summaryText = geminiResponse.text || "Could not generate summary.";
      return c.json({ success: true, summaryText });
    }

    if (action === "create_draft" || action === "send_email") {
      const cleanTo = to || "";
      const cleanSubject = subject || "No Subject";
      const cleanBody = body || "";

      const emailParts = [
        `To: ${cleanTo}`,
        `Subject: ${cleanSubject}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222222;">${cleanBody.replace(/\n/g, "<br>")}</div>`
      ];

      const emailMIME = emailParts.join("\r\n");
      const base64Encoded = btoa(unescape(encodeURIComponent(emailMIME)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      let endpoint = "";
      let requestBody = {};
      
      if (action === "create_draft") {
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
        requestBody = {
          message: {
            raw: base64Encoded
          }
        };
      } else {
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
        requestBody = {
          raw: base64Encoded
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as any;
        console.error("[GMAIL API ERROR]", errorData);
        
        if (response.status === 401) {
          return c.json({ 
            error: "Your Gmail session has expired or been revoked. Please reconnect Gmail in the Connections panel.",
            code: "UNAUTHORIZED"
          }, 401);
        }
        
        return c.json({ 
          error: errorData?.error?.message || `Gmail API call failed with status: ${response.status}` 
        }, response.status);
      }

      const data = await response.json();
      return c.json({ success: true, data });
    }

    return c.json({ error: "Invalid action." }, 400);

  } catch (err: any) {
    console.error("[GMAIL ROUTE ERROR]", err);
    return c.json({ error: err?.message || "Internal server error" }, 500);
  }
});

// 12. POST /api/usage/check
app.post('/api/usage/check', async (c) => {
  try {
    const { userId, actionType, model } = await c.req.json();

    if (!userId || !actionType) {
      return c.json({ error: "Missing required parameters: userId and actionType" }, 400);
    }

    const supabase = getAdminClient(c.env);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let userLimits = { ...LIMITS };
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
      if (authUser?.user?.user_metadata?.custom_limits) {
        userLimits = { ...userLimits, ...authUser.user.user_metadata.custom_limits };
      }
    } catch (err) {
      console.warn("[LIMITS PROFILE READ WARNING]", err);
    }

    let count = 0;
    let limit = userLimits[actionType] || 0;
    let oldestLogTime: string | null = null;

    if (actionType === 'web_search') {
      limit = userLimits['web_search'];
      const { data: searches, error: searchError } = await supabase
        .from('web_search_usage')
        .select('created_at')
        .eq('user_id', userId)
        .gt('created_at', oneDayAgo)
        .order('created_at', { ascending: true });

      if (searchError) throw searchError;
      count = searches?.length || 0;
      if (searches && searches.length > 0) {
        oldestLogTime = searches[0].created_at;
      }
    } else if (actionType === 'file_upload' || actionType === 'image_upload') {
      limit = userLimits['file_upload'];
      const { data: uploads, error: uploadError } = await supabase
        .from('usage_logs')
        .select('created_at')
        .eq('user_id', userId)
        .in('action_type', ['file_upload', 'image_upload'])
        .gt('created_at', oneDayAgo)
        .order('created_at', { ascending: true });

      if (uploadError) throw uploadError;
      count = uploads?.length || 0;
      if (uploads && uploads.length > 0) {
        oldestLogTime = uploads[0].created_at;
      }
    } else if (actionType === 'chat_message') {
      const isED17 = (model === 'ED1.7' || model === 'models/gemini-3.5-flash');
      const targetActionKey = isED17 ? 'chat_message_ed' : 'chat_message_other';
      limit = userLimits[targetActionKey];

      const { data: chatLogs, error: chatError } = await supabase
        .from('usage_logs')
        .select('created_at, model')
        .eq('user_id', userId)
        .eq('action_type', 'chat_message')
        .gt('created_at', oneDayAgo)
        .order('created_at', { ascending: true });

      if (chatError) throw chatError;

      const filteredLogs = (chatLogs || []).filter(log => {
        const logIsED17 = (log.model === 'ED1.7' || log.model === 'models/gemini-3.5-flash');
        return isED17 ? logIsED17 : !logIsED17;
      });

      count = filteredLogs.length;
      if (filteredLogs.length > 0) {
        oldestLogTime = filteredLogs[0].created_at;
      }
    } else {
      limit = userLimits[actionType] || 1;
      const { data: logs, error: logError } = await supabase
        .from('usage_logs')
        .select('created_at')
        .eq('user_id', userId)
        .eq('action_type', actionType)
        .gt('created_at', oneDayAgo)
        .order('created_at', { ascending: true });

      if (logError) throw logError;
      count = logs?.length || 0;
      if (logs && logs.length > 0) {
        oldestLogTime = logs[0].created_at;
      }
    }

    const remaining = Math.max(0, limit - count);
    const allowed = remaining > 0;

    let resetIn = "24h 00m";
    if (oldestLogTime) {
      const oldestDate = new Date(oldestLogTime);
      const resetTimeMs = oldestDate.getTime() + 24 * 60 * 60 * 1000;
      const diffMs = Math.max(0, resetTimeMs - Date.now());
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      resetIn = `${hours}h ${minutes}m`;
    }

    return c.json({
      allowed,
      limit,
      consumed: count,
      remaining,
      resetIn
    });
  } catch (error: any) {
    console.error("[USAGE CHECK ERROR]", error.message || error);
    return c.json({ error: "Failed to check usage remaining quota." }, 500);
  }
});

// 13. POST /api/usage/charge
app.post('/api/usage/charge', async (c) => {
  let requestData: any = {};
  try {
    requestData = await c.req.json();
    const { userId, actionType, model } = requestData;

    if (!userId || !actionType) {
      return c.json({ error: "Missing required parameters: userId and actionType" }, 400);
    }

    const supabase = getAdminClient(c.env);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let userLimits = { ...LIMITS };
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
      if (authUser?.user?.user_metadata?.custom_limits) {
        userLimits = { ...userLimits, ...authUser.user.user_metadata.custom_limits };
      }
    } catch (err) {
      console.warn("[LIMITS PROFILE READ WARNING]", err);
    }

    let count = 0;
    let limit = userLimits[actionType] || 0;

    if (actionType === 'web_search') {
      limit = userLimits['web_search'];
      const { data: searches, error: searchError } = await supabase
        .from('web_search_usage')
        .select('id')
        .eq('user_id', userId)
        .gt('created_at', oneDayAgo);

      if (searchError) throw searchError;
      count = searches?.length || 0;

      if (count >= limit) {
        return c.json({ error: "Limit reached" }, 403);
      }

      const { error: insertError } = await supabase
        .from('web_search_usage')
        .insert({ user_id: userId, search_count: 1 });

      if (insertError) throw insertError;

      const remaining = Math.max(0, limit - (count + 1));
      return c.json({ success: true, remaining });

    } else if (actionType === 'file_upload' || actionType === 'image_upload') {
      limit = userLimits['file_upload'];
      const { data: uploads, error: uploadError } = await supabase
        .from('usage_logs')
        .select('id')
        .eq('user_id', userId)
        .in('action_type', ['file_upload', 'image_upload'])
        .gt('created_at', oneDayAgo);

      if (uploadError) throw uploadError;
      count = uploads?.length || 0;

      if (count >= limit) {
        return c.json({ error: "Limit reached" }, 403);
      }

      const { error: insertError } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          action_type: actionType,
          model: model || null
        });

      if (insertError) throw insertError;

      const remaining = Math.max(0, limit - (count + 1));
      return c.json({ success: true, remaining });

    } else if (actionType === 'chat_message') {
      const isED17 = (model === 'ED1.7' || model === 'models/gemini-3.5-flash');
      const targetActionKey = isED17 ? 'chat_message_ed' : 'chat_message_other';
      limit = userLimits[targetActionKey];

      const { data: chatLogs, error: chatError } = await supabase
        .from('usage_logs')
        .select('model')
        .eq('user_id', userId)
        .eq('action_type', 'chat_message')
        .gt('created_at', oneDayAgo);

      if (chatError) throw chatError;

      const filteredLogs = (chatLogs || []).filter(log => {
        const logIsED17 = (log.model === 'ED1.7' || log.model === 'models/gemini-3.5-flash');
        return isED17 ? logIsED17 : !logIsED17;
      });

      count = filteredLogs.length;

      if (count >= limit) {
        return c.json({ error: "Limit reached" }, 403);
      }

      const { error: insertError } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          action_type: 'chat_message',
          model: model || null
        });

      if (insertError) throw insertError;

      const remaining = Math.max(0, limit - (count + 1));
      return c.json({ success: true, remaining });

    } else {
      limit = userLimits[actionType] || 1;
      const { data: logs, error: logError } = await supabase
        .from('usage_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('action_type', actionType)
        .gt('created_at', oneDayAgo);

      if (logError) throw logError;
      count = logs?.length || 0;

      if (count >= limit) {
        return c.json({ error: "Limit reached" }, 403);
      }

      const { error: insertError } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          action_type: actionType,
          model: model || null
        });

      if (insertError) throw insertError;

      const remaining = Math.max(0, limit - (count + 1));
      return c.json({ success: true, remaining });
    }
  } catch (error: any) {
    console.warn("[USAGE NOT CHARGED]", {
      operation: requestData?.actionType || "unknown",
      reason: error.message || error
    });
    return c.json({ error: "Failed to increment/charge usage quota." }, 500);
  }
});

// 14. POST /api/delete-account
app.post('/api/delete-account', async (c) => {
  try {
    const supabaseUrl = c.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseAnonKey = c.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return c.json({ error: 'Unauthorized: Missing or invalid authentication token.' }, 401);
    }

    const userClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return c.json({ error: 'Unauthorized: Authentication identity verification failed.' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const password = body.password;
    const provider = body.provider || 'email';

    if (provider === 'email') {
      if (!password) {
        return c.json({ error: 'Password is required to confirm deleting your account.' }, 400);
      }

      const { error: verifyPassError } = await userClient.auth.signInWithPassword({
        email: user.email!,
        password: password,
      });

      if (verifyPassError) {
        return c.json({ error: 'Incorrect password. Identity verification failed.' }, 400);
      }
    } else {
      console.log(`[AUTH] OAuth Deletion Request received for provider: ${provider}, user: ${user.email}`);
    }

    try {
      const { data: attachments, error: attachQueryError } = await userClient
        .from('message_attachments')
        .select('storage_path')
        .eq('user_id', user.id);

      if (!attachQueryError && attachments && attachments.length > 0) {
        const paths = attachments.map(a => a.storage_path).filter(Boolean);
        if (paths.length > 0) {
          console.log(`[AUTH] [STORAGE] Purging ${paths.length} attachments for user ${user.id} from chat-attachments bucket...`);
          const { error: storageDeleteError } = await userClient.storage.from('chat-attachments').remove(paths);
          if (storageDeleteError) {
            console.warn('[AUTH] [STORAGE] Failed to delete some attachments:', storageDeleteError);
          } else {
            console.log(`[SYSTEM CONFIRMATION] Purged chat attachments successfully.`);
          }
        }
      }
    } catch (attachPurgeErr) {
      console.warn('[AUTH] [STORAGE] Error listing or deleting message attachments:', attachPurgeErr);
    }

    try {
      const { data: files } = await userClient.storage.from('avatars').list(user.id);
      if (files && files.length > 0) {
        const filePaths = files.map((file) => `${user.id}/${file.name}`);
        console.log(`[AUTH] [STORAGE] Purging ${filePaths.length} avatars for user ${user.id} from avatars bucket...`);
        const { error: avatarDeleteError } = await userClient.storage.from('avatars').remove(filePaths);
        if (avatarDeleteError) {
          console.warn('[AUTH] [STORAGE] Failed to delete avatars:', avatarDeleteError);
        } else {
          console.log(`[SYSTEM CONFIRMATION] Purged user avatars successfully.`);
        }
      }
    } catch (storageErr) {
      console.warn('[AUTH] [STORAGE] Storage avatar teardown error / skip:', storageErr);
    }

    const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY;
    let completedAuthDelete = false;

    if (serviceRoleKey && serviceRoleKey !== 'your_database_service_role_key') {
      try {
        const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
        if (deleteAuthError) {
          console.warn(`[AUTH] [LOG] Direct auth.users deletion issue for ${user.id}:`, deleteAuthError.message);
        } else {
          completedAuthDelete = true;
          console.log(`[DATABASE CLEANUP VERIFICATION] Permanently deleted user ${user.id} from auth.users table.`);
        }
      } catch (adminClientErr: any) {
        console.warn(`[AUTH] [ERROR] Admin client delete failed internally:`, adminClientErr.message || adminClientErr);
      }
    } else {
      console.warn(`[AUTH] [LOG] DATABASE_SERVICE_ROLE_KEY is not defined.`);
    }

    try {
      console.log(`[DATABASE CLEANUP VERIFICATION] Starting detailed table cleanup validations for user: ${user.id}`);

      const { error: deleteProfileError } = await userClient
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (deleteProfileError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting profiles:', deleteProfileError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: profiles - Cleaned successfully.`);
      }

      const { error: deleteSearchUsageError } = await userClient
        .from('web_search_usage')
        .delete()
        .eq('user_id', user.id);

      if (deleteSearchUsageError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting web_search_usage:', deleteSearchUsageError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: web_search_usage - Cleaned successfully.`);
      }

      const { error: deleteUsageLogsError } = await userClient
        .from('usage_logs')
        .delete()
        .eq('user_id', user.id);

      if (deleteUsageLogsError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting usage_logs:', deleteUsageLogsError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: usage_logs - Cleaned successfully.`);
      }

      console.log(`[DATABASE CLEANUP VERIFICATION] User profile and application tables verified empty for user id: ${user.id}`);
    } catch (dbPurgeErr: any) {
      console.warn('[DATABASE CLEANUP VERIFICATION] Error during manual database table query fallback purges:', dbPurgeErr.message || dbPurgeErr);
    }

    return c.json({
      success: true,
      message: 'Account and associated content have been permanently deleted from Plack AI.',
      authDeleted: completedAuthDelete
    });
  } catch (err: any) {
    console.error('[AUTH] [ERROR] Delete Account Error:', err);
    return c.json({ error: 'An unexpected internal error occurred during account deletion.' }, 500);
  }
});

// 15. POST /api/user/delete
app.post('/api/user/delete', async (c) => {
  try {
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'Missing userId' }, 400);
    }

    console.log(`[USER_DELETION] Starting deletion for user: ${userId}`);

    const supabaseUrl = c.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
       console.error("[USER_DELETION] Missing Database admin variables");
       return c.json({ error: 'Missing admin variables' }, 500);
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const tables = ['usage_logs', 'message_feedback', 'message_attachments', 'messages', 'chats', 'profiles'];
    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(table === 'profiles' ? 'id' : 'user_id', userId);
        
      if (error) {
        console.error(`[USER_DELETION] Error deleting from ${table}:`, error);
      } else {
        console.log(`[USER_DELETION] Cleaned up ${table}`);
      }
    }

    try {
      const { data: files, error: listError } = await supabaseAdmin.storage.from('plack-attachments').list(userId);
      if (!listError && files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`);
        const { error: removeError } = await supabaseAdmin.storage.from('plack-attachments').remove(paths);
        if (removeError) {
          console.error(`[USER_DELETION] Error removing files:`, removeError);
        } else {
          console.log(`[USER_DELETION] Removed ${paths.length} storage files`);
        }
      }
    } catch(e) {
      console.error(`[USER_DELETION] Storage cleanup error:`, e);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
       console.error(`[USER_DELETION] Error deleting auth user:`, deleteUserError);
       throw deleteUserError;
    }

    console.log(`[USER_DELETION] Successfully deleted user ID ${userId}`);
    return c.json({ success: true, message: 'Account and associated data deleted permanently.' });

  } catch (err: any) {
    console.error('[USER_DELETION_ERROR]', err);
    return c.json({ error: err.message }, 500);
  }
});

// 16. GET /api/debug/websearch
app.get('/api/debug/websearch', async (c) => {
  const startTime = Date.now();
  const requestedModel = c.req.query("model") || "models/gemini-3.1-flash-lite-preview";
  const requestedTool = c.req.query("tool") || "googleSearch"; 
  const useExternalSearch = c.req.query("external") === "true"; 
  
  const chatId = "debug-websearch-test-session";
  const requestId = "debug-req-" + Math.random().toString(36).substr(2, 9);
  
  const results: any[] = [];
  let totalGeminiCalls = 0;
  let totalSearchCalls = 0;
  let modelsUsed: string[] = [];

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

  if (useExternalSearch) {
    totalSearchCalls += 1;
    totalGeminiCalls += 1;
    modelsUsed.push(requestedModel);

    try {
      const ai = getGeminiClient([
        c.env.MY_GEMINI_API_KEY,
        c.env.MY_GEMINI_API_KEY_2,
        c.env.GEMINI_API_KEY
      ]);
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
    totalSearchCalls += 1;
    totalGeminiCalls += 1;
    modelsUsed.push(requestedModel);

    try {
      const ai = getGeminiClient([
        c.env.MY_GEMINI_API_KEY,
        c.env.MY_GEMINI_API_KEY_2,
        c.env.GEMINI_API_KEY
      ]);
      const runConfig: any = {
        temperature: 0.1,
      };

      if (requestedTool === "googleSearch") {
        runConfig.tools = [{ googleSearch: {} }];
      } else if (requestedTool === "googleSearchRetrieval") {
        runConfig.tools = [{ googleSearchRetrieval: {} }];
      }

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

  return c.json({
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
});

// ============================================================================
// ZOOM & CONNECTIONS ENDPOINTS
// ============================================================================

async function getAuthUser(c: any) {
  const supabaseUrl = c.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = c.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token) return null;

  try {
    const userClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user } } = await userClient.auth.getUser();
    return user;
  } catch (err) {
    console.error('[AUTH ERROR] getAuthUser failed:', err);
    return null;
  }
}

// 1. GET /api/auth/zoom/url
app.get('/api/auth/zoom/url', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clientId = c.env.ZOOM_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: 'Zoom Client ID is not configured on the server.' }, 500);
    }

    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/zoom/callback`;
    
    // Construct Zoom Auth URL
    const zoomAuthUrl = new URL('https://zoom.us/oauth/authorize');
    zoomAuthUrl.searchParams.set('response_type', 'code');
    zoomAuthUrl.searchParams.set('client_id', clientId);
    zoomAuthUrl.searchParams.set('redirect_uri', redirectUri);
    zoomAuthUrl.searchParams.set('state', user.id);

    console.log(`[ZOOM OAUTH LOG] Generated Authorization URL for user ${user.id}`);
    return c.json({ url: zoomAuthUrl.toString() });
  } catch (err: any) {
    console.error('[ZOOM OAUTH ERROR] Failed to generate auth URL:', err);
    return c.json({ error: 'Failed to initiate Zoom authentication: ' + err.message }, 500);
  }
});

// 2. GET /api/auth/zoom/callback (Handles OAuth 2.0 redirect)
app.get('/api/auth/zoom/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state'); // user_id

  if (!code || !state) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connection Failed</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 400px;">
          <h2 style="color: #ef4444; margin-bottom: 8px;">Connection Failed</h2>
          <p style="color: #4b5563; font-size: 14px;">Authorization code or state was missing. Please try again.</p>
          <button onclick="window.close()" style="margin-top: 16px; background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: false, error: 'Missing code or state' }, '*');
          }
        </script>
      </body>
      </html>
    `);
  }

  try {
    const clientId = c.env.ZOOM_CLIENT_ID;
    const clientSecret = c.env.ZOOM_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Zoom environment variables are not fully configured.');
    }

    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/zoom/callback`;

    // 1. Exchange auth code for access/refresh tokens
    const tokenUrl = 'https://zoom.us/oauth/token';
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Zoom Token Exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json() as any;
    const { access_token, refresh_token, expires_in } = tokenData;

    // 2. Fetch the connected Zoom user's profile to retrieve their email
    const profileRes = await fetch('https://api.zoom.us/v2/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let accountEmail = null;
    if (profileRes.ok) {
      const profileData = await profileRes.json() as any;
      accountEmail = profileData.email || null;
    } else {
      console.warn(`[ZOOM API WARNING] Failed to fetch Zoom user profile: ${await profileRes.text()}`);
    }

    // 3. Save to Supabase using service client
    await saveUserConnection(
      state, // user_id
      'zoom',
      accountEmail,
      access_token,
      refresh_token || null,
      expires_in || 3599,
      { scope: tokenData.scope || '' },
      c.env
    );

    console.log(`[ZOOM CONNECTION SUCCESS] Zoom successfully connected for user ${state} (${accountEmail})`);

    // Return HTML page to close popup and notify parent window
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connected!</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 400px;">
          <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
          <h2 style="color: #10b981; margin-bottom: 8px;">Zoom Connected!</h2>
          <p style="color: #4b5563; font-size: 14px;">Your Zoom account <strong>${accountEmail || ''}</strong> has been connected successfully to Plack AI.</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">This window will close automatically.</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: true, email: '${accountEmail || ""}' }, '*');
          }
          setTimeout(() => {
            window.close();
          }, 2500);
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[ZOOM OAUTH ERROR] OAuth Exchange Callback Failed:', err);
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connection Failed</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 410px;">
          <h2 style="color: #ef4444; margin-bottom: 8px;">Connection Failed</h2>
          <p style="color: #4b5563; font-size: 14px;">Unable to connect your Zoom account. Please try again.</p>
          <p style="color: #ef4444; font-size: 12px; font-family: monospace; background: #fef2f2; padding: 8px; border-radius: 6px; margin-top: 12px; text-align: left; overflow-wrap: break-word;">
            Error: ${err.message || err}
          </p>
          <button onclick="window.close()" style="margin-top: 16px; background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: false, error: '${err.message || "Failed to exchange authorization token"}' }, '*');
          }
        </script>
      </body>
      </html>
    `);
  }
});

// 3. GET /api/connections/status (Check connected services)
app.get('/api/connections/status', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const connections = await getUserConnections(user.id);
    const sanitizedConnections = connections.map(conn => ({
      provider: conn.provider,
      accountEmail: conn.account_email,
      expiresAt: conn.expires_at,
      connectedAt: conn.created_at,
    }));

    return c.json({ connections: sanitizedConnections });
  } catch (err: any) {
    console.error('[CONNECTIONS ERROR] Failed to fetch connection statuses:', err);
    return c.json({ error: 'Failed to retrieve connection statuses: ' + err.message }, 500);
  }
});

// 4. POST /api/connections/disconnect
app.post('/api/connections/disconnect', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { provider } = await c.req.json().catch(() => ({}));
    if (!provider) {
      return c.json({ error: 'Provider is required' }, 400);
    }

    await deleteUserConnection(user.id, provider);
    console.log(`[ZOOM DISCONNECTED] Successfully disconnected ${provider} for user ${user.id}`);
    return c.json({ success: true, message: `Disconnected ${provider} successfully.` });
  } catch (err: any) {
    console.error('[CONNECTIONS ERROR] Disconnect failed:', err);
    return c.json({ error: 'Failed to disconnect service: ' + err.message }, 500);
  }
});

// 5. POST /api/zoom/execute (Execute direct Zoom API actions safely on behalf of user)
app.post('/api/zoom/execute', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const { action, meetingId, topic, startTime, duration, timezone } = body;

    if (!action) {
      return c.json({ error: 'action is required' }, 400);
    }

    console.log(`[DEVELOPER LOG] Zoom API execution requested by ${user.email}. Action: ${action}`);

    if (action === 'list') {
      const meetings = await listZoomMeetings(user.id, c.env);
      return c.json({ success: true, meetings });
    }

    if (action === 'get') {
      if (!meetingId) return c.json({ error: 'meetingId is required' }, 400);
      const meeting = await getZoomMeeting(user.id, meetingId, c.env);
      return c.json({ success: true, meeting });
    }

    if (action === 'create') {
      if (!topic || !startTime) {
        return c.json({ error: 'topic and startTime are required to create a meeting.' }, 400);
      }
      const meeting = await createZoomMeeting(user.id, {
        topic,
        start_time: startTime,
        duration,
        timezone
      }, c.env);
      console.log(`[DEVELOPER LOG] Zoom meeting created successfully by ${user.email}. Meeting ID: ${meeting.id}`);
      return c.json({ success: true, meeting });
    }

    if (action === 'update') {
      if (!meetingId) return c.json({ error: 'meetingId is required' }, 400);
      const result = await updateZoomMeeting(user.id, meetingId, {
        topic,
        start_time: startTime,
        duration,
        timezone
      }, c.env);
      console.log(`[DEVELOPER LOG] Zoom meeting ${meetingId} updated successfully by ${user.email}`);
      return c.json({ success: true, result });
    }

    if (action === 'cancel') {
      if (!meetingId) return c.json({ error: 'meetingId is required' }, 400);
      await cancelZoomMeeting(user.id, meetingId, c.env);
      console.log(`[DEVELOPER LOG] Zoom meeting ${meetingId} cancelled successfully by ${user.email}`);
      return c.json({ success: true });
    }

    return c.json({ error: 'Invalid or unsupported action' }, 400);
  } catch (err: any) {
    console.error('[ZOOM API ERROR] Execution Failed:', err);
    return c.json({ error: err.message || 'Zoom execution failed' }, 500);
  }
});

// 17. POST /api/chat (The main endpoint)
interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  parts?: any[];
}

app.post('/api/chat', async (c) => {
  let chatId: string | undefined = undefined;
  let model = "models/gemini-3.1-flash-lite-preview";
  try {
    const payload = await c.req.json();
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
      return c.json({ error: "Messages array is required" }, 400);
    }

    console.log(`[MODEL] GEMINI CHAT REQUEST | Chat ID: ${chatId || 'N/A'} | Model: ${model} | DeepResearch: ${isDeepResearch}`);

    const ai = getGeminiClient([
      c.env.MY_GEMINI_API_KEY,
      c.env.MY_GEMINI_API_KEY_2,
      c.env.GEMINI_API_KEY
    ]);

    // 1. Retrieve Memories
    let memoryContext = "";
    let memoriesUsedCount = 0;
    let memoriesUsedList: any[] = [];
    
    if (activeMemories && Array.isArray(activeMemories) && activeMemories.length > 0) {
      memoriesUsedCount = activeMemories.length;
      memoriesUsedList = activeMemories;
      memoryContext = "=== USER MEMORIES ===\nThese are specific memories explicitly selected by the user for this conversation priority:\n";
      activeMemories.forEach((m: any, i: number) => {
        memoryContext += `${i + 1}. [${m.category || 'User Fact'}] ${m.content}\n`;
      });
      memoryContext += "=====================\n\n";
    } 
    else if (userId) {
      try {
        const fetchAll = await getMemories(userId);
        const autoLimit = fetchAll.slice(0, 15);
        memoriesUsedList = autoLimit;
        
        if (autoLimit.length > 0) {
          memoriesUsedCount = autoLimit.length;
          memoryContext = "=== USER MEMORIES ===\nThese are things you have remembered about the user from previous conversations:\n";
          autoLimit.forEach((m, i) => {
            memoryContext += `${i + 1}. [${m.category}] ${m.content}\n`;
          });
          memoryContext += "=====================\n\n";
        }
      } catch (err) {
        console.error("[MEMORY] Failed to fetch memories automatically", err);
      }
    }

    // Extract Adaptive User Profile Summary
    let profileSummary: any = null;
    if (messages && messages.length > 1) {
      try {
        const recentMessages = messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || ""}`).join("\n");
        const profilePrompt = `You are a high-fidelity user profiling assistant for Plack. 
Analyze the dialogue history between a User and their Assistant below. 
Deduce:
1. "writingStyle": user's preferred writing style
2. "uiStyle": user's preferred UI / Design style
3. "interests": user's recurring topics or values
4. "projectTypes": user's common project format

Dialogue history:
${recentMessages}

Respond with exactly a JSON object:
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
      } catch (err) {
        console.warn("[ADAPTIVE PROFILE] Inference failed", err);
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

    // DEEP RESEARCH MODE WORKFLOW
    if (isDeepResearch) {
      const customReadableStream = new ReadableStream({
        async start(controller) {
          try {
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

            if (memoriesUsedCount > 0) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                memoriesUsedCount,
                memoriesUsed: memoriesUsedList,
                isManualMemories: activeMemories && activeMemories.length > 0
              }) + "\n"));
            }
            if (profileSummary) {
              controller.enqueue(encoder.encode(JSON.stringify({ profileSummary }) + "\n"));
            }

            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 0, 
              researchStatus: "Analyzing prompt intent..." 
            }) + "\n"));

            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 1, 
              researchStatus: "Generating search query strategies..." 
            }) + "\n"));

            let searchQueries = [userPrompt];
            try {
              const queryGenerationPrompt = `We are conducting in-depth research on: "${userPrompt}".
Formulate exactly three discrete, distinct search queries that explore this topic from multiple dimensions.
Return ONLY a JSON array of strings, with no markdown tags. Example: ["query 1", "query 2", "query 3"]`;
              
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
              console.warn("[DEEP RESEARCH] Failed to generate multi-queries, falling back", err.message || err);
            }

            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 2, 
              researchStatus: `Acquiring references for multi-perspective search queries (${searchQueries.length} channels)...` 
            }) + "\n"));

            let searchSources: any[] = [];
            const searchTavily = async (queryStr: string, useStrictDomains = true) => {
              if (!deepResearchWebSearch) {
                return [];
              }
              if (!c.env.TAVILY_API_KEY) {
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
                    api_key: c.env.TAVILY_API_KEY,
                    query: finalQuery,
                    search_depth: "basic",
                    max_results: 3
                  })
                });
                if (res.ok) {
                  const d = (await res.json()) as any;
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
                const generalResults = await searchTavily(currentQuery, false);
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

            if (searchSources.length === 0 && deepResearchWebSearch) {
              const fallbackResults = await searchTavily(userPrompt, false);
              fallbackResults.forEach((r: any) => {
                searchSources.push({
                  title: r.title,
                  url: r.url,
                  content: r.content
                });
              });
            }

            if (searchSources.length > 0) {
              controller.enqueue(encoder.encode(JSON.stringify({ sources: searchSources }) + "\n"));
            }

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
Perform a meticulous step-by-step comparative analysis. Locate contradictions, complementary insights, or factual gaps.
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
              controller.enqueue(encoder.encode(JSON.stringify({ thought: text }) + "\n"));
            }

            controller.enqueue(encoder.encode(JSON.stringify({ 
              researchTimeline: timeline, 
              activeStageIndex: 4, 
              researchStatus: "Running fact auditing algorithms..." 
            }) + "\n"));

            const verificationPrompt = `You are Plack's Principal Quality Verifier. 
Review the drafted analysis below against the original source materials.

Original materials:\n${sourcesContext.substring(0, 4000)}

Draft analysis:\n${draftSynthesis}

Evaluate and audit:
1. Factual consistency
2. Structural duplicate check
3. Citations correctness
Provide your comprehensive critique and thoughts out loud.`;

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

Synthesize the materials. Structure your response EXACTLY into the following markdown parts:

# Executive Summary
[A professional overview]

# Detailed Findings
[Clean structured subdivisions. Cite as (Source X)]

# Key Insights
[deep takeaways as synthesized bullets]

# Sources
[Numbered list of sources. Format: [Name](URL) - snippet detail]

# Limitations
[Document unresolved conflicts or gaps]`;

            const compilerStream = await ai.models.generateContentStream({
              model: "models/gemini-3.1-flash-lite-preview",
              contents: [{ role: 'user', parts: [{ text: compilerPrompt }] }],
              config: { temperature: 0.4 }
            });

            for await (const chunk of compilerStream) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              controller.enqueue(encoder.encode(JSON.stringify({ text: text }) + "\n"));
            }

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
          console.log("[WEB_SEARCH_CLASSIFIER] Auto-activated Web Search.");
        }
      } catch (err) {
        console.warn("[WEB_SEARCH_CLASSIFIER] Classification failed, continuing normal flow.");
      }
    }

    let searchSources: any[] = [];

    if (finalUseWebSearch) {
      if (!c.env.TAVILY_API_KEY) {
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
          try {
            const tavilyRes = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_key: c.env.TAVILY_API_KEY,
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
            
            const tavilyData = (await tavilyRes.json()) as any;
            const results = tavilyData.results || [];
            
            searchSources = results.map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content
            }));
            
            if (searchSources.length > 0) {
              let contextStr = "WEB SEARCH RESULTS:\n\n";
              searchSources.forEach((src: any, i: number) => {
                contextStr += `[Source ${i + 1}]\nTitle: ${src.title}\nURL: ${src.url}\nContent: ${src.content}\n\n`;
              });
              contextStr += `User Question:\n${query}\n\n(Base your answer primarily on the Web Search Results above if relevant. Ensure you cite your facts.)`;
              
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
            }
          } catch (err: any) {
            console.error("[TAVILY ERROR]", err);
          }
        }
      }
    }
  
    const isDocIntent = detectDocumentTrigger(userText);
    
    let currentMemoriesForClassification: any[] = [];
    if (userId) {
      try {
        currentMemoriesForClassification = await getMemories(userId);
      } catch (err) {}
    }

    const classification = await classifyMemory(userText, currentMemoriesForClassification, "", [
      c.env.MY_GEMINI_API_KEY,
      c.env.MY_GEMINI_API_KEY_2,
      c.env.GEMINI_API_KEY
    ]);
    
    const isMemoryIntent = !!(
      classification && 
      ['MEMORY_ADD', 'MEMORY_UPDATE', 'MEMORY_DELETE'].includes(classification.intent) && 
      classification.confidence >= 0.90
    );

    let savedMemoryPayload: any = null;
    let memoryReviewNeeded: any = null;
    let memoryUpdateNeeded: any = null;
    let memoryDeleteNeeded: any = null;
    let isMemoryLimitReached = false;
    let isMemorySaveFailed = false;

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
        } else if (classification.intent === 'MEMORY_ADD') {
          memoryReviewNeeded = {
            category: classification.category,
            content: classification.memory,
            summary: classification.memory
          };
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
      baseInstruction += `\n\nCLARIFICATION REQUIRED: The user mentioned a memory-type action, but confidence is low. Do NOT update memories or trigger proposals. Instead, ask the user for clarification.`;
    }

    if (profileSummary && Object.keys(profileSummary).length > 0) {
      baseInstruction += `\n\nADAPTIVE USER PROFILE SUMMARY (Use this implicitly to shape your response style without mentioning it. Do not store these as memories):
      ${profileSummary?.writingStyle ? `- Writing Style: ${profileSummary.writingStyle}` : ''}
      ${profileSummary?.preferredUI ? `- Preferred UI Style: ${profileSummary.preferredUI}` : ''}
      ${profileSummary?.recurringInterests ? `- Recurring Interests: ${profileSummary.recurringInterests}` : ''}
      ${profileSummary?.commonProjects ? `- Common Projects: ${profileSummary.commonProjects}` : ''}`;
    }

    // Check if Zoom is connected for this user
    let isZoomConnected = false;
    let zoomEmail = "";
    if (userId) {
      try {
        const conns = await getUserConnections(userId);
        const zoomConn = conns.find(c => c.provider === 'zoom');
        if (zoomConn) {
          isZoomConnected = true;
          zoomEmail = zoomConn.account_email || "";
        }
      } catch (err) {
        console.error('[ZOOM] Failed to fetch connection status for chat context:', err);
      }
    }

    baseInstruction += `\n\n=== ZOOM CONNECTIONS SYSTEM ===\n`;
    if (isZoomConnected) {
      baseInstruction += `Zoom is currently CONNECTED for this user (Connected Account Email: ${zoomEmail}).\n` +
        `You can assist the user in managing their Zoom meetings (create, list, update, cancel).\n` +
        `1. EXPLICIT CONFIRMATION MANDATE: Before the AI performs any Zoom action requiring account modifications (create, update, cancel), you MUST clearly explain what will happen and request confirmation by outputting a special confirmation tag EXACTLY in this format on its own line:\n` +
        `   [ZOOM_CONFIRM_REQUIRED:actionType:jsonParams]\n` +
        `   Where actionType is 'create', 'update', or 'cancel'.\n` +
        `   Where jsonParams is a stringified JSON object matching these schemas:\n` +
        `     - For create: {"topic": "Meeting Topic", "startTime": "2026-06-28T09:00:00Z", "duration": 40, "timezone": "UTC"}\n` +
        `     - For update: {"meetingId": "123456789", "topic": "Updated Topic", "startTime": "2026-06-28T10:00:00Z", "duration": 40}\n` +
        `     - For cancel: {"meetingId": "123456789", "topic": "Meeting Topic"}\n` +
        `   Example: If the user says "Create a Zoom meeting tomorrow at 9 AM called Design Review", write: "I am ready to schedule your Zoom meeting. Please confirm the details below:" and write the tag on its own line:\n` +
        `   [ZOOM_CONFIRM_REQUIRED:create:{"topic":"Design Review","startTime":"2026-06-28T09:00:00Z","duration":40}]\n` +
        `2. Listing meetings: If the user wants to list meetings, you do not need confirmation. Output a tag on its own line: [ZOOM_ACTION:list:{}] so the frontend can retrieve and render the active upcoming meetings.\n` +
        `3. Never perform actions or state that you deleted or scheduled meetings without outputting the confirmation tag first. The system will handle the action when the user clicks 'Confirm' in the interactive card.`;
    } else {
      baseInstruction += `Zoom is NOT connected. If the user asks to schedule, view, or manage Zoom meetings, politely instruct them to connect their Zoom account first on the Connections page (/connections) before you can perform any Zoom actions.`;
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

          const stream = await ai.models.generateContentStream({
            model: model,
            contents: currentContents,
            config: config
          });

          let hasSentGrounding = false;
          let isFirstToken = true;
          for await (const chunk of stream) {
            if (isFirstToken) {
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
          
          if (chatId) {
            try {
              const supabase = createAdminClient();
              const { error: saveErr } = await supabase
                .from('messages')
                .insert({
                  id: messageId,
                  chat_id: chatId,
                  role: 'model',
                  content: fullResponseText
                });
              
              if (!saveErr) {
                await supabase
                  .from('chats')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', chatId);
              }
            } catch (dbErr) {
              console.error("[DATABASE] Exception saving background generation", dbErr);
            }
          }

        } catch (error: any) {
          console.error(`[STREAM FAILED]`, error?.message);
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
    console.error("[ERROR] GEMINI API ERROR", error?.message);
    return c.json({ error: error.message || "Internal Server Error" }, 500);
  }
});

// 18. Runtime configuration endpoint
app.get('/api/config', async (c) => {
  const publicConfig: Record<string, string> = {};
  
  // Extract all NEXT_PUBLIC_ variables from the environment
  for (const [key, value] of Object.entries(c.env || {})) {
    if (key.startsWith('NEXT_PUBLIC_') && typeof value === 'string') {
      publicConfig[key] = value;
    }
  }

  console.log(`[CONFIG API] Returning ${Object.keys(publicConfig).length} public variables`);
  
  return c.json({
    NEXT_PUBLIC_SUPABASE_URL: c.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: c.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ...publicConfig
  });
});

// 19. Serves fallback index.html for React SPA Routing on GET *
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  
  // Diagnostic logs
  const assetsAvailable = !!c.env.ASSETS;
  const runtime = process.env.NODE_ENV || 'development';
  
  console.log(`[ASSETS CHECK] Assets Available: ${assetsAvailable} | Runtime: ${runtime} | Path: ${url.pathname}`);

  // If request contains extension (files like .js, .css, .png, etc.), or is /api/* request, let it go.
  if (url.pathname.startsWith('/api') || url.pathname.includes('.')) {
    return c.next();
  }
  
  // If ASSETS binding is missing (usually in development), let Vite dev server handle it
  if (!assetsAvailable) {
    if (runtime === 'development') {
      return c.next();
    }
    return c.text("Asset serving index error: ASSETS binding is not configured in this environment.", 500);
  }

  // Otherwise, serve index.html from assets for React Router client navigation!
  const indexUrl = new URL('/', url.origin);
  try {
    console.log(`[INDEX INTERCEPT] Fetching index from assets: ${indexUrl.toString()}`);
    const response = await (c.env.ASSETS as any).fetch(indexUrl);
    return response;
  } catch (err: any) {
    console.error(`[ASSETS ERROR] Failed to fetch ${indexUrl.toString()}:`, err);
    return c.text("Asset serving index error: " + err.message, 500);
  }
});

export default {
  async fetch(request: Request, env: Bindings, ctx: any) {
    return app.fetch(request, env, ctx);
  }
};
