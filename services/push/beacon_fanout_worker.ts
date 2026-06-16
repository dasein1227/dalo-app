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

const WORKER_ID =
  process.env.BEACON_FANOUT_WORKER_ID?.trim() || `beacon-fanout-worker-${process.pid}`;
const LANE_GROUP = 'beacon';
const CLAIM_BATCH_SIZE = intEnv('BEACON_FANOUT_DB_CLAIM_BATCH_SIZE', 50);
const LOOP_SLEEP_MS = intEnv('BEACON_FANOUT_LOOP_SLEEP_MS', 700);
const EMPTY_SLEEP_MS = intEnv('BEACON_FANOUT_EMPTY_SLEEP_MS', 1500);
const RECOVER_EVERY_LOOPS = intEnv('BEACON_FANOUT_RECOVER_EVERY_LOOPS', 10);
const RECOVER_LIMIT = intEnv('BEACON_FANOUT_RECOVER_LIMIT', 5000);
const WORKER_LEASE_SECONDS = intEnv('BEACON_FANOUT_WORKER_LEASE_SECONDS', 60);
const LOG_PREFIX = '[beacon-fanout-worker]';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let loopCount = 0;
let lastBacklogSig = '';

type BeaconJobClaimRow = {
  id: number;
  event_type: string;
  priority: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  dedupe_key: string;
  lane_key: string;
  metadata: Record<string, unknown>;
  fanout_filters: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

type FanoutResult = {
  job_id?: number;
  event_type?: string;
  expected_target_count?: number;
  inserted_outbox_count?: number;
};

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

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function asObject<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T = {} as T,
): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function log(event: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, JSON.stringify(data));
}

async function recoverExpiredLeases(): Promise<number> {
  const { data, error } = await supabase.rpc('notification_jobs_recover_expired_beacon_leases', {
    p_limit: RECOVER_LIMIT,
    p_now: nowIso(),
  });
  if (error) throw new Error(`recover_expired_beacon_leases failed: ${error.message}`);
  return Number(data ?? 0) || 0;
}

async function claimJobs(limit = CLAIM_BATCH_SIZE): Promise<BeaconJobClaimRow[]> {
  const { data, error } = await supabase.rpc('notification_jobs_claim_beacon_batch', {
    p_worker_id: WORKER_ID,
    p_limit: limit,
    p_lease_seconds: WORKER_LEASE_SECONDS,
    p_now: nowIso(),
  });

  if (error) throw new Error(`claim_beacon_batch failed: ${error.message}`);
  if (!Array.isArray(data)) return [];

  return data
    .map((raw: any) => {
      const id = Number(raw?.id);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        event_type: String(raw?.event_type ?? ''),
        priority: String(raw?.priority ?? ''),
        actor_user_id: typeof raw?.actor_user_id === 'string' ? raw.actor_user_id : null,
        entity_type: String(raw?.entity_type ?? ''),
        entity_id: String(raw?.entity_id ?? ''),
        dedupe_key: String(raw?.dedupe_key ?? ''),
        lane_key: String(raw?.lane_key ?? ''),
        metadata: asObject(raw?.metadata, {}),
        fanout_filters: asObject(raw?.fanout_filters, {}),
        attempt_count: Number(raw?.attempt_count ?? 0) || 0,
        max_attempts: Number(raw?.max_attempts ?? 0) || 0,
        lease_owner: typeof raw?.lease_owner === 'string' ? raw.lease_owner : null,
        lease_expires_at:
          typeof raw?.lease_expires_at === 'string' ? raw.lease_expires_at : null,
      } satisfies BeaconJobClaimRow;
    })
    .filter(Boolean) as BeaconJobClaimRow[];
}

async function markDead(jobId: number, errorCode: string, errorMessage?: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('notification_jobs_mark_beacon_dead', {
      p_job_id: jobId,
      p_worker_id: WORKER_ID,
      p_error_code: errorCode,
      p_error_message: errorMessage ?? null,
      p_now: nowIso(),
    });
    if (error) {
      log('mark_dead_rpc_error', { jobId, error: error.message, errorCode, errorMessage });
      return;
    }
    log('marked_dead', { jobId, ok: Boolean(data), errorCode, errorMessage });
  } catch (error) {
    log('mark_dead_exception', {
      jobId,
      error: errorMessageOf(error),
      errorCode,
      errorMessage,
    });
  }
}

async function runFanout(job: BeaconJobClaimRow): Promise<FanoutResult> {
  const { data, error } = await supabase.rpc('fanout_beacon_job', {
    p_job_id: job.id,
    p_worker_id: WORKER_ID,
    p_now: nowIso(),
  });

  if (error) {
    throw new Error(`fanout_beacon_job failed(${job.id}): ${error.message}`);
  }

  return asObject<FanoutResult>(data, {});
}

async function processBatch(jobs: BeaconJobClaimRow[]): Promise<{
  claimed: number;
  succeeded: number;
  failed: number;
  insertedOutbox: number;
}> {
  let succeeded = 0;
  let failed = 0;
  let insertedOutbox = 0;

  for (const job of jobs) {
    try {
      const result = await runFanout(job);
      succeeded += 1;
      insertedOutbox += Number(result.inserted_outbox_count ?? 0) || 0;
      log('job_fanout_done', {
        jobId: job.id,
        eventType: job.event_type,
        expectedTargetCount: Number(result.expected_target_count ?? 0) || 0,
        insertedOutboxCount: Number(result.inserted_outbox_count ?? 0) || 0,
      });
    } catch (error) {
      failed += 1;
      const message = errorMessageOf(error);
      log('job_fanout_error', {
        jobId: job.id,
        eventType: job.event_type,
        error: message,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      });
      await markDead(job.id, 'fanout_error', message);
    }
  }

  return {
    claimed: jobs.length,
    succeeded,
    failed,
    insertedOutbox,
  };
}

async function logBacklogIfChanged(): Promise<void> {
  const { data, error } = await supabase
    .from('notification_jobs')
    .select('status')
    .eq('lane_group', LANE_GROUP)
    .in('status', ['pending', 'processing']);

  if (error) return;

  const counts = { pending: 0, processing: 0 };
  for (const row of data ?? []) {
    const s = String((row as any).status ?? '');
    if (s === 'pending' || s === 'processing') {
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
  log('boot', {
    workerId: WORKER_ID,
    laneGroup: LANE_GROUP,
    claimBatchSize: CLAIM_BATCH_SIZE,
    workerLeaseSeconds: WORKER_LEASE_SECONDS,
  });

  while (true) {
    try {
      loopCount += 1;

      if (loopCount === 1 || loopCount % RECOVER_EVERY_LOOPS === 0) {
        const recovered = await recoverExpiredLeases();
        if (recovered > 0) {
          log('recovered_stale_leases', { recovered });
        }
        await logBacklogIfChanged();
      }

      const jobs = await claimJobs(CLAIM_BATCH_SIZE);
      if (!jobs.length) {
        await sleep(EMPTY_SLEEP_MS);
        continue;
      }

      const result = await processBatch(jobs);
      log('batch_processed', result);
      await sleep(result.claimed > 0 ? LOOP_SLEEP_MS : EMPTY_SLEEP_MS);
    } catch (error) {
      log('loop_error', { error: errorMessageOf(error) });
      await sleep(Math.max(EMPTY_SLEEP_MS, 1500));
    }
  }
}

void main();
