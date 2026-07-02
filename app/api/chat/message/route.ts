import { NextRequest, NextResponse } from 'next/server';
import { updateMessage } from '@/lib/supabase/services';

export async function PATCH(req: NextRequest) {
  try {
    const { messageId, content, metadata } = await req.json();

    if (!messageId || !content) {
      return NextResponse.json({ error: 'Message ID and content are required' }, { status: 400 });
    }

    console.log('[MESSAGE EDIT SAVE START]', { messageId });
    const startTime = Date.now();
    
    const result = await updateMessage(messageId, content, undefined, metadata);
    
    const duration = Date.now() - startTime;
    console.log('[MESSAGE EDIT SAVE SUCCESS]', { 
      messageId, 
      saveDuration: `${duration}ms`,
      rowsAffected: 1 
    });

    return NextResponse.json({ success: true, message: result });
  } catch (error: any) {
    console.error('[MESSAGE EDIT SAVE FAILED]', { 
      messageId: req.headers.get('x-message-id') || 'unknown',
      reason: error.message 
    });
    return NextResponse.json({ error: error.message || 'Failed to update message' }, { status: 500 });
  }
}
