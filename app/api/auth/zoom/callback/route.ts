import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { saveUserConnection } from '@/lib/supabase/connections';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // user_id

  if (!code || !state) {
    return new NextResponse(
      `<!DOCTYPE html>
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
      </html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  try {
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Zoom environment variables are not fully configured on the server.');
    }

    const origin = new URL(req.url).origin;
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
      process.env
    );

    console.log(`[ZOOM CONNECTION SUCCESS] Zoom successfully connected for user ${state} (${accountEmail})`);

    // Return HTML page to close popup and notify parent window
    return new NextResponse(
      `<!DOCTYPE html>
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
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (err: any) {
    console.error('[ZOOM OAUTH ERROR] OAuth Exchange Callback Failed:', err);
    return new NextResponse(
      `<!DOCTYPE html>
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
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}
