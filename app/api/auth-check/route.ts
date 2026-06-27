import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === 'your_supabase_service_role_key') {
      // Graceful fallback if service role key is not configured yet
      return NextResponse.json({ exists: false, fallback: true });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let user = null;
    try {
      const { data, error: listError } = await adminClient.auth.admin.listUsers();
      if (!listError && data?.users) {
        user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      }
    } catch (e) {
      console.warn('[AUTH] listUsers fallback search error:', e);
    }

    if (!user) {
      return NextResponse.json({ exists: false });
    }

    const providers = user.app_metadata?.providers || [];
    const identities = user.identities || [];
    const hasGoogle = providers.includes('google') || identities.some((id: any) => id.provider === 'google');
    const hasEmail = providers.includes('email') || identities.some((id: any) => id.provider === 'email');

    return NextResponse.json({
      exists: true,
      providers: {
        google: hasGoogle,
        email: hasEmail,
      }
    });
  } catch (err: any) {
    console.error('[AUTH] [ERROR] Error checking auth provider:', err);
    return NextResponse.json({ error: 'Failed to verify account' }, { status: 500 });
  }
}
