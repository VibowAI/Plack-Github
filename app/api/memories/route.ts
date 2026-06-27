import { getMemories, getMemoryUsage, saveMemory, updateMemory, deleteMemory, deleteAllMemories } from '@/lib/supabase/memories';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  try {
    const [memories, usage] = await Promise.all([
      getMemories(userId),
      getMemoryUsage(userId)
    ]);

    return NextResponse.json({ memories, usage });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, category, content } = await request.json();
    if (!userId || !category || !content) {
      return NextResponse.json({ error: 'userId, category, and content are required' }, { status: 400 });
    }
    const saved = await saveMemory(userId, category, content);
    return NextResponse.json({ success: true, memory: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save memory' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { memoryId, content } = await request.json();
    if (!memoryId || !content) {
      return NextResponse.json({ error: 'memoryId and content are required' }, { status: 400 });
    }
    const updated = await updateMemory(memoryId, content);
    return NextResponse.json({ success: true, memory: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update memory' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let requestParams = { memoryId: '', userId: '', all: false };
  try {
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('memoryId') || '';
    const userId = searchParams.get('userId') || '';
    const all = searchParams.get('all') === 'true';
    requestParams = { memoryId, userId, all };

    console.log(`[DELETE REQUEST] API received request parameters:`, requestParams);

    if (all) {
      if (!userId) {
        const errorMsg = 'userId is required to delete all memories';
        console.error(`[DELETE FAILED] [MEMORY ID] userId missing. Error: ${errorMsg}`);
        return NextResponse.json({ 
          success: false, 
          error: errorMsg,
          query: `DELETE FROM memories WHERE user_id = null`,
          rowsAffected: 0
        }, { status: 400 });
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

      console.log(`[DELETE RESPONSE] Response data:`, responseData);
      console.log(`[DELETE SUCCESS] Successfully deleted all memories for user. Rows affected: ${result.affectedCount}`);
      return NextResponse.json(responseData);
    }

    if (!memoryId) {
      const errorMsg = 'memoryId is required to delete a memory';
      console.error(`[DELETE FAILED] [MEMORY ID] memoryId missing. Error: ${errorMsg}`);
      return NextResponse.json({ 
        success: false, 
        error: errorMsg,
        query: `DELETE FROM memories WHERE id = null`,
        rowsAffected: 0
      }, { status: 400 });
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

    console.log(`[DELETE RESPONSE] Response data:`, responseData);
    console.log(`[DELETE SUCCESS] Successfully deleted memory. Rows affected: ${result.affectedCount}`);
    return NextResponse.json(responseData);
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
    console.log(`[DELETE RESPONSE] Failure response data:`, responseData);
    return NextResponse.json(responseData, { status: 500 });
  }
}
