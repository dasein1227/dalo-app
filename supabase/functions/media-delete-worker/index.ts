// supabase/functions/media-delete-worker/index.ts
// CO·ONN R2 media delete worker v1
//
// Required secrets:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   R2_ACCOUNT_ID or R2_ENDPOINT
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//
// Optional secrets:
//   MEDIA_DELETE_WORKER_TOKEN     if set, request must include Authorization: Bearer <token>
//
// Deploy:
//   supabase functions deploy media-delete-worker --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  DeleteObjectCommand,
  S3Client,
} from 'npm:@aws-sdk/client-s3@3.658.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const R2_ACCOUNT_ID = envFirst('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCOUNT_ID');
const R2_ENDPOINT = envFirst('R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT') ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_ACCESS_KEY_ID = envFirst('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = envFirst('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY');

const MEDIA_DELETE_WORKER_TOKEN = Deno.env.get('MEDIA_DELETE_WORKER_TOKEN') ?? '';

const DEFAULT_BATCH_LIMIT = 300;
const MAX_BATCH_LIMIT = 1000;


function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function requireEnv(name: string, value: string): void {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

function getBatchLimit(req: Request): number {
  const url = new URL(req.url);
  const raw = url.searchParams.get('limit');
  const parsed = raw ? Number(raw) : DEFAULT_BATCH_LIMIT;

  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_LIMIT;

  return Math.max(1, Math.min(Math.floor(parsed), MAX_BATCH_LIMIT));
}

function assertWorkerAuthorization(req: Request): void {
  if (!MEDIA_DELETE_WORKER_TOKEN) return;

  const header = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${MEDIA_DELETE_WORKER_TOKEN}`;

  if (header !== expected) {
    throw new WorkerHttpError(401, 'Unauthorized');
  }
}

class WorkerHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'WorkerHttpError';
    this.status = status;
  }
}

function isObjectAlreadyGone(error: unknown): boolean {
  const anyError = error as any;
  const name = String(anyError?.name ?? '');
  const code = String(anyError?.Code ?? anyError?.code ?? '');
  const statusCode = Number(anyError?.$metadata?.httpStatusCode ?? 0);

  return (
    statusCode === 404 ||
    name === 'NoSuchKey' ||
    code === 'NoSuchKey' ||
    code === 'NotFound'
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    assertWorkerAuthorization(req);

    requireEnv('SUPABASE_URL', SUPABASE_URL);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
    requireEnv('R2_ACCOUNT_ID or R2_ENDPOINT', R2_ENDPOINT);
    requireEnv('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID);
    requireEnv('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY);

    const batchLimit = getBatchLimit(req);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    const { data: jobs, error: claimError } = await supabase.rpc(
      'claim_media_delete_jobs',
      { p_limit: batchLimit },
    );

    if (claimError) {
      throw new Error(`claim_media_delete_jobs failed: ${claimError.message}`);
    }

    const rows = Array.isArray(jobs) ? jobs : [];

    let done = 0;
    let failed = 0;
    const failures: Array<{ id: string; bucket: string; object_key: string; error: string }> = [];

    for (const job of rows) {
      const id = String(job.id);
      const bucket = String(job.bucket ?? '');
      const objectKey = String(job.object_key ?? '');

      try {
        if (!bucket || !objectKey) {
          throw new Error('Invalid job: bucket/object_key is empty');
        }

        await r2.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }));

        const { error: markDoneError } = await supabase.rpc(
          'mark_media_delete_job_done',
          { p_job_id: id },
        );

        if (markDoneError) {
          throw new Error(`mark done failed: ${markDoneError.message}`);
        }

        done += 1;
      } catch (error) {
        if (isObjectAlreadyGone(error)) {
          const { error: markDoneError } = await supabase.rpc(
            'mark_media_delete_job_done',
            { p_job_id: id },
          );

          if (markDoneError) {
            failed += 1;
            failures.push({
              id,
              bucket,
              object_key: objectKey,
              error: `object gone, but mark done failed: ${markDoneError.message}`,
            });
          } else {
            done += 1;
          }

          continue;
        }

        const message = errorMessage(error);

        const { error: markFailedError } = await supabase.rpc(
          'mark_media_delete_job_failed',
          { p_job_id: id, p_error: message },
        );

        failed += 1;
        failures.push({
          id,
          bucket,
          object_key: objectKey,
          error: markFailedError
            ? `${message}; mark failed error: ${markFailedError.message}`
            : message,
        });
      }
    }

    return jsonResponse({
      ok: true,
      claimed: rows.length,
      done,
      failed,
      failures: failures.slice(0, 20),
    });
  } catch (error) {
    const status = error instanceof WorkerHttpError ? error.status : 500;

    return jsonResponse({
      ok: false,
      error: errorMessage(error),
    }, status);
  }
});
