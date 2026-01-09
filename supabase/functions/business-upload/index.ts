// supabase/functions/business-upload/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? '';

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY/ANON_KEY');
}

const supabase = createClient(supabaseUrl!, serviceKey);

// ← Supabase Storage 버킷 이름 (대시보드랑 1자라도 다르면 100% 에러)
const BUCKET_NAME = 'business';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const { folder, ext, contentType } = await req.json();

    if (!folder || !ext) {
      return jsonResponse(
        { error: 'folder, ext 는 필수입니다.' },
        400,
      );
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const objectKey = `${folder}/${filename}`;
    const expiresIn = 60 * 15; // 15분 정도 여유

    console.log('business-upload request', { BUCKET_NAME, objectKey });

    // 1) 업로드용 signed URL 생성
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(objectKey);

    if (error || !data?.signedUrl) {
      console.error(
        'createSignedUploadUrl error',
        JSON.stringify(error),
      );
      return jsonResponse(
        {
          error: 'signedUrl 생성 실패',
          details: String(error),
        },
        500,
      );
    }

    // 2) public URL
    const { data: pub } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(objectKey);

    const publicUrl = pub.publicUrl;

    console.log('business-upload success', { objectKey, publicUrl });

    return jsonResponse({
      uploadUrl: data.signedUrl,
      publicUrl,
      key: objectKey,
      expiresIn,
      contentType: contentType || 'image/jpeg',
    });
  } catch (e) {
    console.error('business-upload fatal error', e);
    return jsonResponse(
      { error: 'internal error', details: String(e) },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
