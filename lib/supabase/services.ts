import { createClient } from './client';
import { logger, LogCategory } from '../logger';

export async function createChat(userId: string, title: string) {
  const supabase = createClient();
  
  const auditData: any = {
    step: 'Initialization',
    timestamp: new Date().toISOString(),
    userId
  };
  
  // 1. Get and verify user session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  auditData.authSession = {
    exists: !!session,
    expires_at: session?.expires_at,
    has_access_token: !!session?.access_token,
    error: sessionError?.message
  };
  
  auditData.authUser = {
    exists: !!user,
    id: user?.id,
    email: user?.email,
    error: userError?.message
  };
  
  if (!user) {
    logger.logError(LogCategory.DATABASE, "Chat creation aborted: No authenticated user session found.", auditData);
    throw new Error("Unable to create chat: You are not authenticated. Please log in first.");
  }
  
  if (user.id !== userId) {
    logger.logWarn(LogCategory.DATABASE, `User ID Mismatch! Session has user id ${user.id}, but requested userId is ${userId}. Aligning to authenticated user ID.`);
    userId = user.id;
  }

  // 2. Ensure profile row exists to resolve foreign key constraints
  const { data: profile, error: profileCheckError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profileCheckError) {
    logger.logWarn(LogCategory.DATABASE, "Error while checking profile existence", profileCheckError);
  }

  if (!profile) {
    logger.logInfo(LogCategory.DATABASE, `Profile for user ${userId} not found. Attempting automatic creation...`);
    
    const defaultName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const { error: profileInsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: user.email || '',
        full_name: defaultName,
        created_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
    if (profileInsertError) {
      logger.logError(LogCategory.DATABASE, "Failed to automatically create user profile", profileInsertError);
    } else {
      logger.logInfo(LogCategory.DATABASE, "Successfully created/upserted user profile.");
    }
  }

  // 3. Perform Insert
  const payload = { user_id: userId, title };
  
  logger.logGroup(LogCategory.DATABASE, "OPERATION: insert chat", { payload });

  const { data, error } = await supabase
    .from('chats')
    .insert(payload)
    .select()
    .single();

  if (error) {
    logger.logError(LogCategory.DATABASE, "Insert Chat Error", error);
    if (error.code === '42501') {
      throw new Error(`Permission Denied (RLS policy violation): Your session might be stale or your authenticated ID does not match. Please log out and log in again to refresh your session credentials.`);
    }
    throw new Error(`Failed to create chat: ${error.message} (code: ${error.code})`);
  }

  logger.reportAudit(LogCategory.DATABASE, "CHAT CREATION SUCCESS", { chatId: data.id, userId });
  return data;
}

export async function getChats(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    logger.logError(LogCategory.DATABASE, "getChats failed", error);
    throw error;
  }
  return data;
}

export async function updateChatTitle(chatId: string, title: string, title_generated: boolean = true) {
  const supabase = createClient();
  logger.logGroup(LogCategory.DATABASE, "OPERATION: update chat title", { chatId, title, title_generated });
  const { error } = await supabase
    .from('chats')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', chatId);
  if (error) {
    logger.logError(LogCategory.DATABASE, "updateChatTitle failed", error);
    throw error;
  }
}

export async function togglePinChat(chatId: string, is_pinned: boolean) {
  const supabase = createClient();
  logger.logGroup(LogCategory.DATABASE, "OPERATION: toggle chat pin", { chatId, is_pinned });
  const { error } = await supabase
    .from('chats')
    .update({ is_pinned, updated_at: new Date().toISOString() })
    .eq('id', chatId);
  if (error) {
    logger.logError(LogCategory.DATABASE, "togglePinChat failed", error);
    throw error;
  }
}

export async function deleteChat(chatId: string) {
  const supabase = createClient();
  logger.logGroup(LogCategory.DATABASE, "OPERATION: delete chat", { chatId });

  try {
    // 1. Get all messages for this chat
    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('chat_id', chatId);

    const messageIds = messages?.map(m => m.id) || [];

    if (messageIds.length > 0) {
      // 2. Get all attachments for these messages
      const { data: attachments } = await supabase
        .from('message_attachments')
        .select('storage_path')
        .in('message_id', messageIds);

      const paths = Array.from(new Set((attachments || []).map(a => a.storage_path).filter(Boolean)));

      if (paths.length > 0) {
        // 3. For each path, check if it's used in any OTHER message
        for (const path of paths) {
          const { count } = await supabase
            .from('message_attachments')
            .select('id', { count: 'exact', head: true })
            .eq('storage_path', path)
            .not('message_id', 'in', `(${messageIds.join(',')})`);

          if (count === 0) {
            // No other references, safe to delete from bucket
            const bucketName = 'chat-attachments';
            console.log("[STORAGE BUCKET CLEARING]", bucketName, path);
            await supabase.storage.from(bucketName).remove([path!]);
          }
        }
      }
    }
  } catch (err) {
    logger.logError(LogCategory.DATABASE, "Error cleanup before chat deletion", err);
    // Continue with chat deletion even if cleanup fails
  }

  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId);
    
  if (error) {
    logger.logError(LogCategory.DATABASE, "deleteChat failed", error);
    throw error;
  }
}

export async function saveMessage(chatId: string, role: string, content: string, reasoning?: string) {
  const supabase = createClient();
  logger.logGroup(LogCategory.DATABASE, "OPERATION: save message", { chatId, role, contentLength: content.length });
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      role,
      content,
      reasoning
    })
    .select()
    .single();
  if (error) {
    logger.logError(LogCategory.DATABASE, "saveMessage failed", error);
    throw error;
  }

  // Also update chat updated_at
  const { error: updateChatError } = await supabase
    .from('chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId);
  
  if (updateChatError) {
    logger.logError(LogCategory.DATABASE, "update chat updated_at failed", updateChatError);
  }
    
  return data;
}

export async function updateMessage(messageId: string, content: string, reasoning?: string) {
  const supabase = createClient();
  logger.logGroup(LogCategory.DATABASE, "OPERATION: update message", { messageId, contentLength: content.length });
  const { data, error } = await supabase
    .from('messages')
    .update({
      content,
      reasoning,
      updated_at: new Date().toISOString()
    })
    .eq('id', messageId)
    .select()
    .single();
    
  if (error) {
    logger.logError(LogCategory.DATABASE, "updateMessage failed", error);
    throw error;
  }
  return data;
}

let diagnosticsExecuted = false;

export async function runStartupDiagnostics() {
  if (diagnosticsExecuted) return;
  diagnosticsExecuted = true;

  let messagesTable = false;
  let attachmentsTable = false;
  let foreignKeyExists = false;
  let postgrestRelationshipReady = false;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Fetch PostgREST OpenAPI spec directly to verify actual schema metadata
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      }
    });

    if (res.ok) {
      const spec = await res.json();
      
      messagesTable = !!spec.definitions?.messages;
      attachmentsTable = !!spec.definitions?.message_attachments;

      if (attachmentsTable) {
        const messageIdProps = spec.definitions.message_attachments.properties?.message_id;
        if (messageIdProps && messageIdProps.description?.includes("<fk table='messages' column='id'/>")) {
          foreignKeyExists = true;
        }
      }

      if (messagesTable && attachmentsTable && foreignKeyExists) {
        const supabase = createClient();
        const { error: relErr } = await supabase
          .from('messages')
          .select(`
            *,
            message_attachments(*)
          `)
          .limit(1);
        
        postgrestRelationshipReady = !relErr;
      }
    }
  } catch (err) {
    console.error("[DATABASE SCHEMA AUDIT ERROR] Failed to fetch OpenAPI spec:", err);
  }

  console.info("[DATABASE SCHEMA AUDIT]\n" + JSON.stringify({
    messagesTable,
    attachmentsTable,
    foreignKeyExists,
    postgrestRelationshipReady
  }, null, 2));
}

// Automatically trigger startup checks server-side on module load
if (typeof window === 'undefined') {
  runStartupDiagnostics().catch(err => {
    console.error("Failed to run startup diagnostics:", err);
  });
}

export async function getMessages(chatId: string) {
  const supabase = createClient();
  
  try {
    // Primary path: Load messages + attachments together
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        *,
        message_attachments(*)
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
      
    if (error) {
      throw error;
    }
    
    const formattedMessages = (messages || []).map((m: any) => ({
      ...m,
      attachments: m.message_attachments || []
    }));

    console.info("[ATTACHMENT QUERY]\n" + JSON.stringify({
      chatId,
      messagesLoaded: formattedMessages.length,
      attachmentsLoaded: formattedMessages.reduce((acc, m) => acc + (m.attachments?.length || 0), 0)
    }, null, 2));

    return formattedMessages;
  } catch (err: any) {
    // Fallback: Emergency protection only
    console.warn("[DATABASE RELATIONSHIP EXCEPTION] Loading messages + attachments fell back due to exception:", err.message || err);
    
    try {
      const { data: messages, error: fallbackError } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (fallbackError) {
        logger.logError(LogCategory.DATABASE, "getMessages fallback failed", fallbackError);
        throw fallbackError;
      }

      return (messages || []).map((m: any) => ({
        ...m,
        attachments: []
      }));
    } catch (criticalErr) {
      logger.logError(LogCategory.DATABASE, "getMessages critical fallback failed", criticalErr);
      throw criticalErr;
    }
  }
}

export async function uploadAttachment(userId: string, file: File | Blob, fileName: string) {
  const supabase = createClient();
  const bucketName = 'chat-attachments';

  const diagnostics = {
    bucketExists: false,
    bucketName,
    authenticatedUser: '',
    uploadPath: ''
  };

  try {
    // 1. Verify the authenticated user exists before upload
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      throw new Error("You must be logged in to upload files.");
    }
    if (session.user.id !== userId) {
      throw new Error("Authentication mismatch for user upload.");
    }
    diagnostics.authenticatedUser = session.user.id;

    // 2. Reject files larger than 10MB before upload
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      throw new Error(`File size is too large. Max limit is 10MB. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    }

    // 3. Verify bucket exists before upload
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (!listError && buckets) {
        diagnostics.bucketExists = buckets.some(b => b.id === bucketName || b.name === bucketName);
      }
    } catch (e) {
      console.warn("[STORAGE LIST ERRORS]", e);
    }

    // 4. Ensure uploaded files use a user-scoped path: ${user.id}/${timestamp}-${file.name}
    const timestamp = Date.now();
    // Sanitize file name
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${userId}/${timestamp}-${safeFileName}`;
    diagnostics.uploadPath = filePath;

    // 5. Add automatic bucket diagnostics
    console.info("[STORAGE CHECK]\n" + JSON.stringify(diagnostics, null, 2));

    // 6. Upload with retry logic
    let uploadError: any = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        uploadError = error;
        // Check for transient failures
        const isTransient = error.message?.includes('fetch') || 
                            error.message?.toLowerCase().includes('timeout') || 
                            (error as any).statusCode === 502 || 
                            (error as any).statusCode === 503;
        
        if (isTransient && retryCount < maxRetries) {
          retryCount++;
          console.info(`[UPLOAD RETRY] Transient error encountered, retrying (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
        break; // Stop retrying on non-transient or if max retries reached
      } else {
        uploadError = null;
        break; // Success
      }
    }

    // 7. Handle RLS and fatal errors
    if (uploadError) {
      console.error("[STORAGE UPLOAD FATAL LOG]", {
        bucket: bucketName,
        path: filePath,
        userId,
        error: uploadError
      });

      const isRlsError = uploadError.message?.toLowerCase().includes('row-level security') || 
                         uploadError.message?.toLowerCase().includes('rls');
                         
      if (isRlsError) {
        throw new Error("Upload failed due to database security policies (RLS). Ensure storage bucket policies are configured for your account.");
      }
      throw new Error("Failed to upload the file. Please try again later.");
    }

    // 8. Return successful upload details
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return { storagePath: filePath, publicUrl };

  } catch (err: any) {
    if (err.message && !err.message.includes("is not defined")) {
      logger.logError(LogCategory.DATABASE, "Storage upload gracefully failed", err);
      throw err;
    }
    console.error("[STORAGE PRE-UPLOAD ERRORS]", err.message || err);
    throw new Error("An unexpected error occurred during upload. Please try again.");
  }
}

export async function saveAttachmentRecord(attachment: {
  message_id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  public_url: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('message_attachments')
    .insert(attachment)
    .select()
    .single();

  if (error) {
    logger.logError(LogCategory.DATABASE, "saveAttachmentRecord failed", error);
    throw error;
  }
  return data;
}

export async function getMessageReactions(userId: string, chatId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('message_feedback')
    .select('message_id, reaction:feedback_type')
    .eq('user_id', userId)
    .eq('chat_id', chatId);
  if (error) {
    logger.logError(LogCategory.DATABASE, "getMessageReactions failed", error);
    return [];
  }
  return data;
}

export async function setMessageReaction(userId: string, chatId: string, messageId: string, reaction: 'like' | 'dislike' | null) {
  const supabase = createClient();
  if (reaction === null) {
    const { error } = await supabase
      .from('message_feedback')
      .delete()
      .match({ user_id: userId, message_id: messageId });
    if (error) {
      logger.logError(LogCategory.DATABASE, "remove reaction failed", error);
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('message_feedback')
      .upsert({
        user_id: userId,
        message_id: messageId,
        feedback_type: reaction,
        updated_at: new Date().toISOString()
      }, { onConflict: 'message_id, user_id' });
    if (error) {
      logger.logError(LogCategory.DATABASE, "set reaction failed", error);
      throw error;
    }
  }
}

export async function saveMessageVersion(parentMessageId: string, responseContent: string, versionNumber: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('message_versions')
    .insert({
      parent_message_id: parentMessageId,
      response_content: responseContent,
      version_number: versionNumber
    })
    .select()
    .single();
  if (error) {
    logger.logError(LogCategory.DATABASE, "saveMessageVersion failed", error);
    throw error;
  }
  return data;
}

export async function getMessageVersions(parentMessageId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('message_versions')
    .select('*')
    .eq('parent_message_id', parentMessageId)
    .order('version_number', { ascending: true });
  if (error) {
    logger.logError(LogCategory.DATABASE, "getMessageVersions failed", error);
    return [];
  }
  return data;
}

