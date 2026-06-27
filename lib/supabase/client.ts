import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  if (typeof window === 'undefined') {
    return createSupabaseClient(supabaseUrl, supabaseAnonKey);
  }
  
  if (!client) {
    client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return client;
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log(`[SUPABASE CLIENT] createAdminClient called. serviceRoleKey defined: ${!!serviceRoleKey}, length: ${serviceRoleKey ? serviceRoleKey.length : 0}`);
  
  if (!serviceRoleKey) {
    console.log("[SUPABASE CLIENT] Fallback to standard client since serviceRoleKey is undefined");
    return createClient();
  }
  
  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

