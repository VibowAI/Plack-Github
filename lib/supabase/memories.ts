import { createClient, createAdminClient } from './client';
import { logger, LogCategory } from '../logger';

export interface Memory {
  id: string;
  user_id: string;
  category: string;
  content: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export async function getMemories(userId: string) {
  console.log(`[MEMORY LOAD] Starting memory retrieval for userId: ${userId}`);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.logError(LogCategory.DATABASE, 'getMemories failed', error);
    console.error(`[MEMORY ERROR] Failed to retrieve memories for userId ${userId}: ${error.message || error}`);
    return [];
  }
  console.log(`[MEMORY LOAD] Successfully retrieved ${data?.length || 0} memories.`);
  return (data || []) as Memory[];
}

export function calculateSlotsForContent(content: string): number {
  const length = (content || '').length;
  if (length <= 40) {
    return 1;
  } else if (length <= 120) {
    return 2;
  } else if (length <= 300) {
    return 3;
  } else if (length <= 750) {
    return 5;
  } else if (length <= 1500) {
    return 9;
  } else {
    return Math.min(35, Math.ceil(length / 150));
  }
}

export async function saveMemory(userId: string, category: string, content: string) {
  console.log(`[MEMORY SAVE] Initiating memory insertion for userId: ${userId}, category: "${category}"`);
  const supabase = createAdminClient();
  const size_bytes = new TextEncoder().encode(content).length;
  console.log("[MEMORY ERROR] ? [MEMORY SAVE] Checking size...", size_bytes);
  
  // Check limit based on 99 slot capacity
  const { used_slots } = await getMemoryUsage(userId);
  const curSlots = calculateSlotsForContent(content);
  if (used_slots + curSlots > 99) {
    console.error(`[MEMORY ERROR] Memory slot limit of 99 would be exceeded.`);
    throw new Error('Memory collection capacity reached (99 slots max). Please delete old memories to free up space.');
  }

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      category,
      content,
      size_bytes
    })
    .select()
    .single();

  if (error) {
    logger.logError(LogCategory.DATABASE, 'saveMemory failed', error);
    console.error(`[MEMORY ERROR] Supabase database transaction failed: ${error.message || error}`);
    throw error;
  }
  console.log(`[MEMORY SAVE] Saved memory successfully! ID: ${data?.id}`);
  return data as Memory;
}

export async function updateMemory(memoryId: string, content: string) {
  const supabase = createAdminClient();
  const size_bytes = new TextEncoder().encode(content).length;
  console.log("[MEMORY SIZE UPDATE]", size_bytes);

  const { data, error } = await supabase
    .from('memories')
    .update({
      content,
      size_bytes,
      updated_at: new Date().toISOString()
    })
    .eq('id', memoryId)
    .select()
    .single();

  if (error) {
    logger.logError(LogCategory.DATABASE, 'updateMemory failed', error);
    throw error;
  }
  return data as Memory;
}

export async function deleteMemory(memoryId: string) {
  console.log(`[DATABASE DELETE QUERY] From table "memories" WHERE "id" = "${memoryId}"`);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .delete()
    .eq('id', memoryId)
    .select();

  if (error) {
    console.error(`[DATABASE DELETE ERROR] Query failed:`, error);
    logger.logError(LogCategory.DATABASE, 'deleteMemory failed', error);
    throw error;
  }

  const affectedCount = data?.length || 0;
  console.log(`[DATABASE DELETE SUCCESS] Rows affected: ${affectedCount}`);
  return { success: true, affectedCount, deleted: data };
}

export async function deleteAllMemories(userId: string) {
  console.log(`[DATABASE DELETE ALL QUERY] From table "memories" WHERE "user_id" = "${userId}"`);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .delete()
    .eq('user_id', userId)
    .select();

  if (error) {
    console.error(`[DATABASE DELETE ALL ERROR] Query failed:`, error);
    logger.logError(LogCategory.DATABASE, 'deleteAllMemories failed', error);
    throw error;
  }

  const affectedCount = data?.length || 0;
  console.log(`[DATABASE DELETE ALL SUCCESS] Rows affected: ${affectedCount}`);
  return { success: true, affectedCount, deleted: data };
}

export async function getMemoryUsage(userId: string) {
  console.log("[MEMORY USAGE] getMemoryUsage started");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .select('content, size_bytes')
    .eq('user_id', userId);

  if (error) {
    logger.logError(LogCategory.DATABASE, 'getMemoryUsage failed', error);
    console.error("[MEMORY ERROR] getMemoryUsage failed:", error);
    return { used_bytes: 0, count: 0, used_slots: 0, max_slots: 99 };
  }

  const memoryData = data || [];
  const totalBytes = memoryData.reduce((acc, curr) => acc + (curr.size_bytes || 0), 0);
  
  // Calculate slots from actual stored content length
  const totalSlots = memoryData.reduce((acc, curr) => {
    return acc + calculateSlotsForContent(curr.content || '');
  }, 0);
  
  console.log("[MEMORY LOAD] [MEMORY COUNT]", memoryData.length);
  console.log("[MEMORY SLOTS USED]", totalSlots);
  console.log("[MEMORY SETTINGS] Usage updated");
  
  return {
    used_bytes: totalBytes,
    used_slots: totalSlots,
    count: memoryData.length,
    max_slots: 99
  };
}
