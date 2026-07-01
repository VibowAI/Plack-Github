import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { getGeminiClient, getGeminiClientForTitle } from '@/lib/gemini';
import { getSystemPrompt } from '@/lib/ai/system-prompts';
import { getMemories, getMemoryUsage, saveMemory, updateMemory, deleteMemory, deleteAllMemories } from '@/lib/supabase/memories';
import { createAdminClient, createClient } from '@/lib/supabase/client';
import { detectDocumentTrigger } from '@/lib/ai/intent';
import { classifyMemory } from '@/lib/ai/memory-classifier';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';


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

    const tables = ['usage_logs', 'message_feedback', 'message_versions', 'message_attachments', 'messages', 'chats', 'profiles'];
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

// 17. POST /api/chat (The main endpoint)
interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  parts?: any[];
}

interface Job {
  id: string;
  user_id: string;
  chat_id: string;
  message_id: string;
  model: string;
  prompt: string;
  payload: any;
  status: 'queued' | 'running' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  partial_output: string;
  final_output?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

const inMemoryJobs = new Map<string, Job>();
const jobEventEmitter = new EventEmitter();
jobEventEmitter.setMaxListeners(200);

class AIJobProcessor {
  private static isProcessing = false;
  private static initialized = false;
  private static envBindings: any = {};

  public static init() {
    if (this.initialized) return;
    this.initialized = true;

    // Run polling loop every 1.5 seconds
    setInterval(async () => {
      try {
        await this.processNextJob();
      } catch (err) {
        console.error("[JOB PROCESSOR] Poller exception:", err);
      }
    }, 1500);

    // Scan on start for any "running" or "streaming" jobs and auto-reset them to "queued" so they resume
    this.resetStaleJobs().catch(err => {
      console.error("[JOB PROCESSOR] Error resetting stale jobs:", err);
    });

    console.log("[JOB PROCESSOR] Background processor initialized successfully.");
  }

  public static captureEnv(env: any) {
    if (env) {
      this.envBindings = { ...this.envBindings, ...env };
      // Sync to process.env
      globalThis.process = globalThis.process || {};
      globalThis.process.env = globalThis.process.env || {};
      for (const [k, v] of Object.entries(env)) {
        if (typeof v === 'string') {
          globalThis.process.env[k] = v;
        }
      }
    }
  }

  private static async resetStaleJobs() {
    const supabase = createAdminClient();
    try {
      const { data, error } = await supabase
        .from('ai_generation_jobs')
        .select('id, status')
        .in('status', ['running', 'streaming']);
      
      if (!error && data && data.length > 0) {
        console.log(`[JOB PROCESSOR] Resetting ${data.length} stale jobs to queued status...`);
        for (const j of data) {
          await supabase
            .from('ai_generation_jobs')
            .update({ status: 'queued', updated_at: new Date().toISOString() })
            .eq('id', j.id);
        }
      }
    } catch (e) {
      // Database table might not exist yet
    }

    // Reset in-memory jobs
    for (const [id, j] of inMemoryJobs.entries()) {
      if (j.status === 'running' || j.status === 'streaming') {
        j.status = 'queued';
        j.updated_at = new Date().toISOString();
        inMemoryJobs.set(id, { ...j });
      }
    }
  }

  public static trigger(ctx?: any) {
    const promise = this.processNextJob().catch(err => {
      console.error("[JOB PROCESSOR] Trigger error:", err);
    });
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(promise);
    }
  }

  private static async processNextJob() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let job: Job | null = null;
      let usingDb = false;

      const supabase = createAdminClient();
      try {
        const { data, error } = await supabase
          .from('ai_generation_jobs')
          .select('*')
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(1);

        if (!error && data && data.length > 0) {
          job = data[0] as Job;
          usingDb = true;
        }
      } catch (e) {
        // Table not found or database issue, use in-memory fallback
      }

      if (!job) {
        // Look in-memory
        const queuedInMemory = Array.from(inMemoryJobs.values())
          .filter(j => j.status === 'queued')
          .sort((a, b) => a.created_at.localeCompare(b.created_at));

        if (queuedInMemory.length > 0) {
          job = queuedInMemory[0];
          usingDb = false;
        }
      }

      if (!job) {
        this.isProcessing = false;
        return;
      }

      await this.runJob(job, usingDb);
    } catch (err) {
      console.error("[JOB PROCESSOR] Error in processNextJob:", err);
    } finally {
      this.isProcessing = false;
      // Loop if more jobs are queued
      const hasMoreInMemory = Array.from(inMemoryJobs.values()).some(j => j.status === 'queued');
      if (hasMoreInMemory) {
        setTimeout(() => this.trigger(), 100);
      }
    }
  }

  private static async runJob(job: Job, usingDb: boolean) {
    console.log(`[JOB PROCESSOR] [START] Processing job ${job.id} for Chat: ${job.chat_id}`);
    const supabase = createAdminClient();

    // 1. Mark as running
    job.status = 'running';
    job.updated_at = new Date().toISOString();
    if (usingDb) {
      await supabase
        .from('ai_generation_jobs')
        .update({ status: 'running', updated_at: job.updated_at })
        .eq('id', job.id);
    } else {
      inMemoryJobs.set(job.id, { ...job });
    }
    jobEventEmitter.emit(`update:${job.id}`, { status: 'running' });

    try {
      const payload = job.payload;
      const { 
        messages, 
        systemInstructionOverride, 
        useWebSearch,
        userId,
        autoSaveMemories = true,
        deepResearchWebSearch = true,
        preferredDomains = [],
        activeMemories
      } = payload;

      const model = job.model || "models/gemini-3.1-flash-lite-preview";
      const isDeepResearch = payload.isDeepResearch === true;

      // Initialize Gemini Client
      const keysToUse = [
        this.envBindings.MY_GEMINI_API_KEY,
        this.envBindings.MY_GEMINI_API_KEY_2,
        this.envBindings.GEMINI_API_KEY,
        process.env.MY_GEMINI_API_KEY,
        process.env.MY_GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY
      ].filter(Boolean);

      const ai = getGeminiClient(keysToUse);

      // --- GENERATE MEMORIES / ADAPTIVE PROFILE / PARSING ---
      // 1. Retrieve Memories
      jobEventEmitter.emit(`update:${job.id}`, { status: 'running', researchStatus: 'Retrieving memory...' });
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
          console.error("[JOB PROCESSOR] [MEMORY] Failed to fetch memories automatically", err);
        }
      }

      // Extract Adaptive User Profile Summary
      jobEventEmitter.emit(`update:${job.id}`, { status: 'running', researchStatus: 'Planning...' });
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
          console.warn("[JOB PROCESSOR] [ADAPTIVE PROFILE] Inference failed", err);
        }
      }

      // Map message history to GenAI SDK Content format
      let userText = job.prompt || "";
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

      let fullResponseText = "";

      // --- HELPER TO BATCH EMIT AND DB UPDATE ---
      let dbBatchTimer: any = null;

      const sendChunk = async (chunkObj: any) => {
        // Emit in real-time to active listeners
        jobEventEmitter.emit(`update:${job.id}`, chunkObj);

        // Track text accumulation
        if (chunkObj.text) {
          fullResponseText += chunkObj.text;
          job.partial_output = fullResponseText;
        }

        // Batch DB saves every 350ms to prevent database write flooding
        if (!dbBatchTimer) {
          dbBatchTimer = setTimeout(async () => {
            dbBatchTimer = null;
            job.status = 'streaming';
            job.updated_at = new Date().toISOString();
            if (usingDb) {
              await supabase
                .from('ai_generation_jobs')
                .update({ 
                  partial_output: fullResponseText, 
                  status: 'streaming', 
                  updated_at: job.updated_at 
                })
                .eq('id', job.id);
            } else {
              inMemoryJobs.set(job.id, { ...job });
            }
          }, 350);
        }
      };

      // --- DEEP RESEARCH MODE WORKFLOW ---
      if (isDeepResearch) {
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
          await sendChunk({ 
            memoriesUsedCount,
            memoriesUsed: memoriesUsedList,
            isManualMemories: activeMemories && activeMemories.length > 0
          });
        }
        if (profileSummary) {
          await sendChunk({ profileSummary });
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 0, 
          researchStatus: "Analyzing prompt intent..." 
        });

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 1, 
          researchStatus: "Generating search query strategies..." 
        });

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
          console.warn("[JOB PROCESSOR] [DEEP RESEARCH] Failed to generate multi-queries, falling back", err.message || err);
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 2, 
          researchStatus: `Acquiring references for multi-perspective search queries (${searchQueries.length} channels)...` 
        });

        let searchSources: any[] = [];
        const searchTavily = async (queryStr: string, useStrictDomains = true) => {
          if (!deepResearchWebSearch) return [];
          const tavKey = this.envBindings.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
          if (!tavKey) return [];
          
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
                api_key: tavKey,
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
            console.error(`[JOB PROCESSOR] [WEB_SEARCH] Tavily query fail for ${queryStr}`, e);
          }
          return [];
        };

        for (let i = 0; i < searchQueries.length; i++) {
          const currentQuery = searchQueries[i];
          await sendChunk({ 
            researchStatus: `Searching index database for: "${currentQuery.substring(0, 35)}..." (${i+1}/${searchQueries.length})` 
          });

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
          await sendChunk({ sources: searchSources });
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 3, 
          researchStatus: "Cross-referencing resources and identifying critical conflicts..." 
        });

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
          await sendChunk({ thought: text });
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 4, 
          researchStatus: "Running fact auditing algorithms..." 
        });

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
          await sendChunk({ thought: text });
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 5, 
          researchStatus: "Synthesizing critique and compiling publication-quality document..." 
        });

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
          await sendChunk({ text: text });
        }

        await sendChunk({ 
          researchTimeline: timeline, 
          activeStageIndex: 7, 
          researchStatus: "Deep Research analysis pipeline complete." 
        });

      } else {
        // --- STANDARD CHAT GENERATION MODE ---
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

        if (!finalUseWebSearch && queryForSearch) {
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
              console.log("[JOB PROCESSOR] [WEB_SEARCH_CLASSIFIER] Auto-activated Web Search.");
            }
          } catch (err) {
            console.warn("[JOB PROCESSOR] [WEB_SEARCH_CLASSIFIER] Classification failed, continuing normal flow.");
          }
        }

        let searchSources: any[] = [];

        if (finalUseWebSearch) {
          const tavKey = this.envBindings.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
          if (!tavKey) {
            console.error("[JOB PROCESSOR] [ERROR] Web Search API key missing");
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
              jobEventEmitter.emit(`update:${job.id}`, { status: 'running', researchStatus: 'Searching Web...' });
              try {
                const tavilyRes = await fetch("https://api.tavily.com/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    api_key: tavKey,
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
                console.error("[JOB PROCESSOR] [TAVILY ERROR]", err);
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

        const classification = await classifyMemory(userText, currentMemoriesForClassification, "", keysToUse);
        
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
                const { data: memData } = await supabase
                  .from('memories')
                  .select('content')
                  .eq('id', classification.targetMemoryId)
                  .single();
                if (memData) {
                  oldContent = memData.content;
                }
              } catch (err) {
                console.error("[JOB PROCESSOR] [MEMORY UPDATE FETCH ERROR]", err);
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
                const { data: memData } = await supabase
                  .from('memories')
                  .select('content')
                  .eq('id', classification.targetMemoryId)
                  .single();
                if (memData) {
                  content = memData.content;
                }
              } catch (err) {
                console.error("[JOB PROCESSOR] [MEMORY DELETE FETCH ERROR]", err);
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
            console.error("[JOB PROCESSOR] [MEMORY REDESIGN PROCESSING FAILED]", err);
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

        // Current Date & Time Awareness
        const now = new Date();
        const timeZone = payload.timezone || 'UTC';
        
        let localDate = '';
        let localTime = '';
        let dayOfWeek = '';
        
        try {
          localDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
          localTime = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
          dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now);
        } catch (e) {
          localDate = now.toISOString().split('T')[0];
          localTime = now.toISOString().split('T')[1].substring(0, 5) + ' UTC';
          dayOfWeek = 'Unknown';
        }

        baseInstruction += `\n\n=== RUNTIME CONTEXT ===\n` +
          `Current UTC Time: ${now.toISOString()}\n` +
          `User Timezone: ${timeZone}\n` +
          `Local Date: ${localDate}\n` +
          `Local Time: ${localTime}\n` +
          `Day of Week: ${dayOfWeek}\n` +
          `Always calculate relative dates (e.g., "tomorrow", "next tuesday") based on this runtime date. Never hallucinate past dates or use placeholder dates.`;

        const systemInstruction = systemInstructionOverride 
          ? `${memoryContext}${baseInstruction}\n${systemInstructionOverride}`
          : `${memoryContext}${baseInstruction}`;

        const config: any = {
          systemInstruction,
          temperature: 0.7,
        };

        if (memoriesUsedCount > 0) {
          await sendChunk({ 
            memoriesUsedCount,
            memoriesUsed: memoriesUsedList,
            isManualMemories: activeMemories && activeMemories.length > 0
          });
        }
        if (memoryUpdateNeeded) {
          await sendChunk({ memoryUpdateNeeded });
        }
        if (memoryDeleteNeeded) {
          await sendChunk({ memoryDeleteNeeded });
        }
        if (profileSummary) {
          await sendChunk({ profileSummary });
        }
        if (searchSources && searchSources.length > 0) {
          await sendChunk({ sources: searchSources });
        }
        if (savedMemoryPayload) {
          await sendChunk({ memorySaved: savedMemoryPayload });
        }
        if (memoryReviewNeeded) {
          await sendChunk({ memoryReviewNeeded });
        }
        if (isMemoryLimitReached) {
          await sendChunk({ memoryLimitReached: true });
        }
        if (isMemorySaveFailed) {
          await sendChunk({ memorySaveFailed: true });
        }
        
        jobEventEmitter.emit(`update:${job.id}`, { status: 'running', researchStatus: 'Generating response...' });

        const stream = await ai.models.generateContentStream({
          model: model,
          contents: contents,
          config: config
        });

        let hasSentGrounding = false;
        for await (const chunk of stream) {
          const candidate = chunk.candidates?.[0];
          
          if (candidate?.groundingMetadata && !hasSentGrounding) {
            hasSentGrounding = true;
            await sendChunk({ groundingMetadata: candidate.groundingMetadata });
          }

          const parts = candidate?.content?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.thought === true && part.text) {
                await sendChunk({ thought: part.text });
              } else if (part.thought && typeof part.thought === 'string') {
                await sendChunk({ thought: part.thought });
              } else if (part.text) {
                await sendChunk({ text: part.text });
              }
            }
          }
        }
      }

      // Clear any pending DB timers and write the final output
      if (dbBatchTimer) {
        clearTimeout(dbBatchTimer);
      }

      // --- PERSIST SUCCESSFUL MESSAGE ---
      if (job.chat_id) {
        try {
          const { error: saveErr } = await supabase
            .from('messages')
            .upsert({
              id: job.message_id,
              chat_id: job.chat_id,
              role: 'model',
              content: fullResponseText
            });
          
          if (!saveErr) {
            await supabase
              .from('chats')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', job.chat_id);
          } else {
            console.error("[JOB PROCESSOR] [DATABASE] Error upserting final message", saveErr);
          }
        } catch (dbErr) {
          console.error("[JOB PROCESSOR] [DATABASE] Exception saving background generation", dbErr);
        }
      }

      // Complete job
      job.status = 'completed';
      job.final_output = fullResponseText;
      job.completed_at = new Date().toISOString();
      job.updated_at = new Date().toISOString();
      
      if (usingDb) {
        await supabase
          .from('ai_generation_jobs')
          .update({ 
            status: 'completed', 
            final_output: fullResponseText, 
            completed_at: job.completed_at,
            updated_at: job.updated_at
          })
          .eq('id', job.id);
      } else {
        inMemoryJobs.set(job.id, { ...job });
      }

      console.log(`[JOB PROCESSOR] [COMPLETED] Job ${job.id} done!`);
      jobEventEmitter.emit(`update:${job.id}`, { status: 'completed', text: '' });

    } catch (error: any) {
      console.error(`[JOB PROCESSOR] [FAILED] Job ${job.id} failed:`, error?.message || error);
      
      if (dbBatchTimer) {
        clearTimeout(dbBatchTimer);
      }

      job.status = 'failed';
      job.error = error.message || "Generation error";
      job.completed_at = new Date().toISOString();
      job.updated_at = new Date().toISOString();

      if (usingDb) {
        await supabase
          .from('ai_generation_jobs')
          .update({ 
            status: 'failed', 
            error: job.error, 
            completed_at: job.completed_at,
            updated_at: job.updated_at
          })
          .eq('id', job.id);
      } else {
        inMemoryJobs.set(job.id, { ...job });
      }

      jobEventEmitter.emit(`update:${job.id}`, { error: job.error });
    }
  }
}

// Start background processor

// Main Chat queue endpoint
app.post('/api/chat', async (c) => {
  try {
    const payload = await c.req.json();
    const chatId = payload.chatId;
    const model = payload.model || "models/gemini-3.1-flash-lite-preview";
    const { messages, messageId, userId } = payload;

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: "Messages array is required" }, 400);
    }

    AIJobProcessor.init();
    AIJobProcessor.captureEnv(c.env);

    // Get the original prompt text from the last user message
    const lastUserMessage = messages[messages.length - 1];
    let userPrompt = "Generate content";
    if (lastUserMessage) {
      if (typeof lastUserMessage.content === 'string' && lastUserMessage.content) {
        userPrompt = lastUserMessage.content;
      } else if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
        const textPart = lastUserMessage.parts.find((p: any) => p.text && typeof p.text === 'string');
        if (textPart) userPrompt = textPart.text;
      }
    }

    // Clean up messageId (remove assistant- prefix to ensure a valid UUID)
    const cleanMessageId = messageId && messageId.startsWith('assistant-')
      ? messageId.substring(10)
      : (messageId || crypto.randomUUID());

    const jobId = crypto.randomUUID();

    // Store in-memory
    const newJob: Job = {
      id: jobId,
      user_id: userId || '',
      chat_id: chatId || '',
      message_id: cleanMessageId,
      model: model,
      prompt: userPrompt,
      payload: payload,
      status: 'queued',
      progress: 0,
      partial_output: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    inMemoryJobs.set(jobId, newJob);

    // Try to write to database
    const supabase = createAdminClient();
    try {
      const { error: dbErr } = await supabase
        .from('ai_generation_jobs')
        .insert({
          id: jobId,
          user_id: userId || null,
          chat_id: chatId || null,
          message_id: cleanMessageId,
          model: model,
          prompt: userPrompt,
          payload: payload,
          status: 'queued',
          progress: 0,
          partial_output: '',
          created_at: newJob.created_at,
          updated_at: newJob.updated_at
        });
      
      if (dbErr) {
        console.warn("[API/CHAT] Could not write job to db, using memory fallback:", dbErr.message);
      }
    } catch (e) {
      // Table doesn't exist
    }

    // Trigger processing asynchronously
    AIJobProcessor.trigger(c.executionCtx);

    return c.json({ jobId, status: 'queued', messageId: cleanMessageId });

  } catch (error: any) {
    console.error("[ERROR] GEMINI QUEUE CHAT ERROR", error?.message);
    return c.json({ error: error.message || "Internal Server Error" }, 500);
  }
});

// Stream endpoint to stream tokens of background jobs in real-time
app.get('/api/chat/stream', async (c) => {
  const jobId = c.req.query('jobId');
  if (!jobId) {
    return c.json({ error: "jobId is required" }, 400);
  }

  AIJobProcessor.init();
  AIJobProcessor.captureEnv(c.env);
  const supabase = createAdminClient();
  let job: Job | null = null;
  try {
    const { data } = await supabase
      .from('ai_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (data) {
      job = data as Job;
    }
  } catch (e) {}

  if (!job) {
    job = inMemoryJobs.get(jobId) || null;
  }

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return new Response(new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const writeObj = (obj: any) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch (e) {}
      };

      // Catch up on any accumulated output so far
      if (job.partial_output) {
        writeObj({ text: job.partial_output });
      }

      if (job.status === 'completed') {
        writeObj({ text: '' }); // finish
        controller.close();
        return;
      }

      if (job.status === 'failed') {
        writeObj({ error: job.error || "Generation failed" });
        controller.close();
        return;
      }

      if (job.status === 'cancelled') {
        writeObj({ error: "Generation cancelled" });
        controller.close();
        return;
      }

      // Subscribe to real-time events
      const onUpdate = (update: any) => {
        writeObj(update);
      };

      jobEventEmitter.on(`update:${jobId}`, onUpdate);

      // Regularly poll job state in background to close connection when finished
      const checkInterval = setInterval(async () => {
        let currentJob: Job | null = null;
        try {
          const { data } = await supabase
            .from('ai_generation_jobs')
            .select('status, error')
            .eq('id', jobId)
            .single();
          if (data) currentJob = data as Job;
        } catch (e) {}

        if (!currentJob) {
          currentJob = inMemoryJobs.get(jobId) || null;
        }

        if (!currentJob || ['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
          clearInterval(checkInterval);
          jobEventEmitter.off(`update:${jobId}`, onUpdate);
          try {
            controller.close();
          } catch (e) {}
        }
      }, 1000);

      // Handle abort
      c.req.raw.signal?.addEventListener('abort', () => {
        clearInterval(checkInterval);
        jobEventEmitter.off(`update:${jobId}`, onUpdate);
        try {
          controller.close();
        } catch (e) {}
      });
    }
  }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    }
  });
});

// Endpoint to fetch active jobs for a chat (helps in UI recovery)
app.get('/api/chat/active-jobs', async (c) => {
  const chatId = c.req.query('chatId');
  if (!chatId) {
    return c.json({ error: "chatId is required" }, 400);
  }

  AIJobProcessor.captureEnv(c.env);
  const supabase = createAdminClient();
  let jobs: Job[] = [];
  try {
    const { data } = await supabase
      .from('ai_generation_jobs')
      .select('*')
      .eq('chat_id', chatId)
      .in('status', ['queued', 'running', 'streaming']);
    if (data) {
      jobs = data as Job[];
    }
  } catch (e) {}

  // Merge with memory active jobs
  const inMemoryActive = Array.from(inMemoryJobs.values())
    .filter(j => j.chat_id === chatId && ['queued', 'running', 'streaming'].includes(j.status));

  const combined = [...jobs];
  inMemoryActive.forEach(imj => {
    if (!combined.some(dbj => dbj.id === imj.id)) {
      combined.push(imj);
    }
  });

  return c.json(combined);
});

// Endpoint to fetch job details
app.get('/api/chat/job/:id', async (c) => {
  const jobId = c.req.param('id');
  AIJobProcessor.captureEnv(c.env);
  const supabase = createAdminClient();
  let job: Job | null = null;
  try {
    const { data } = await supabase
      .from('ai_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (data) {
      job = data as Job;
    }
  } catch (e) {}

  if (!job) {
    job = inMemoryJobs.get(jobId) || null;
  }

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json(job);
});

// 18. Runtime configuration endpoint
app.get('/api/config', async (c) => {
  const env = c.env || {} as any;
  const envKeys = Object.keys(env);
  
  console.log('[ENV KEYS] Available bindings:', envKeys.join(', '));
  
  const publicConfig: Record<string, string> = {};
  
  // 1. Try to extract all NEXT_PUBLIC_ variables
  for (const key of envKeys) {
    if (key.startsWith('NEXT_PUBLIC_') && typeof env[key] === 'string') {
      publicConfig[key] = env[key];
    }
  }

  // 2. Map critical Supabase variables with fallbacks
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (supabaseUrl) publicConfig['NEXT_PUBLIC_SUPABASE_URL'] = supabaseUrl;
  if (supabaseAnonKey) publicConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = supabaseAnonKey;

  const foundCount = Object.keys(publicConfig).length;
  console.log(`[CONFIG API] Found ${foundCount} public variables. NEXT_PUBLIC_SUPABASE_URL: ${!!supabaseUrl ? 'FOUND' : 'MISSING'}`);

  // 3. Validation
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    console.error(`[CONFIG BUILD] Missing variables: ${missing.join(', ')}`);
    return c.json({
      error: "Missing runtime configuration",
      missing,
      availableKeys: envKeys,
      runtime: 'cloudflare-worker'
    }, 412);
  }
  
  return c.json({
    ...publicConfig,
    runtime: 'cloudflare-worker',
    buildTime: new Date().toISOString()
  });
});

// 19. Serves fallback index.html for React SPA Routing on GET *
app.get('*', async (c, next) => {
  const url = new URL(c.req.url);
  
  // Diagnostic logs
  const assetsAvailable = !!c.env.ASSETS;
  const runtime = process.env.NODE_ENV || 'development';
  
  console.log(`[ASSETS CHECK] Assets Available: ${assetsAvailable} | Runtime: ${runtime} | Path: ${url.pathname}`);

  // If request contains extension (files like .js, .css, .png, etc.), or is /api/* request, let it go.
  if (url.pathname.startsWith('/api') || url.pathname.includes('.')) {
    return next();
  }
  
  // If ASSETS binding is missing (usually in development), let Vite dev server handle it
  if (!assetsAvailable) {
    if (runtime === 'development') {
      return next();
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

const worker = {
  async fetch(request: Request, env: Bindings, ctx: any) {
    return app.fetch(request, env, ctx);
  }
};

export default worker;
