import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { createClient } from "npm:@supabase/supabase-js@2";

type UploadVariant = "medium" | "thumb" | "file" | "audio" | "video";

type Req = {
  roomId: number;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  ext?: string;
  variant?: UploadVariant;
  hash?: string;
  uploadId?: string;
  fileName?: string;
};

const ACCOUNT_ID = mustEnv("R2_ACCOUNT_ID");
const BUCKET = mustEnv("R2_BUCKET");
const PUBLIC_BASE = mustEnv("R2_PUBLIC_BASE").replace(/\/+$/, "");
const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: mustEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const SUPABASE_ADMIN = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES: Record<UploadVariant, number> = {
  thumb: 2 * 1024 * 1024,
  medium: 20 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  file: 100 * 1024 * 1024,
};

const BLOCKED_FILE_EXTENSIONS = new Set([
  "apk",
  "app",
  "bat",
  "bin",
  "cmd",
  "com",
  "cpl",
  "deb",
  "dmg",
  "exe",
  "gadget",
  "jar",
  "js",
  "jse",
  "msi",
  "msp",
  "pif",
  "ps1",
  "reg",
  "rpm",
  "scr",
  "sh",
  "vb",
  "vbe",
  "vbs",
  "wsf",
]);

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function getBearer(req: Request): string {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] ?? "").trim();
}

function positiveInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeVariant(value: unknown): UploadVariant {
  const raw = String(value ?? "medium").trim().toLowerCase();
  if (raw === "thumb" || raw === "medium" || raw === "file" || raw === "audio" || raw === "video") {
    return raw;
  }
  throw new Error("unsupported variant");
}

function normalizeMime(value: unknown): string {
  const mime = String(value ?? "").trim().toLowerCase();
  if (!mime || mime.length > 120 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime)) {
    throw new Error("invalid mime");
  }
  return mime;
}

function defaultExtForMime(mime: string, fallback = "bin"): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("heif")) return "heif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("opus")) return "opus";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("zip")) return "zip";
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "docx";
  if (mime.includes("spreadsheetml") || mime.includes("excel")) return "xlsx";
  if (mime.includes("presentationml") || mime.includes("powerpoint")) return "pptx";
  if (mime.includes("plain")) return "txt";
  if (mime.includes("json")) return "json";
  if (mime.includes("csv")) return "csv";
  return fallback;
}

function normalizeExt(value: unknown, mime: string, variant: UploadVariant): string {
  const requested = String(value ?? "").trim().toLowerCase().replace(/^\./, "").replace(/[^a-z0-9]/g, "");
  const fallback = defaultExtForMime(mime, variant === "file" ? "dat" : "jpg");
  const ext = (requested || fallback).slice(0, 12) || fallback;
  if (BLOCKED_FILE_EXTENSIONS.has(ext)) {
    throw new Error("blocked file extension");
  }
  return ext;
}

function normalizeSafeToken(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 80);
  return clean || fallback;
}

function assertVariantMatchesMime(variant: UploadVariant, mime: string) {
  if ((variant === "thumb" || variant === "medium") && !mime.startsWith("image/")) {
    throw new Error("image variant requires image mime");
  }
  if (variant === "audio" && !mime.startsWith("audio/")) {
    throw new Error("audio variant requires audio mime");
  }
  if (variant === "video" && !mime.startsWith("video/")) {
    throw new Error("video variant requires video mime");
  }
  if (variant === "file") {
    if (mime.startsWith("application/x-msdownload") || mime.includes("executable")) {
      throw new Error("blocked file mime");
    }
  }
}

function assertSize(variant: UploadVariant, size: number) {
  const max = MAX_BYTES[variant];
  if (size > max) {
    throw new Error(`file too large for ${variant}`);
  }
}

async function requireUser(jwt: string): Promise<{ id: string }> {
  if (!jwt) throw new Error("missing authorization");
  const { data, error } = await SUPABASE_ADMIN.auth.getUser(jwt);
  if (error || !data.user?.id) throw new Error("invalid authorization");
  return { id: data.user.id };
}

async function assertRoomMember(roomId: number, userId: string) {
  const { data, error } = await SUPABASE_ADMIN
    .from("chat_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("active", true)
    .is("left_at", null)
    .maybeSingle();

  if (error) throw new Error(`membership check failed: ${error.message}`);
  if (!data) throw new Error("not an active room member");
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return text("ok", 200);
    if (req.method !== "POST") return text("Method Not Allowed", 405);

    const jwt = getBearer(req);
    const user = await requireUser(jwt);

    const body = (await req.json()) as Req;
    const roomId = positiveInteger(body.roomId);
    const size = positiveInteger(body.size);
    if (!roomId || !size) return json({ error: "roomId/size required" }, 400);

    await assertRoomMember(roomId, user.id);

    const variant = normalizeVariant(body.variant);
    const mime = normalizeMime(body.mime);
    assertVariantMatchesMime(variant, mime);
    assertSize(variant, size);

    const ext = normalizeExt(body.ext, mime, variant);
    const uploadId = normalizeSafeToken(body.uploadId, crypto.randomUUID());
    const safeHash = normalizeSafeToken(body.hash, crypto.randomUUID().replace(/-/g, ""));
    const objectKey = `rooms/${roomId}/${uploadId}/${safeHash}-${variant}.${ext}`;

    const putCmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ContentType: mime,
      Metadata: {
        room_id: String(roomId),
        uploader_id: user.id,
        variant,
        declared_size: String(size),
      },
    });

    const uploadUrl = await getSignedUrl(R2, putCmd, { expiresIn: 60 * 5 });
    const publicUrl = `${PUBLIC_BASE}/${objectKey}`;

    return json({
      msgId: uploadId,
      objectKey,
      uploadUrl,
      publicUrl,
      meta: {
        w: body.width ?? null,
        h: body.height ?? null,
        size,
        mime,
        variant,
        hash: safeHash,
        provider: "cloudflare",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const lower = message.toLowerCase();
    const status = lower.includes("authorization")
      ? 401
      : lower.includes("member")
        ? 403
        : lower.includes("required") || lower.includes("invalid") || lower.includes("unsupported") || lower.includes("blocked") || lower.includes("large") || lower.includes("requires")
          ? 400
          : 500;

    console.error("[upload-media] error", { status, message });
    return json({ error: message }, status);
  }
});
