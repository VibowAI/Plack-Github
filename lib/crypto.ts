/**
 * Simple, robust Web Crypto encryption helper for encrypting/decrypting sensitive tokens
 * in Cloudflare Workers and standard environments.
 */

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // Ensure the secret is exactly 32 bytes (256 bits) for AES-256
  const rawKey = enc.encode(secret.padEnd(32, '0').substring(0, 32));
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(text: string, secret: string): Promise<string> {
  if (!text) return '';
  try {
    const key = await getCryptoKey(secret);
    const enc = new TextEncoder();
    const encodedText = enc.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Return base64url encoded
    return btoa(String.fromCharCode(...combined))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch (error) {
    console.error('[CRYPTO ERROR] Encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

export async function decryptText(encryptedBase64: string, secret: string): Promise<string> {
  if (!encryptedBase64) return '';
  try {
    const key = await getCryptoKey(secret);
    
    // Convert base64url back
    let base64 = encryptedBase64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    
    const binary = atob(base64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.error('[CRYPTO ERROR] Decryption failed:', error);
    throw new Error('Failed to decrypt token');
  }
}
