import { createClient } from './client';
import { logger, LogCategory } from '../logger';

export interface DocumentRecord {
  id: string;
  user_id: string;
  chat_id?: string | null;
  title: string;
  content: string;
  metadata: {
    comments?: Array<{ id: string; text: string; selection?: string; author: string; timestamp: string }>;
    aiSuggestions?: string[];
    version?: number;
    pendingReview?: {
      originalSelection?: string;
      requestedChanges?: string;
      aiProposedContent?: string;
    };
  };
  version_snapshots: Array<{
    version: number;
    title: string;
    content: string;
    timestamp: string;
  }>;
  created_at?: string;
  updated_at?: string;
}

// Memory / Local Storage Fallback for absolute bulletproof operation
const LOCAL_STORAGE_KEY = 'plack_workspace_docs';

export function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export interface StartupDiagnostics {
  documentsTableExists: boolean;
  documentVersionsTableExists: boolean;
  canReadDocuments: boolean;
  canInsertDocuments: boolean;
}

/**
 * Runs document table schema diagnostics on start.
 */
export async function runDocumentSystemDiagnostics(userId?: string): Promise<StartupDiagnostics> {
  const supabase = createClient();
  const diagnostics: StartupDiagnostics = {
    documentsTableExists: false,
    documentVersionsTableExists: false,
    canReadDocuments: false,
    canInsertDocuments: false,
  };

  try {
    // 1. Check if public.documents exists
    const { error: collectDocsError } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    if (collectDocsError) {
      const isSchemaError = collectDocsError.code === 'PGRST205' || collectDocsError.message?.includes('schema "public" does not exist');
      if (isSchemaError) {
        console.error('[DOCUMENT SYSTEM ERROR] PGRST205 FIX REQUIRED: The "public" schema was not found. This often indicates a stale PostgREST schema cache. Try running "NOTIFY pgrst, \'reload schema\';" in your Database SQL Editor.');
      }

      if (collectDocsError.code === '42P01' || collectDocsError.message?.includes('does not exist') || isSchemaError) {
        diagnostics.documentsTableExists = false;
      } else {
        diagnostics.documentsTableExists = true;
        diagnostics.canReadDocuments = true;
      }
    } else {
      diagnostics.documentsTableExists = true;
      diagnostics.canReadDocuments = true;
    }

    // 2. Check if public.document_versions exists
    const { error: collectVerError } = await supabase
      .from('document_versions')
      .select('id')
      .limit(1);

    if (collectVerError) {
      const isSchemaError = collectVerError.code === 'PGRST205' || collectVerError.message?.includes('schema "public" does not exist');
      if (collectVerError.code === '42P01' || collectVerError.message?.includes('does not exist') || isSchemaError) {
        diagnostics.documentVersionsTableExists = false;
      } else {
        diagnostics.documentVersionsTableExists = true;
      }
    } else {
      diagnostics.documentVersionsTableExists = true;
    }

    // 3. Check clean inserts capability for authenticated user
    if (diagnostics.documentsTableExists && userId && isValidUuid(userId)) {
      const tempId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          id: tempId,
          user_id: userId,
          title: 'STARTUP_TEST',
          content: 'TEST_CONTENT',
          metadata: { is_diagnostic: true },
          version_snapshots: []
        });

      if (!insertError) {
        diagnostics.canInsertDocuments = true;
        // Clean up test document immediately
        await supabase.from('documents').delete().eq('id', tempId);
      } else {
        diagnostics.canInsertDocuments = false;
        logger.logWarn(LogCategory.DATABASE, `Diagnostics insert test failed. Code: ${insertError.code}. Message: ${insertError.message}`);
      }
    }
  } catch (err: any) {
    logger.logError(LogCategory.DATABASE, 'Uncaught exception during startup diagnostics', err);
  }

  console.log('[DOCUMENT SYSTEM CHECK]');
  console.log(JSON.stringify(diagnostics, null, 2));

  if (!diagnostics.documentsTableExists || !diagnostics.documentVersionsTableExists) {
    console.warn('⚠️ [DOCUMENT SYSTEM WARNING] Database tables are missing! Falling back to local storage and disabling remote document features.');
  }

  return diagnostics;
}

function getLocalDocs(): DocumentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[DOC PERSISTENCE] localStorage read failed', e);
    return [];
  }
}

function saveLocalDoc(doc: DocumentRecord) {
  if (typeof window === 'undefined') return;
  try {
    const docs = getLocalDocs();
    const idx = docs.findIndex(d => d.id === doc.id);
    if (idx >= 0) {
      docs[idx] = doc;
    } else {
      docs.push(doc);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.warn('[DOC PERSISTENCE] localStorage save failed', e);
  }
}

/**
 * Creates a new document record. Automatically syncs with Database if online/available,
 * with real-time localStorage sync and robust error handling.
 */
export async function createDocument(userId: string, chatId: string | null, title: string, content: string): Promise<DocumentRecord> {
  const supabase = createClient();
  const cleanChatId = (chatId && isValidUuid(chatId)) ? chatId : null;
  
  const newDoc: DocumentRecord = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    user_id: userId,
    chat_id: cleanChatId,
    title,
    content,
    metadata: {
      comments: [],
      aiSuggestions: [],
      version: 1
    },
    version_snapshots: [
      {
        version: 1,
        title,
        content,
        timestamp: new Date().toISOString()
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Always save locally first to avoid network blocks (Offline capability / Instant start)
  saveLocalDoc(newDoc);

  try {
    // Check session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      logger.logInfo(LogCategory.DATABASE, 'User not authenticated for Cloud Documents, persisting locally.');
      return newDoc;
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: newDoc.id,
        user_id: userId,
        chat_id: cleanChatId,
        title: newDoc.title,
        content: newDoc.content,
        metadata: newDoc.metadata,
        version_snapshots: newDoc.version_snapshots
      })
      .select()
      .single();

    if (error) {
      logger.logError(LogCategory.DATABASE, `Failed to insert document. Code: ${error.code}. Message: ${error.message}. Details: ${error.details}. Hint: ${error.hint}`);
      
      const isSchemaError = error.code === 'PGRST205' || error.message?.includes('schema "public" does not exist');
      if (isSchemaError) {
        console.error('[CRITICAL DOCUMENT ERROR] PGRST205 Detected: Schema cache might be stale. Contact administrator.');
      }

      throw new Error(`Database insert failed: [${error.code}] ${error.message}${error.hint ? '. Hint: ' + error.hint : ''}`);
    }

    return data as DocumentRecord;
  } catch (err: any) {
    logger.logError(LogCategory.DATABASE, 'Uncaught exception during document creation', err);
    throw err;
  }
}

/**
 * Fetches matching document by database ID.
 */
export async function getDocumentById(documentId: string): Promise<DocumentRecord | null> {
  const localDocs = getLocalDocs();
  const matchedLocal = localDocs.find(d => d.id === documentId);

  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) {
      return matchedLocal || null;
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle();

    if (error) {
      logger.logWarn(LogCategory.DATABASE, `Failed to load document by id. Code: ${error.code}. Message: ${error.message}. Details: ${error.details}. Hint: ${error.hint}`);
      return matchedLocal || null;
    }

    if (!data) return matchedLocal || null;
    return data as DocumentRecord;
  } catch (err) {
    logger.logError(LogCategory.DATABASE, 'Failed fetching document by id', err);
    return matchedLocal || null;
  }
}

/**
 * Saves/Updates an existing document record. Auto-saves changes debounced.
 */
export async function saveDocument(doc: DocumentRecord): Promise<DocumentRecord> {
  // Always save locally first
  saveLocalDoc(doc);

  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return doc;
    }

    const cleanChatId = (doc.chat_id && isValidUuid(doc.chat_id)) ? doc.chat_id : null;

    const updatedDoc = {
      ...doc,
      chat_id: cleanChatId,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('documents')
      .upsert({
        id: updatedDoc.id,
        user_id: updatedDoc.user_id,
        chat_id: updatedDoc.chat_id,
        title: updatedDoc.title,
        content: updatedDoc.content,
        metadata: updatedDoc.metadata,
        version_snapshots: updatedDoc.version_snapshots,
        updated_at: updatedDoc.updated_at
      })
      .select()
      .single();

    if (error) {
      logger.logWarn(LogCategory.DATABASE, `Failed to upsert document. Code: ${error.code}. Message: ${error.message}. Details: ${error.details}. Hint: ${error.hint}. Saved locally only.`);
      return updatedDoc;
    }

    return data as DocumentRecord;
  } catch (err: any) {
    logger.logError(LogCategory.DATABASE, 'Uncaught exception during saving document', err);
    return doc;
  }
}

/**
 * Fetches all documents related to a user and optional layout chat context.
 */
export async function getDocuments(userId: string, chatId?: string | null): Promise<DocumentRecord[]> {
  const localDocs = getLocalDocs().filter(d => d.user_id === userId);
  
  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const docs = chatId ? localDocs.filter(d => d.chat_id === chatId) : localDocs;
      console.log('[DOCUMENT QUERY]');
      console.log(JSON.stringify({
        userId,
        documentCount: docs.length,
        source: 'memory',
        success: true
      }, null, 2));
      return docs;
    }

    let query = supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId);

    if (chatId && isValidUuid(chatId)) {
      query = query.eq('chat_id', chatId);
    } else if (chatId === 'new-chat') {
      // For standard 'new-chat' logic, search for unlinked/null chat documents
      query = query.is('chat_id', null);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      logger.logError(LogCategory.DATABASE, `Failed to load documents. Code: ${error.code}. Message: ${error.message}. Details: ${error.details}. Hint: ${error.hint}`);
      
      const isSchemaError = error.code === 'PGRST205' || error.message?.includes('schema "public" does not exist');
      if (isSchemaError) {
        console.error('[CRITICAL DOCUMENT SYSTEM ERROR] PGRST205 Detected during document load.');
      }

      console.log('[DOCUMENT QUERY]');
      console.log(JSON.stringify({
        userId,
        documentCount: 0,
        source: 'database',
        success: false
      }, null, 2));

      // Strictly return empty list if query fails and user is authenticated
      return [];
    }

    // Merge papers and local storage values
    // Note: We are strictly prioritizing remote if online. 
    // We only merge local documents if they are unique or more recent.
    const mergedDocs = [...(data || [])];
    localDocs.forEach(localD => {
      const existsIdx = mergedDocs.findIndex(e => e.id === localD.id);
      if (existsIdx < 0) {
        // If filtering by chatId, only merge matching chatId
        if (!chatId || localD.chat_id === chatId || (chatId === 'new-chat' && !localD.chat_id)) {
          mergedDocs.push(localD);
        }
      } else {
        const remoteTime = new Date(mergedDocs[existsIdx].updated_at || 0).getTime();
        const localTime = new Date(localD.updated_at || 0).getTime();
        if (localTime > remoteTime) {
          mergedDocs[existsIdx] = localD;
        }
      }
    });

    console.log('[DOCUMENT QUERY]');
    console.log(JSON.stringify({
      userId,
      documentCount: mergedDocs.length,
      source: 'database',
      success: true
    }, null, 2));

    return mergedDocs as DocumentRecord[];
  } catch (err) {
    logger.logError(LogCategory.DATABASE, 'Failed fetching documents', err);
    const localCount = chatId ? localDocs.filter(d => d.chat_id === chatId).length : localDocs.length;
    console.log('[DOCUMENT QUERY]');
    console.log(JSON.stringify({
      userId,
      documentCount: localCount,
      source: 'memory',
      success: false
    }, null, 2));
    
    return chatId ? localDocs.filter(d => d.chat_id === chatId) : localDocs;
  }
}

export interface DocumentVersionRecord {
  id: string;
  document_id: string;
  content: string;
  title: string;
  version: number;
  created_at: string;
}

export interface DocumentCommentRecord {
  id: string;
  document_id: string;
  selection_start?: number | null;
  selection_end?: number | null;
  selection_text?: string | null;
  comment: string;
  author: string;
  created_at: string;
}

const LOCAL_VERSIONS_KEY = 'plack_doc_versions';
const LOCAL_COMMENTS_KEY = 'plack_doc_comments';

function getLocalVersions(docId: string): DocumentVersionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_VERSIONS_KEY);
    const list: DocumentVersionRecord[] = raw ? JSON.parse(raw) : [];
    return list.filter(v => v.document_id === docId);
  } catch (e) {
    return [];
  }
}

function saveLocalVersion(ver: DocumentVersionRecord) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_VERSIONS_KEY);
    const list: DocumentVersionRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(v => v.id === ver.id);
    if (idx >= 0) list[idx] = ver;
    else list.push(ver);
    localStorage.setItem(LOCAL_VERSIONS_KEY, JSON.stringify(list));
  } catch (e) {}
}

function getLocalComments(docId: string): DocumentCommentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    const list: DocumentCommentRecord[] = raw ? JSON.parse(raw) : [];
    return list.filter(c => c.document_id === docId);
  } catch (e) {
    return [];
  }
}

function saveLocalComment(comment: DocumentCommentRecord) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    const list: DocumentCommentRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(c => c.id === comment.id);
    if (idx >= 0) list[idx] = comment;
    else list.push(comment);
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(list));
  } catch (e) {}
}

function deleteLocalComment(commentId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    const list: DocumentCommentRecord[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(c => c.id !== commentId);
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

/**
 * Creates a version snapshot record.
 */
export async function createDocumentVersion(
  documentId: string,
  title: string,
  content: string,
  versionNum: number
): Promise<DocumentVersionRecord> {
  const newVer: DocumentVersionRecord = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    document_id: documentId,
    title,
    content,
    version: versionNum,
    created_at: new Date().toISOString()
  };

  saveLocalVersion(newVer);

  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) return newVer;

    const { data, error } = await supabase
      .from('document_versions')
      .insert({
        id: newVer.id,
        document_id: newVer.document_id,
        title: newVer.title,
        content: newVer.content,
        version: newVer.version
      })
      .select()
      .single();

    if (error) {
      logger.logWarn(LogCategory.DATABASE, `Failed to store version snapshot: ${error.message}`);
      return newVer;
    }
    return data as DocumentVersionRecord;
  } catch (err: any) {
    return newVer;
  }
}

/**
 * Loads all version snapshots.
 */
export async function getDocumentVersions(documentId: string): Promise<DocumentVersionRecord[]> {
  const localVers = getLocalVersions(documentId);
  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) return localVers.sort((a, b) => b.version - a.version);

    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_id', documentId)
      .order('version', { ascending: false });

    if (error) {
      return localVers.sort((a, b) => b.version - a.version);
    }

    // Merge
    const merged = [...(data || [])];
    localVers.forEach(lv => {
      if (!merged.some(m => m.id === lv.id)) {
        merged.push(lv);
      }
    });

    return merged.sort((a, b) => b.version - a.version) as DocumentVersionRecord[];
  } catch (err: any) {
    return localVers.sort((a, b) => b.version - a.version);
  }
}

/**
 * Deletes a document record.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const docs: DocumentRecord[] = raw ? JSON.parse(raw) : [];
      const filtered = docs.filter(d => d.id !== documentId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {}
  }

  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) return;

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      logger.logError(LogCategory.DATABASE, `Failed to delete document: ${error.message}`);
    }
  } catch (err: any) {
    logger.logError(LogCategory.DATABASE, 'Uncaught exception during document deletion', err);
  }
}

/**
 * Creates a collaborative inline comment.
 */
export async function createDocumentComment(
  documentId: string,
  comment: string,
  author: string,
  selection?: { start?: number | null; end?: number | null; text?: string | null }
): Promise<DocumentCommentRecord> {
  const newComment: DocumentCommentRecord = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    document_id: documentId,
    comment,
    author,
    selection_start: selection?.start ?? null,
    selection_end: selection?.end ?? null,
    selection_text: selection?.text ?? null,
    created_at: new Date().toISOString()
  };

  saveLocalComment(newComment);
  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) return newComment;

    const { data, error } = await supabase
      .from('document_comments')
      .insert({
        id: newComment.id,
        document_id: newComment.document_id,
        comment: newComment.comment,
        author: newComment.author,
        selection_start: newComment.selection_start,
        selection_end: newComment.selection_end,
        selection_text: newComment.selection_text
      })
      .select()
      .single();

    if (error) {
      logger.logWarn(LogCategory.DATABASE, `Failed to store comment: ${error.message}`);
      return newComment;
    }
    return data as DocumentCommentRecord;
  } catch (err: any) {
    return newComment;
  }
}

/**
 * Loads comments for a document.
 */
export async function getDocumentComments(documentId: string): Promise<DocumentCommentRecord[]> {
  const localComments = getLocalComments(documentId);
  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(documentId)) return localComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const { data, error } = await supabase
      .from('document_comments')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      return localComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const merged = [...(data || [])];
    localComments.forEach(lc => {
      if (!merged.some(m => m.id === lc.id)) {
        merged.push(lc);
      }
    });

    return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as DocumentCommentRecord[];
  } catch (err: any) {
    return localComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

/**
 * Deletes a comment.
 */
export async function deleteDocumentComment(commentId: string): Promise<void> {
  deleteLocalComment(commentId);
  const supabase = createClient();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isValidUuid(commentId)) return;

    await supabase
      .from('document_comments')
      .delete()
      .eq('id', commentId);
  } catch (err: any) {}
}

