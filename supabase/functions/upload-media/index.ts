import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

type Req = {
  roomId: number;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  ext?: string;
  variant?: "medium" | "thumb" | "file" | "audio" | "video";
  hash?: string;
};

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;

// ✅ Cloudflare R2 "Public URL" 그대로 (버킷명 절대 붙이지 말 것)
// 예: https://pub-6ab255ed95204d98aedd5093727677d5.r2.dev
const PUBLIC_BASE = Deno.env.get("R2_PUBLIC_BASE")!;

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = (await req.json()) as Req;
    const {
      roomId,
      mime,
      size,
      width,
      height,
      ext = "jpg",
      variant = "medium",
      hash,
    } = body;

    if (!roomId || !mime || !size) {
      return new Response("roomId/mime/size required", { status: 400 });
    }

    const msgId = crypto.randomUUID();
    const safeHash = hash ?? crypto.randomUUID().replace(/-/g, "");
    const objectKey = `rooms/${roomId}/${msgId}/${safeHash}-${variant}.${ext}`;

    // presigned PUT URL (R2 전용)
    const putCmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ContentType: mime,
    });
    const uploadUrl = await getSignedUrl(R2, putCmd, { expiresIn: 60 * 5 });

    // ✅ 클라에서 바로 사용하는 공개 URL
    //    https://pub-...r2.dev/rooms/... 형식
    const publicUrl = `${PUBLIC_BASE}/${objectKey}`;

    return new Response(
      JSON.stringify({
        msgId,
        objectKey,
        uploadUrl,
        publicUrl,
        meta: { w: width, h: height, size, mime, variant, hash: safeHash },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
