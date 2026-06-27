import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });
  const spec = await res.json();
  console.log('Available RPCs in spec root paths:');
  const rpcs = Object.keys(spec.paths || {}).filter(p => p.startsWith('/rpc/'));
  console.log(rpcs);
  
  // Let's query information about proc via RPC or SQL if possible. But wait, since PGRST106 throws invalid schema: information_schema,
  // we can't use rpc directly for custom sql unless we have an rpc like pg_proc or query execution.
  // Wait, does rls_auto_enable exist? Let's check what functions we have in definitions.
  console.log('Definitions list:', Object.keys(spec.definitions || {}));
}

main().catch(console.error);
