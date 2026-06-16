// supabase/functions/business-upload/index.ts
//
// CO·ONN business-only R2 upload presign endpoint
//
// This function is intentionally separated from chat/post uploads.
//
// Business:
//   bucket      = R2_BUSINESS_BUCKET_NAME
//   public base = R2_BUSINESS_PUBLIC_BASE_URL
//
// Do not read generic R2_BUCKET / R2_BUCKET_NAME / R2_PUBLIC_BASE_URL here.
// Those are used by other upload flows and caused bucket/public-url mismatch.
//
// Input, backward compatible:
//   { folder, ext, contentType }
//
// Expected folder examples:
//   businesses/{businessId}/photos
//   businesses/{businessId}/logos
//   businesses/{businessId}/hero
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

// Business-only secrets.
// Never fall back to R2_BUCKET / R2_BUCKET_NAME here.
const R2_BUSINESS_BUCKET_NAME = envFirst(
  'R2_BUSINESS_BUCKET_NAME',
  'R2_BUSINESS_BUCKET',
);

const R2_BUSINESS_PUBLIC_BASE_URL = trimTrailingSlash(
  envFirst(
    'R2_BUSINESS_PUBLIC_BASE_URL',
    'R2_BUSINESS_PUBLIC_BASE',
  ),
);

const R2_ENDPOINT =
  envFirst('R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT') ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

const PRESIGN_EXPIRES_SECONDS = 60 * 15;
const MAX_FOLDER_LENGTH = 180;
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

type ReqBody = {
  folder?: string;
  ext?: string;
  contentType?: string;

  // Backward-compatible aliases only for content type/ext.
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
      console.error('business-upload missing env', { missing });
      return jsonResponse(
        {
          error: 'R2 비즈니스 업로드 환경변수가 설정되지 않았습니다.',
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

    const { folder, ext, contentType } = normalized;
    const objectKey = `${folder}/${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUSINESS_BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    const publicUrl = buildPublicUrl(objectKey);

    console.log('business-upload presign success', {
      provider: 'cloudflare-r2',
      bucket: R2_BUSINESS_BUCKET_NAME,
      key: objectKey,
      contentType,
      userId: user.id,
    });

    return jsonResponse({
      provider: 'cloudflare-r2',
      uploadUrl,
      publicUrl,
      key: objectKey,
      path: objectKey,
      bucket: R2_BUSINESS_BUCKET_NAME,
      expiresIn: PRESIGN_EXPIRES_SECONDS,
      contentType,
    });
  } catch (e) {
    console.error('business-upload fatal error', e);
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
    console.warn('business-upload auth failed', {
      message: error?.message ?? 'no user',
    });
    return null;
  }

  return { id: data.user.id };
}

function normalizeUploadRequest(
  body: ReqBody,
): { folder: string; ext: string; contentType: string } | { error: string } {
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

  if (!isAllowedBusinessContentType(contentType)) {
    return { error: `허용되지 않는 contentType입니다: ${contentType}` };
  }

  const folder = resolveBusinessFolder(body);
  if (!folder) {
    return {
      error:
        '비즈니스 업로드 folder가 필요합니다. 예: businesses/{businessId}/photos',
    };
  }

  return { folder, ext, contentType };
}

function resolveBusinessFolder(body: ReqBody): string | null {
  const folderRaw = asString(body.folder);
  if (!folderRaw) return null;

  const folder = sanitizeFolder(folderRaw);
  if (!folder) return null;

  // This endpoint is business-only.
  // Reject chat/posts/rooms paths to prevent future bucket/public-url contamination.
  if (!folder.startsWith('businesses/')) {
    return null;
  }

  return folder;
}

function buildPublicUrl(key: string): string {
  const encoded = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `${R2_BUSINESS_PUBLIC_BASE_URL}/${encoded}`;
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

  if (!R2_BUSINESS_BUCKET_NAME) {
    missing.push('R2_BUSINESS_BUCKET_NAME');
  }

  if (!R2_BUSINESS_PUBLIC_BASE_URL) {
    missing.push('R2_BUSINESS_PUBLIC_BASE_URL');
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
  if (typeof value !== 'string') return null;

  const text = value.trim();
  return text ? text : null;
}

function sanitizeFolder(folder: string): string | null {
  const cleaned = folder
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9/_=-]/g, '-')
    .replace(/\/{2,}/g, '/')
    .slice(0, MAX_FOLDER_LENGTH);

  if (!cleaned || cleaned === '/') return null;

  return cleaned;
}

function sanitizeExt(ext: string): string {
  return ext
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_EXT_LENGTH);
}

function sanitizeContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function isAllowedBusinessContentType(ct: string): boolean {
  return (
    ct === 'image/jpeg' ||
    ct === 'image/jpg' ||
    ct === 'image/png' ||
    ct === 'image/webp' ||
    ct === 'image/heic' ||
    ct === 'image/heif'
  );
}

function guessExtFromContentType(ct: string): string | null {
  const s = String(ct || '').toLowerCase();

  if (!s) return null;
  if (s.includes('image/jpeg')) return 'jpg';
  if (s.includes('image/png')) return 'png';
  if (s.includes('image/webp')) return 'webp';
  if (s.includes('image/heic') || s.includes('image/heif')) return 'heic';

  return null;
}

function guessContentTypeFromExt(ext: string): string {
  const e = String(ext || '').toLowerCase();

  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'heic' || e === 'heif') return 'image/heic';

  return 'image/jpeg';
}