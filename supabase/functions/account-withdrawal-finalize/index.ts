import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('ACCOUNT_WITHDRAWAL_CRON_SECRET');

  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: 'missing_env' });
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) return json(401, { error: 'unauthorized' });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' ? body.limit : 50;
    const { data: rows, error: listError } = await adminClient.rpc('list_due_account_auth_deletions_v1', {
      p_limit: limit,
    });

    if (listError) return json(500, { error: listError.message });

    let deleted = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      const requestId = row.request_id;
      const userId = row.user_id;
      if (!requestId || !userId) continue;

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId, true);

      if (deleteError) {
        failed += 1;
        await adminClient.rpc('mark_account_auth_delete_failed_v1', {
          p_request_id: requestId,
          p_failure_message: deleteError.message,
        });
        continue;
      }

      const { error: markError } = await adminClient.rpc('mark_account_auth_deleted_v1', {
        p_request_id: requestId,
        p_user_id: userId,
      });

      if (markError) {
        failed += 1;
        await adminClient.rpc('mark_account_auth_delete_failed_v1', {
          p_request_id: requestId,
          p_failure_message: markError.message,
        });
        continue;
      }

      deleted += 1;
    }

    return json(200, { ok: true, deleted, failed });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'unknown_error' });
  }
});
