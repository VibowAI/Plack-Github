import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdminClient() {
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

const LIMITS: Record<string, number> = {
  chat_message_ed: 10,       // ED 1.7 chat limit
  chat_message_other: 20,    // Other models chat limit
  file_upload: 5,            // Combined upload & camera
  web_search: 2,             // 2 per day
  deep_research: 1           // 1 per day
};

export async function POST(req: NextRequest) {
  let requestData: any = {};
  try {
    requestData = await req.json();
    const { userId, actionType, model } = requestData;

    if (!userId || !actionType) {
      return NextResponse.json({ error: "Missing required parameters: userId and actionType" }, { status: 400 });
    }

    const supabase = getAdminClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch limits configuration from user profile metadata first if available
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
        return NextResponse.json({ error: "Limit reached" }, { status: 403 });
      }

      const { error: insertError } = await supabase
        .from('web_search_usage')
        .insert({ user_id: userId, search_count: 1 });

      if (insertError) throw insertError;

      const remaining = Math.max(0, limit - (count + 1));
      return NextResponse.json({ success: true, remaining });

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
        return NextResponse.json({ error: "Limit reached" }, { status: 403 });
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
      return NextResponse.json({ success: true, remaining });

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
        return NextResponse.json({ error: "Limit reached" }, { status: 403 });
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
      return NextResponse.json({ success: true, remaining });

    } else {
      // Default / deep_research / etc.
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
        return NextResponse.json({ error: "Limit reached" }, { status: 403 });
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
      return NextResponse.json({ success: true, remaining });
    }
  } catch (error: any) {
    console.warn("[USAGE NOT CHARGED]", {
      operation: requestData?.actionType || "unknown",
      reason: error.message || error
    });
    return NextResponse.json({ error: "Failed to increment/charge usage quota." }, { status: 500 });
  }
}
