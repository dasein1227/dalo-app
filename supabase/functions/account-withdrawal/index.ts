import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'missing_env' });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: 'unauthorized' });

    const body = await req.json().catch(() => ({}));
    const reasonCode = cleanText(body.reason_code, 80);
    const reasonText = cleanText(body.reason_text, 500);
    const locale = cleanText(body.locale, 32);
    const appVersion = cleanText(body.app_version, 80);
    const platform = cleanText(body.platform, 32);

    if (!reasonCode) return json(400, { error: 'missing_reason' });

    const { data: adminUserData } = await adminClient.auth.admin.getUserById(authData.user.id);
    const adminUser = adminUserData?.user ?? authData.user;
    const email = typeof adminUser.email === 'string' ? adminUser.email.trim().toLowerCase() : '';
    const emailHash = email ? await sha256(`email:${email}`) : null;
    const identities = Array.isArray((adminUser as any).identities) ? (adminUser as any).identities : [];
    const providerLocks: Array<{ provider: string; subject_hash: string; email_hash: string | null }> = [];

    for (const identity of identities) {
      const provider = typeof identity?.provider === 'string' && identity.provider.trim()
        ? identity.provider.trim().toLowerCase()
        : 'unknown';
      const subject = String(identity?.id ?? identity?.identity_id ?? identity?.user_id ?? '').trim();
      if (!subject) continue;
      providerLocks.push({
        provider,
        subject_hash: await sha256(`${provider}:${subject}`),
        email_hash: emailHash,
      });
    }

    if (!providerLocks.length && emailHash) {
      providerLocks.push({
        provider: 'email',
        subject_hash: emailHash,
        email_hash: emailHash,
      });
    }

    const { data: requestId, error: rpcError } = await adminClient.rpc('request_account_withdrawal_v1', {
      p_user_id: authData.user.id,
      p_reason_code: reasonCode,
      p_reason_text: reasonText,
      p_locale: locale,
      p_app_version: appVersion,
      p_platform: platform,
      p_provider_locks: providerLocks,
    });

    if (rpcError) return json(400, { error: rpcError.message });

    return json(200, {
      ok: true,
      request_id: requestId,
      auth_delete_after_days: 7,
      identifier_lock_days: 30,
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'unknown_error' });
  }
});
