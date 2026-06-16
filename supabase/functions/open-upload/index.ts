// supabase/functions/open-upload/index.ts
//
// CO·ONN open-profile / open-room R2 upload presign endpoint
//
// This function is intentionally separated from business, post, and chat-message uploads.
//
// Supported scopes:
//   - open_profile_avatar
//   - chat_room_cover
//
// Input:
//   open_profile_avatar:
//     { scope: "open_profile_avatar", profileId, ext, contentType }
//
//   chat_room_cover:
//     { scope: "chat_room_cover", roomId, ext, contentType }
//
// Output:
//   { uploadUrl, publicUrl, key, path, bucket, expiresIn, contentType, provider }
//
// Client must upload with plain PUT:
//   await fetch(uploadUrl, {
//     method: 'PUT',
//     headers: { 'Content-Type': contentType },
//     body: blob,
//   })

import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const R2_ACCOUNT_ID = envFirst(
  'R2_ACCOUNT_ID',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCOUNT_ID',
);

const R2_ACCESS_KEY_ID = envFirst(
  'R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
);

const R2_SECRET_ACCESS_KEY = envFirst(
  'R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
);

const R2_ENDPOINT =
  envFirst('R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT') ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

// Prefer open-specific secrets. Fall back to the generic public R2 bucket only for migration safety.
// Do not fall back to business-only bucket/public-base secrets here.
const R2_OPEN_BUCKET_NAME = envFirst(
  'R2_OPEN_BUCKET_NAME',
  'R2_OPEN_BUCKET',
  'R2_PUBLIC_BUCKET_NAME',
  'R2_PUBLIC_BUCKET',
  'R2_BUCKET_NAME',
  'R2_BUCKET',
);

const R2_OPEN_PUBLIC_BASE_URL = trimTrailingSlash(
  envFirst(
    'R2_OPEN_PUBLIC_BASE_URL',
    'R2_OPEN_PUBLIC_BASE',
    'R2_PUBLIC_BASE_URL',
    'R2_PUBLIC_BASE',
  ),
);

const PRESIGN_EXPIRES_SECONDS = 60 * 15;
const MAX_EXT_LENGTH = 12;

const serviceSupabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

type UploadScope = 'open_profile_avatar' | 'chat_room_cover';

type ReqBody = {
  scope?: string;
  profileId?: string | number | null;
  roomId?: string | number | null;
  ext?: string;
  contentType?: string;
  mime?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const missing = getMissingEnv();
    if (missing.length > 0) {
      console.error('open-upload missing env', { missing });
      return jsonResponse(
        {
          error: 'R2 오픈 업로드 환경변수가 설정되지 않았습니다.',
          missing,
        },
        500,
      );
    }

    const user = await requireUser(req);
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const normalized = normalizeUploadRequest(body);

    if ('error' in normalized) {
      return jsonResponse({ error: normalized.error }, 400);
    }

    const auth = await authorizeUpload(normalized.scope, normalized.targetId, user.id);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const objectKey = buildObjectKey(normalized.scope, normalized.targetId, normalized.ext);

    const command = new PutObjectCommand({
      Bucket: R2_OPEN_BUCKET_NAME,
      Key: objectKey,
      ContentType: normalized.contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    const publicUrl = buildPublicUrl(objectKey);

    console.log('open-upload presign success', {
      provider: 'cloudflare-r2',
      bucket: R2_OPEN_BUCKET_NAME,
      key: objectKey,
      contentType: normalized.contentType,
      scope: normalized.scope,
      targetId: normalized.targetId,
      userId: user.id,
    });

    return jsonResponse({
      provider: 'cloudflare-r2',
      uploadUrl,
      publicUrl,
      key: objectKey,
      path: objectKey,
      bucket: R2_OPEN_BUCKET_NAME,
      expiresIn: PRESIGN_EXPIRES_SECONDS,
      contentType: normalized.contentType,
    });
  } catch (e) {
    console.error('open-upload fatal error', e);
    return jsonResponse({ error: 'internal error', details: String(e) }, 500);
  }
});

async function requireUser(req: Request): Promise<{ id: string } | null> {
  if (!serviceSupabase) return null;

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!jwt) return null;

  const { data, error } = await serviceSupabase.auth.getUser(jwt);

  if (error || !data?.user?.id) {
    console.warn('open-upload auth failed', {
      message: error?.message ?? 'no user',
    });
    return null;
  }

  return { id: data.user.id };
}

function normalizeUploadRequest(
  body: ReqBody,
):
  | {
      scope: UploadScope;
      targetId: string;
      ext: string;
      contentType: string;
    }
  | { error: string } {
  const scopeRaw = asString(body.scope);

  if (scopeRaw !== 'open_profile_avatar' && scopeRaw !== 'chat_room_cover') {
    return { error: '허용되지 않는 open upload scope입니다.' };
  }

  const targetRaw =
    scopeRaw === 'open_profile_avatar'
      ? asString(body.profileId)
      : asString(body.roomId);

  const targetId = sanitizeIdSegment(targetRaw);

  if (!targetId) {
    return {
      error:
        scopeRaw === 'open_profile_avatar'
          ? 'profileId가 필요합니다.'
          : 'roomId가 필요합니다.',
    };
  }

  const rawContentType = asString(body.contentType) || asString(body.mime) || '';
  const rawExt =
    asString(body.ext)?.replace(/^\./, '') ||
    guessExtFromContentType(rawContentType) ||
    '';

  const ext = sanitizeExt(rawExt);
  const contentType = sanitizeContentType(
    rawContentType || guessContentTypeFromExt(ext),
  );

  if (!ext) return { error: 'ext 또는 contentType이 필요합니다.' };
  if (!contentType) return { error: 'contentType이 필요합니다.' };

  if (!isAllowedImageContentType(contentType)) {
    return { error: `허용되지 않는 contentType입니다: ${contentType}` };
  }

  return { scope: scopeRaw, targetId, ext, contentType };
}

async function authorizeUpload(
  scope: UploadScope,
  targetId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!serviceSupabase) {
    return { ok: false, status: 500, error: 'Supabase service client is not configured' };
  }

  if (scope === 'open_profile_avatar') {
    return authorizeOpenProfileAvatar(targetId, userId);
  }

  return authorizeChatRoomCover(targetId, userId);
}

async function authorizeOpenProfileAvatar(
  profileId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const candidates = [
    { ownerColumn: 'owner_user_id' },
    { ownerColumn: 'user_id' },
    { ownerColumn: 'profile_user_id' },
  ];

  let lastError: unknown = null;

  for (const candidate of candidates) {
    const { data, error } = await serviceSupabase!
      .from('open_profiles')
      .select(`id,${candidate.ownerColumn}`)
      .eq('id', profileId)
      .eq(candidate.ownerColumn, userId)
      .maybeSingle();

    if (!error) {
      return data?.id
        ? { ok: true }
        : { ok: false, status: 403, error: 'open profile upload is not allowed' };
    }

    lastError = error;
  }

  console.error('open-upload open profile authorization failed', {
    profileId,
    userId,
    error: lastError,
  });

  return {
    ok: false,
    status: 500,
    error: 'open profile authorization failed',
  };
}

async function authorizeChatRoomCover(
  roomId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await serviceSupabase!
    .from('chat_members')
    .select('room_id,user_id,role,left_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .in('role', ['host', 'manager'])
    .is('left_at', null)
    .maybeSingle();

  if (error) {
    console.error('open-upload room authorization failed', {
      roomId,
      userId,
      error,
    });

    return {
      ok: false,
      status: 500,
      error: 'room authorization failed',
    };
  }

  if (!data?.room_id) {
    return { ok: false, status: 403, error: 'room cover upload is not allowed' };
  }

  return { ok: true };
}

function buildObjectKey(scope: UploadScope, targetId: string, ext: string): string {
  const id = sanitizeIdSegment(targetId);
  const safeExt = sanitizeExt(ext) || 'jpg';
  const fileId = crypto.randomUUID();

  if (scope === 'open_profile_avatar') {
    return `open-profiles/${id}/avatars/${fileId}.${safeExt}`;
  }

  return `chat-rooms/${id}/covers/${fileId}.${safeExt}`;
}

function buildPublicUrl(key: string): string {
  const encoded = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `${R2_OPEN_PUBLIC_BASE_URL}/${encoded}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getMissingEnv(): string[] {
  const missing: string[] = [];

  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!R2_ACCOUNT_ID && !R2_ENDPOINT) missing.push('R2_ACCOUNT_ID or R2_ENDPOINT');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

  if (!R2_OPEN_BUCKET_NAME) {
    missing.push('R2_OPEN_BUCKET_NAME or R2_BUCKET_NAME');
  }

  if (!R2_OPEN_PUBLIC_BASE_URL) {
    missing.push('R2_OPEN_PUBLIC_BASE_URL or R2_PUBLIC_BASE_URL');
  }

  return missing;
}

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) return value.trim();
  }

  return '';
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text ? text : null;
  }

  return null;
}

function sanitizeIdSegment(value: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
}

function sanitizeExt(ext: string): string {
  const cleaned = ext
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_EXT_LENGTH);

  if (cleaned === 'jpeg') return 'jpg';
  if (cleaned === 'heif') return 'heic';

  if (['jpg', 'png', 'webp', 'heic', 'gif'].includes(cleaned)) return cleaned;
  return '';
}

function sanitizeContentType(contentType: string): string {
  const value = contentType.trim().toLowerCase();
  return value === 'image/jpg' ? 'image/jpeg' : value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function isAllowedImageContentType(ct: string): boolean {
  return (
    ct === 'image/jpeg' ||
    ct === 'image/png' ||
    ct === 'image/webp' ||
    ct === 'image/heic' ||
    ct === 'image/heif' ||
    ct === 'image/gif'
  );
}

function guessExtFromContentType(ct: string): string | null {
  const s = String(ct || '').toLowerCase();

  if (!s) return null;
  if (s.includes('image/jpeg') || s.includes('image/jpg')) return 'jpg';
  if (s.includes('image/png')) return 'png';
  if (s.includes('image/webp')) return 'webp';
  if (s.includes('image/heic') || s.includes('image/heif')) return 'heic';
  if (s.includes('image/gif')) return 'gif';

  return null;
}

function guessContentTypeFromExt(ext: string): string {
  const e = String(ext || '').toLowerCase();

  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'heic' || e === 'heif') return 'image/heic';
  if (e === 'gif') return 'image/gif';

  return 'image/jpeg';
}
