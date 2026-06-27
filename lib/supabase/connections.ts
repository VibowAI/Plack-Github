import { createAdminClient } from './client';
import { encryptText, decryptText } from '../crypto';

export interface ConnectionRecord {
  id: string;
  user_id: string;
  provider: string;
  account_email: string | null;
  access_token: string; // encrypted
  refresh_token: string | null; // encrypted
  expires_at: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

function getEncryptionSecret(env: any): string {
  return env.SUPABASE_SERVICE_ROLE_KEY || 'default-fallback-encryption-key-for-connections-system-secured';
}

export async function getUserConnections(userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error(`[CONNECTIONS DATABASE ERROR] Failed to fetch connections for user ${userId}:`, error);
    return [];
  }
  return data || [];
}

export async function saveUserConnection(
  userId: string,
  provider: string,
  accountEmail: string | null,
  accessToken: string,
  refreshToken: string | null,
  expiresInSeconds: number | null,
  metadata: any,
  env: any
) {
  const supabase = createAdminClient();
  const secret = getEncryptionSecret(env);
  
  const encryptedAccessToken = await encryptText(accessToken, secret);
  const encryptedRefreshToken = refreshToken ? await encryptText(refreshToken, secret) : null;
  
  const expiresAt = expiresInSeconds 
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() 
    : null;

  const { data, error } = await supabase
    .from('connections')
    .upsert({
      user_id: userId,
      provider,
      account_email: accountEmail,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      expires_at: expiresAt,
      metadata: metadata || {},
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,provider'
    })
    .select()
    .single();

  if (error) {
    console.error(`[CONNECTIONS DATABASE ERROR] Failed to save connection for user ${userId}:`, error);
    throw error;
  }
  
  return data;
}

export async function deleteUserConnection(userId: string, provider: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
    .select();

  if (error) {
    console.error(`[CONNECTIONS DATABASE ERROR] Failed to delete connection ${provider} for user ${userId}:`, error);
    throw error;
  }
  return { success: true, count: data?.length || 0 };
}

export async function getValidAccessToken(userId: string, provider: string, env: any): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: connection, error } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error || !connection) {
    return null;
  }

  const secret = getEncryptionSecret(env);
  
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  const isExpired = expiresAt ? (Date.now() + 60000) > expiresAt : false;

  if (isExpired && connection.refresh_token) {
    console.log(`[ZOOM TOKEN REFRESH] Token expired or close to expiration. Attempting refresh for user: ${userId}`);
    try {
      const decryptedRefreshToken = await decryptText(connection.refresh_token, secret);
      const refreshed = await refreshZoomToken(decryptedRefreshToken, env);
      
      if (refreshed && refreshed.access_token) {
        await saveUserConnection(
          userId,
          provider,
          connection.account_email,
          refreshed.access_token,
          refreshed.refresh_token || decryptedRefreshToken,
          refreshed.expires_in,
          connection.metadata,
          env
        );
        console.log(`[ZOOM TOKEN REFRESH] Successful for user: ${userId}`);
        return refreshed.access_token;
      }
    } catch (refreshErr) {
      console.error(`[ZOOM API ERROR] Token refresh failed for user: ${userId}`, refreshErr);
      return null;
    }
  }

  try {
    return await decryptText(connection.access_token, secret);
  } catch (decErr) {
    console.error(`[CRYPTO ERROR] Decryption of access token failed:`, decErr);
    return null;
  }
}

async function refreshZoomToken(refreshToken: string, env: any) {
  const clientId = env.ZOOM_CLIENT_ID;
  const clientSecret = env.ZOOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Zoom Client ID or Client Secret is missing in environment variables');
  }

  const tokenUrl = 'https://zoom.us/oauth/token';
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ZOOM API ERROR] Refresh Zoom Token HTTP Error: ${response.status}`, errText);
    throw new Error(`Zoom API token refresh failed: ${errText}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }>;
}
