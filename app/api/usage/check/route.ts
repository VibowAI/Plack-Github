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
  try {
    const { userId, actionType, model } = await req.json();

    if (!userId || !actionType) {
      return NextResponse.json({ error: "Missing required parameters: userId and actionType" }, { status: 400 });
    }

    const supabase = getAdminClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch limits configuration from user profile metadata first if available (to fulfill "Store limits in Supabase")
    let userLimits = { ...LIMITS };
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('theme_setting') // We can use metadata / custom settings fields or dynamic queries
        .eq('id', userId)
        .single();
      
      // Dynamic profile metadata lookup if user has custom limit schema
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
      // Combined limit for uploads + camera (which triggers image_upload/file_upload)
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

      // Count only relevant model category logs in last 24 hours
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
      // default handling (e.g. deep_research)
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

    // Calculate Reset Time
    let resetIn = "24h 00m";
    if (oldestLogTime) {
      const oldestDate = new Date(oldestLogTime);
      const resetTimeMs = oldestDate.getTime() + 24 * 60 * 60 * 1000;
      const diffMs = Math.max(0, resetTimeMs - Date.now());
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      resetIn = `${hours}h ${minutes}m`;
    }

    return NextResponse.json({
      allowed,
      limit,
      consumed: count,
      remaining,
      resetIn
    });
  } catch (error: any) {
    console.error("[USAGE CHECK ERROR]", error.message || error);
    return NextResponse.json({ error: "Failed to check usage remaining quota." }, { status: 500 });
  }
}
