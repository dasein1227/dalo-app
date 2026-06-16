import path from 'node:path';
import dotenv from 'dotenv';

const __pushEnvCandidates = [
  path.resolve(process.cwd(), '.env.push.local'),
  path.resolve(process.cwd(), '.env.push'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
];
for (const envPath of __pushEnvCandidates) {
  dotenv.config({ path: envPath, override: false });
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = mustEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const DISPATCHER_ID = process.env.PUSH_DISPATCHER_ID?.trim() || `chat-dispatcher-${process.pid}`;
const RECOVER_LIMIT = intEnv('CHAT_DISPATCH_RECOVER_LIMIT', 5000);
const RECOVER_INTERVAL_MS = intEnv('CHAT_DISPATCH_RECOVER_INTERVAL_MS', 10000);
const LANE_GROUP = 'chat';
const LOG_PREFIX = '[push-dispatcher]';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let lastBacklogSig = '';

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, JSON.stringify(data));
}

async function recoverExpiredLeases(): Promise<number> {
  const { data, error } = await supabase.rpc('notification_outbox_recover_expired_leases', {
    p_limit: RECOVER_LIMIT,
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(`recover_expired_leases failed: ${error.message}`);
  return Number(data ?? 0) || 0;
}

async function logBacklogIfChanged(): Promise<void> {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('status')
    .eq('lane_group', LANE_GROUP)
    .in('status', ['pending', 'queued', 'processing']);

  if (error) return;

  const counts = { pending: 0, queued: 0, processing: 0 };
  for (const row of data ?? []) {
    const s = String((row as any).status ?? '');
    if (s === 'pending' || s === 'queued' || s === 'processing') {
      (counts as any)[s] += 1;
    }
  }

  const sig = JSON.stringify(counts);
  if (sig !== lastBacklogSig) {
    lastBacklogSig = sig;
    log('backlog', counts);
  }
}

async function main(): Promise<void> {
  log('boot', { dispatcherId: DISPATCHER_ID, mode: 'passive_recovery_only' });

  while (true) {
    try {
      const recovered = await recoverExpiredLeases();
      if (recovered > 0) log('recovered_stale_leases', { recovered });
      await logBacklogIfChanged();
      await sleep(RECOVER_INTERVAL_MS);
    } catch (error) {
      log('loop_error', { error: error instanceof Error ? error.message : String(error) });
      await sleep(RECOVER_INTERVAL_MS);
    }
  }
}

void main();
