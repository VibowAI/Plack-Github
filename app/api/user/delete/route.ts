import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    console.log(`[USER_DELETION] Starting deletion for user: ${userId}`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
       console.error("[USER_DELETION] Missing Database admin variables");
       return NextResponse.json({ error: 'Missing admin variables' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Permanently delete user-owned application data
    // Delete from usage_logs, message_feedback, message_attachments, messages, chats, profiles
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

    // 2. Remove storage files owned by the user
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

    // 3. Sign the user out immediately (handled by the client)

    // 4. Delete user from auth
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
       console.error(`[USER_DELETION] Error deleting auth user:`, deleteUserError);
       throw deleteUserError;
    }

    console.log(`[USER_DELETION] Successfully deleted user ID ${userId}`);
    return NextResponse.json({ success: true, message: 'Account and associated data deleted permanently.' });

  } catch (err: any) {
    console.error('[USER_DELETION_ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
