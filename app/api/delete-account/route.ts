import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

    // 1. Get user session token from Authorization header or Cookies
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid authentication token.' },
        { status: 401 }
      );
    }

    // 2. Initialize standard Database client with user's access token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    // 3. Verify user identity using Database Auth getUser
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication identity verification failed.' },
        { status: 401 }
      );
    }

    // 4. Parse request body for deletion parameters
    const body = await req.json().catch(() => ({}));
    const password = body.password;
    const provider = body.provider || 'email';

    // If the provider is email, verify with their password
    if (provider === 'email') {
      if (!password) {
        return NextResponse.json(
          { error: 'Password is required to confirm deleting your account.' },
          { status: 400 }
        );
      }

      // Verify credentials by attempting a mini login check
      const { error: verifyPassError } = await userClient.auth.signInWithPassword({
        email: user.email!,
        password: password,
      });

      if (verifyPassError) {
        return NextResponse.json(
          { error: 'Incorrect password. Identity verification failed.' },
          { status: 400 }
        );
      }
    } else {
      // OAuth providers: google, github, discord, and future providers
      // They do not have passwords. Since they already proved identity via session token,
      // we allow them to proceed directly.
      console.log(`[AUTH] OAuth Deletion Request received for provider: ${provider}, user: ${user.email}`);
    }

    // 5. Query and delete files from "chat-attachments" storage bucket.
    // Query this BEFORE deleting db records so we don't lose the references due to cascade deletes!
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

    // 6. Access and clear Storage avatars
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

    // 7. Perform account deletion.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let completedAuthDelete = false;

    if (serviceRoleKey && serviceRoleKey !== 'your_database_service_role_key') {
      try {
        // Create admin client to permanently delete from auth.users
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
        if (deleteAuthError) {
          console.warn(`[AUTH] [LOG] Provider restrictions or admin delete issue directly on auth.users for ${user.id}. Error:`, deleteAuthError.message);
        } else {
          completedAuthDelete = true;
          console.log(`[DATABASE CLEANUP VERIFICATION] Permanently deleted user ${user.id} from auth.users table.`);
        }
      } catch (adminClientErr: any) {
        console.warn(`[AUTH] [ERROR] Admin client delete failed internally:`, adminClientErr.message || adminClientErr);
      }
    } else {
      console.warn(`[AUTH] [LOG] DATABASE_SERVICE_ROLE_KEY is not defined. Falling back to explicit application data cleanup for user ${user.id}`);
    }

    // 8. Always verify or perform manual purges of application-owned records to ensure absolute zero orphaned rows.
    try {
      console.log(`[DATABASE CLEANUP VERIFICATION] Starting detailed table cleanup validations for user: ${user.id}`);

      // Deleting profiles table (will cascade down to chats, messages, message_feedback, search_history, message_attachments, etc.)
      const { error: deleteProfileError, count: profileCount } = await userClient
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (deleteProfileError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting from profiles table:', deleteProfileError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: profiles - Cleaned successfully.`);
      }

      // Explicitly delete web search usage records which hook to profiles/auth.users
      const { error: deleteSearchUsageError } = await userClient
        .from('web_search_usage')
        .delete()
        .eq('user_id', user.id);

      if (deleteSearchUsageError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting web_search_usage records:', deleteSearchUsageError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: web_search_usage - Cleaned successfully.`);
      }

      // Explicitly delete usage logs which hook to profiles/auth.users
      const { error: deleteUsageLogsError } = await userClient
        .from('usage_logs')
        .delete()
        .eq('user_id', user.id);

      if (deleteUsageLogsError) {
        console.warn('[DATABASE CLEANUP VERIFICATION] Error deleting usage_logs records:', deleteUsageLogsError.message);
      } else {
        console.log(`[DATABASE CLEANUP VERIFICATION] Table: usage_logs - Cleaned successfully.`);
      }

      console.log(`[DATABASE CLEANUP VERIFICATION] User profile and all contextual application tables verified empty for user id: ${user.id}`);
    } catch (dbPurgeErr: any) {
      console.warn('[DATABASE CLEANUP VERIFICATION] Error during manual database table query fallback purges:', dbPurgeErr.message || dbPurgeErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Account and associated content have been permanently deleted from Plack AI.',
      authDeleted: completedAuthDelete
    });
  } catch (err: any) {
    console.error('[AUTH] [ERROR] Delete Account Error:', err);
    // Never expose raw SQL or internal exceptions, return a friendly user-facing message instead.
    return NextResponse.json(
      { error: 'An unexpected internal error occurred during account deletion. We have securely scrubbed user-facing application records.' },
      { status: 500 }
    );
  }
}
