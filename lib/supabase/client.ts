import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createSupabaseClient> | null = null;
let runtimeConfig: Record<string, string> | null = null;

/**
 * Fetches configuration from the backend if environment variables are missing.
 * This is critical for production deployments like Cloudflare Workers where
 * build-time injection might be unreliable.
 */
export async function fetchRuntimeConfig() {
  if (typeof window === 'undefined') return null;
  if (runtimeConfig) return runtimeConfig;

  try {
    console.log('[SUPABASE CONFIG] Fetching runtime configuration from /api/config...');
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Failed to fetch config: ${res.statusText}`);
    const data = await res.json();
    runtimeConfig = data;
    console.log('[SUPABASE CONFIG] Runtime configuration loaded successfully.');
    return runtimeConfig;
  } catch (err) {
    console.error('[SUPABASE CONFIG] Error fetching runtime configuration:', err);
    return null;
  }
}

export function createClient() {
  // Use a safe way to access process.env that works in both environments
  const envSource = (typeof window !== 'undefined' ? (window as any).process?.env : process.env) || (import.meta as any).env || {};
  
  // Merge with runtime config if available
  const env = { ...envSource, ...runtimeConfig };
  
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  if (typeof window !== 'undefined') {
    const isUrlPlaceholder = supabaseUrl === 'https://placeholder.supabase.co';
    const isKeyPlaceholder = supabaseAnonKey === 'placeholder';
    
    if (isUrlPlaceholder || isKeyPlaceholder) {
      console.warn(`[SUPABASE CLIENT] Using placeholders! URL: ${isUrlPlaceholder ? 'MISSING' : 'OK'}, Key: ${isKeyPlaceholder ? 'MISSING' : 'OK'}`);
    } else {
      console.log('[SUPABASE CLIENT] Initializing with valid credentials.');
    }
  }

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
  const envSource = (typeof window !== 'undefined' ? (window as any).process?.env : process.env) || (import.meta as any).env || {};
  const env = { ...envSource, ...runtimeConfig };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    return createClient();
  }
  
  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

