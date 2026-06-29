import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getUserConnections, saveUserConnection, deleteUserConnection } from '@/lib/supabase/connections';

export const zoomRouter = new Hono<{
  Bindings: {
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    ZOOM_CLIENT_ID: string;
    ZOOM_CLIENT_SECRET: string;
  }
}>();

async function getAuthUser(c: any) {
  const supabaseUrl = c.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = c.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Try Authorization header first
  const authHeader = c.req.header('Authorization');
  let token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token) {
    console.log('[AUTH HEADER FOUND]');
  }

  // Fallback to cookie
  if (!token) {
    token = getCookie(c, 'sb-access-token') || null;
    if (token) {
      console.log('[SUPABASE SESSION FOUND]');
    }
  }

  if (!token) return null;

  try {
    const userClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user && !token) {
      // If we got user from cookie session
      console.log('[SUPABASE SESSION FOUND]');
    }
    return user;
  } catch (err) {
    console.error('[AUTH ERROR] getAuthUser failed:', err);
    return null;
  }
}

// 1. GET / (Canonical Zoom OAuth Initiation - mounted at /api/auth/zoom)
zoomRouter.get('/', async (c) => {
  console.log('[ZOOM AUTH START]');

  try {
    // Try Authorization header or cookie first
    let user = await getAuthUser(c);
    
    // Fallback to userId query param
    if (!user) {
      const userId = c.req.query('userId');
      if (userId) {
        console.log('[USER ID FROM QUERY]');
        user = { id: userId } as any;
      }
    }

    if (!user) {
      console.log('[ZOOM AUTH FAILED]');
      return c.json({ error: 'Unauthorized: No valid session or userId found.' }, 401);
    }

    console.log('[USER VERIFIED]');

    const clientId = c.env.ZOOM_CLIENT_ID;
    if (!clientId) {
      console.log('[ZOOM AUTH FAILED] ZOOM_CLIENT_ID is not configured');
      return c.json({ error: 'Zoom Client ID is not configured on the server.' }, 500);
    }

    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/zoom/callback`;
    
    // Construct Zoom Auth URL
    const zoomAuthUrl = new URL('https://zoom.us/oauth/authorize');
    zoomAuthUrl.searchParams.set('response_type', 'code');
    zoomAuthUrl.searchParams.set('client_id', clientId);
    zoomAuthUrl.searchParams.set('redirect_uri', redirectUri);
    zoomAuthUrl.searchParams.set('state', user.id);

    console.log('[ZOOM REDIRECT]');

    // If it's an AJAX/fetch request, return JSON. Otherwise, redirect.
    const isAjax = c.req.header('X-Requested-With') === 'XMLHttpRequest' || c.req.header('Accept')?.includes('application/json');
    
    if (isAjax) {
      return c.json({ url: zoomAuthUrl.toString() });
    } else {
      return c.redirect(zoomAuthUrl.toString());
    }
  } catch (err: any) {
    console.log('[ZOOM AUTH FAILED]');
    console.error('[ZOOM OAUTH ERROR] Failed to generate auth URL:', err);
    return c.json({ error: 'Failed to initiate Zoom authentication: ' + err.message }, 500);
  }
});

// 2. GET /status (Zoom-specific status - mounted at /api/auth/zoom/status)
zoomRouter.get('/status', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const connections = await getUserConnections(user.id);
    const zoom = connections.find(conn => conn.provider === 'zoom');
    
    if (!zoom) {
      return c.json({ connected: false });
    }

    return c.json({
      connected: true,
      accountEmail: zoom.account_email,
      connectedAt: zoom.created_at,
      expiresAt: zoom.expires_at
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. POST /disconnect (Zoom-specific disconnect - mounted at /api/auth/zoom/disconnect)
zoomRouter.post('/disconnect', async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    await deleteUserConnection(user.id, 'zoom');
    return c.json({ success: true, message: 'Zoom disconnected successfully.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. GET /callback (Handles OAuth 2.0 redirect - mounted at /api/auth/zoom/callback)
zoomRouter.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state'); // user_id

  if (!code || !state) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connection Failed</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 400px;">
          <h2 style="color: #ef4444; margin-bottom: 8px;">Connection Failed</h2>
          <p style="color: #4b5563; font-size: 14px;">Authorization code or state was missing. Please try again.</p>
          <button onclick="window.close()" style="margin-top: 16px; background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: false, error: 'Missing code or state' }, '*');
          }
        </script>
      </body>
      </html>
    `);
  }

  try {
    const clientId = c.env.ZOOM_CLIENT_ID;
    const clientSecret = c.env.ZOOM_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Zoom environment variables are not fully configured.');
    }

    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/zoom/callback`;

    // 1. Exchange auth code for access/refresh tokens
    const tokenUrl = 'https://zoom.us/oauth/token';
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Zoom Token Exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json() as any;
    const { access_token, refresh_token, expires_in } = tokenData;

    // 2. Fetch the connected Zoom user's profile to retrieve their email
    const profileRes = await fetch('https://api.zoom.us/v2/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let accountEmail = null;
    if (profileRes.ok) {
      const profileData = await profileRes.json() as any;
      accountEmail = profileData.email || null;
    } else {
      console.warn(`[ZOOM API WARNING] Failed to fetch Zoom user profile: ${await profileRes.text()}`);
    }

    // 3. Save to Supabase using service client
    await saveUserConnection(
      state, // user_id
      'zoom',
      accountEmail,
      access_token,
      refresh_token || null,
      expires_in || 3599,
      { scope: tokenData.scope || '' },
      c.env
    );

    console.log(`[ZOOM CONNECTION SUCCESS] Zoom successfully connected for user ${state} (${accountEmail})`);

    // Return HTML page to close popup and notify parent window
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connected!</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 400px;">
          <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
          <h2 style="color: #10b981; margin-bottom: 8px;">Zoom Connected!</h2>
          <p style="color: #4b5563; font-size: 14px;">Your Zoom account <strong>${accountEmail || ''}</strong> has been connected successfully to Plack AI.</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">This window will close automatically.</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: true, email: '${accountEmail || ""}' }, '*');
          }
          setTimeout(() => {
            window.close();
          }, 2500);
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[ZOOM OAUTH ERROR] OAuth Exchange Callback Failed:', err);
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Zoom Connection Failed</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f9fafb;">
        <div style="text-align: center; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 410px;">
          <h2 style="color: #ef4444; margin-bottom: 8px;">Connection Failed</h2>
          <p style="color: #4b5563; font-size: 14px;">Unable to connect your Zoom account. Please try again.</p>
          <p style="color: #ef4444; font-size: 12px; font-family: monospace; background: #fef2f2; padding: 8px; border-radius: 6px; margin-top: 12px; text-align: left; overflow-wrap: break-word;">
            Error: ${err.message || err}
          </p>
          <button onclick="window.close()" style="margin-top: 16px; background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOOM_CONNECTED', success: false, error: '${err.message || "Failed to exchange authorization token"}' }, '*');
          }
        </script>
      </body>
      </html>
    `);
  }
});
