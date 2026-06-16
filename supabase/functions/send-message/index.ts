// supabase/functions/send-message/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Tier = "free" | "mid" | "high";

type ProfileRow = {
  user_id: string;
  user_tier: Tier | null;
  translation_tier: Tier | null;
  auto_translate_default: boolean | null;
  preferred_lang: string | null;
  view_lang: string | null;
  translation_tone_default: string | null;
  setting_lang: string | null;
};

type ChatMemberSetting = {
  user_id: string;
  auto_translate: boolean | null;
  translation_tier: Tier | null;
  send_lang_override: string | null;
  view_lang_override: string | null;
  translation_tone: string | null;
};

type RoomSecurityState = {
  id: number;
  secure_mode_enabled: boolean | null;
  current_secure_epoch: number | null;
  secure_policy: string | null;
  type: string | null;
  room_type: string | null;
};

type SendMessageBody = {
  room_id: number | string;
  sender_id: string;
  kind?: string;
  text?: string | null;
  content?: string | null;
  original?: unknown;
  source_lang?: string | null;
  client_msg_id?: string | null;
  is_notice?: boolean;
  moment_config?: unknown;
  reply_to_message_uid?: string | null;
  meta?: unknown;
  delete_at?: string | null;
  is_secure?: boolean;
  secure?: boolean;
  sender_device_id?: string | null;
  secure_sender_device_id?: string | null;
  secure_epoch?: number | string | null;
  secureEpoch?: number | string | null;
  cipher_suite?: string | null;
  ciphertext?: string | null;
  nonce?: string | null;
  aad_version?: number | string | null;
  secure_meta?: unknown;
  message_uid?: string | null;
  __auth_token?: string | null;
  [k: string]: unknown;
};

type AttachmentPayload = {
  sort_order: number;
  type: "image" | "video" | "audio" | "file";
  url: string;
  thumb_url?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  aspect?: number | null;
  duration_ms?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  provider?: string | null;
};

type RpcSendResult = {
  mode: "inserted" | "existing";
  message: Record<string, unknown>;
  attachments: Record<string, unknown>[];
};

type JsonObject = Record<string, unknown>;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const TIER_SCORE: Record<Tier, number> = { free: 0, mid: 1, high: 2 };
const MAX_TEXT_CHARS = 5000;
const MAX_CAPTION_CHARS = 5000;
const MAX_ATTACHMENTS = 10;
const LOG_PREFIX = "[send-message]";
const SEND_MESSAGE_BUILD = "secure-auth-v4.1.7-text-content-translation-only";
const LINK_PREVIEW_KICK_TIMEOUT_MS = 8_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECURE_ALLOWED_KINDS = new Set(["text", "image", "video", "audio", "file", "map"]);

const asTier = (v: unknown, fallback: Tier = "free"): Tier =>
  v === "free" || v === "mid" || v === "high" ? v : fallback;

const minTier = (a: Tier, b: Tier): Tier =>
  TIER_SCORE[a] <= TIER_SCORE[b] ? a : b;

const maxTier = (a: Tier, b: Tier): Tier =>
  TIER_SCORE[a] >= TIER_SCORE[b] ? a : b;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const asOptString = (v: unknown): string | null =>
  isNonEmptyString(v) ? String(v).trim() : null;

const isUuidString = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v.trim());

const upperLang = (v: string | null | undefined): string | null => {
  const s = asOptString(v);
  return s ? s.toUpperCase() : null;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function unauthorized(msg = "not authenticated", extra?: Record<string, unknown>) {
  return json(401, { error: msg, build: SEND_MESSAGE_BUILD, ...(extra ?? {}) });
}

function forbidden(msg = "Forbidden") {
  return json(403, { error: msg });
}

function badRequest(error: string, extra?: Record<string, unknown>) {
  return json(400, { error, ...(extra ?? {}) });
}

function log(event: string, data?: unknown) {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, safeJson(data));
}

function errorLog(event: string, data?: unknown) {
  if (data === undefined) {
    console.error(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.error(`${LOG_PREFIX} ${event}`, safeJson(data));
}

function safeJson(input: unknown): string {
  return JSON.stringify(input, (_key, value) => {
    if (typeof value === "string" && value.length > 1000) {
      return `${value.slice(0, 1000)}…`;
    }
    return value;
  });
}

function safeJsonParseMaybe(s: string): any | null {
  const t = (s ?? "").trim();
  if (!t || (!t.startsWith("{") && !t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalizeJsonbValue(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") {
    const parsed = safeJsonParseMaybe(v);
    return parsed ?? v;
  }
  return v;
}

function extractTextFromObj(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const c of [
    obj.text,
    obj.caption,
    obj.original_text,
    obj.text_original,
    obj.content,
    obj.content_original,
    obj.originalText,
    obj.textOriginal,
    obj.contentOriginal,
  ]) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function detectLangHeuristic(text: string): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;

  // Only return a source language when the script is distinctive enough.
  // Do not treat Latin letters as EN: French/Spanish/Vietnamese/German/etc.
  // also use Latin script, and that would block translation for EN viewers.
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s)) return "KO";

  // Japanese can contain Han characters, so kana must be checked before Han.
  if (/[ぁ-ゔァ-ヴー々〆〤]/.test(s)) return "JA";

  // Han without kana is treated as Chinese fallback.
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(s)) return "ZH-HANS";

  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s)) return "AR";
  if (/[\u0590-\u05FF]/.test(s)) return "HE";
  if (/[\u0400-\u04FF]/.test(s)) return "RU";
  if (/[\u0900-\u097F]/.test(s)) return "HI";
  if (/[\u0E00-\u0E7F]/.test(s)) return "TH";
  if (/[\u0370-\u03FF]/.test(s)) return "EL";

  return null;
}


function isSecureRequest(body: SendMessageBody): boolean {
  return body.is_secure === true || body.secure === true;
}

function asPositiveSmallInt(v: unknown, fallback = 1): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.trunc(n)) : fallback;
}

function normalizeOriginal(body: SendMessageBody): any {
  if (body.original && typeof body.original === "object") {
    const o: any = body.original;
    if (typeof o.text === "string") {
      const inner = safeJsonParseMaybe(o.text);
      if (inner && typeof inner === "object") return inner;
    }
    return o;
  }

  if (typeof body.original === "string") {
    const p = safeJsonParseMaybe(body.original);
    if (p && typeof p === "object") return p;
    return { text: body.original };
  }

  const candidate = (body.text ?? body.content ?? "") as any;
  if (isNonEmptyString(candidate)) {
    const parsed = safeJsonParseMaybe(candidate);
    if (parsed && typeof parsed === "object") return parsed;
    return { text: candidate };
  }

  return { text: "" };
}

function pickTextFromOriginal(original: any, fallback: string): string {
  if (typeof original === "string" && original.trim()) return original.trim();
  if (original && typeof original === "object") {
    const t = extractTextFromObj(original);
    if (t) return t;
  }
  return (fallback ?? "").trim();
}

function injectMediaUrlIntoOriginal(kind: string, original: any, maybeUrl: string): any {
  if ((kind || "text").toLowerCase() === "text" || !isNonEmptyString(maybeUrl)) {
    return original;
  }

  const o: any = original && typeof original === "object" ? { ...original } : {};
  if (isNonEmptyString(o.uri) || isNonEmptyString(o.url) || isNonEmptyString(o.fileUrl)) {
    return o;
  }

  o.uri = maybeUrl;
  o.url = maybeUrl;
  o.fileUrl = maybeUrl;
  return o;
}

function extractFirstUrl(text: string): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const m = s.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;

  try {
    const u = new URL(m[0]);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function safeUrlHost(value: string | null | undefined): string | null {
  const s = asOptString(value);
  if (!s) return null;
  try {
    return new URL(s).host || null;
  } catch {
    return null;
  }
}

function linkPreviewDebug(stage: string, data: Record<string, unknown> = {}): string {
  const parts = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n|]/g, " ").slice(0, 180)}`);
  const text = `[debug] ${stage}${parts.length ? ` | ${parts.join(" | ")}` : ""}`;
  return text.slice(0, 900);
}

async function markPreviewJobDebug(messageId: number, debugText: string): Promise<void> {
  if (!Number.isFinite(messageId) || messageId <= 0) return;

  try {
    const { error } = await supabaseAdmin
      .from("chat_link_preview_jobs")
      .update({
        last_error: debugText,
        updated_at: new Date().toISOString(),
      })
      .eq("message_id", messageId)
      .in("status", ["queued", "retryable"]);

    if (error) {
      errorLog("link_preview_debug_mark_failed", {
        messageId,
        error: error.message,
      });
    }
  } catch (error) {
    errorLog("link_preview_debug_mark_error", {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function detectPayloadKind(kind: string, originalObj: any): string {
  const k = (kind || "text").toLowerCase();
  if (k !== "text") return k;

  if (originalObj && typeof originalObj === "object") {
    if (Array.isArray(originalObj.images)) return "image";
    if (typeof originalObj.durationMs === "number") return "audio";
    if (typeof originalObj.fileUrl === "string" || typeof originalObj.filename === "string") return "file";
    if (typeof originalObj.lat === "number" && typeof originalObj.lng === "number") return "map";
    if (typeof originalObj.videoUrl === "string" || originalObj.isVideo === true) return "video";
  }

  return "text";
}

function asPosNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asNonNegNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function asPosInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function normalizeMediaDimensionsForAttachment(
  type: "image" | "video" | "audio" | "file",
  rawWidth: unknown,
  rawHeight: unknown,
  rawAspect: unknown,
): { width: number | null; height: number | null; aspect: number | null } {
  if (type !== "image" && type !== "video") {
    return { width: null, height: null, aspect: null };
  }

  const width = asPosInt(rawWidth);
  const height = asPosInt(rawHeight);
  if (width == null || height == null) return { width: null, height: null, aspect: null };

  const aspect = asPosNum(rawAspect) ?? width / height;
  return { width, height, aspect };
}

function inferProvider(url: string | null): string | null {
  const u = String(url ?? "").toLowerCase();
  if (!u) return null;
  if (u.includes(".r2.dev") || u.includes("cloudflare")) return "cloudflare";
  if (u.includes("amazonaws.com") || u.includes("s3.")) return "aws";
  return null;
}

function pickAttachmentUrl(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const c of [
    obj.url,
    obj.uri,
    obj.fileUrl,
    obj.file_url,
    obj.media_url,
    obj.videoUrl,
    obj.audioUrl,
  ]) {
    if (isNonEmptyString(c)) return String(c).trim();
  }
  return null;
}

function attachmentTypeForKind(kind: string): "image" | "video" | "audio" | "file" | null {
  const k = String(kind || "").toLowerCase();
  return k === "image" || k === "video" || k === "audio" || k === "file"
    ? (k as "image" | "video" | "audio" | "file")
    : null;
}

function buildAttachmentPayloads(kind: string, original: any, rawFallback: string): AttachmentPayload[] {
  const type = attachmentTypeForKind(kind);
  if (!type) return [];

  const out: AttachmentPayload[] = [];

  const push = (candidate: any, index: number) => {
    if (candidate == null) return;
    const obj = typeof candidate === "string" ? { url: candidate } : candidate;
    const url = pickAttachmentUrl(obj) ??
      (index === 0 && isNonEmptyString(rawFallback) ? String(rawFallback).trim() : null);

    if (!isNonEmptyString(url)) return;

    const dims = normalizeMediaDimensionsForAttachment(type, obj?.width ?? obj?.w, obj?.height ?? obj?.h, obj?.aspect);
    const durationMs = asNonNegNum(obj?.duration_ms ?? obj?.durationMs);
    const fileSize = asNonNegNum(obj?.file_size ?? obj?.fileSize ?? obj?.size);
    const thumbUrl = type === "image" || type === "video"
      ? asOptString(obj?.thumb_url ?? obj?.thumbUrl ?? obj?.thumbnail ?? obj?.thumbnailUrl)
      : null;

    out.push({
      sort_order: index,
      type,
      url: String(url).trim(),
      thumb_url: thumbUrl,
      mime: asOptString(obj?.mime ?? obj?.media_mime ?? obj?.contentType),
      width: dims.width,
      height: dims.height,
      aspect: dims.aspect,
      duration_ms: durationMs != null ? Math.trunc(durationMs) : null,
      file_name: asOptString(obj?.file_name ?? obj?.fileName ?? obj?.name ?? obj?.filename),
      file_size: fileSize != null ? Math.trunc(fileSize) : null,
      provider: asOptString(obj?.provider) ?? inferProvider(String(url).trim()),
    });
  };

  if (type === "image") {
    const images = Array.isArray(original?.images)
      ? original.images
      : Array.isArray(original?.files)
      ? original.files
      : Array.isArray(original?.media)
      ? original.media
      : null;

    if (images && images.length) {
      images.slice(0, MAX_ATTACHMENTS).forEach((it: any, idx: number) => {
        const merged = it && typeof it === "object"
          ? { ...(original && typeof original === "object" ? original : {}), ...it }
          : { ...(original && typeof original === "object" ? original : {}), url: typeof it === "string" ? it : undefined };
        push(merged, idx);
      });
    } else {
      push(original, 0);
    }
  } else {
    push(original, 0);
  }

  return out.filter((it) => isNonEmptyString(it.url)).slice(0, MAX_ATTACHMENTS);
}

function validateAttachmentPayloadsStrict(payloads: AttachmentPayload[]) {
  if (payloads.length > MAX_ATTACHMENTS) {
    throw new Error(`too many attachments (max=${MAX_ATTACHMENTS})`);
  }

  for (let i = 0; i < payloads.length; i += 1) {
    const p = payloads[i];
    if (!Number.isInteger(p.sort_order) || p.sort_order < 0) throw new Error(`invalid attachment sort_order at index ${i}`);
    if (!["image", "video", "audio", "file"].includes(p.type)) throw new Error(`invalid attachment type at index ${i}`);
    if (!isNonEmptyString(p.url)) throw new Error(`attachment url required at index ${i}`);
    if (p.width != null && (!Number.isInteger(p.width) || p.width <= 0)) throw new Error(`invalid attachment width at index ${i}`);
    if (p.height != null && (!Number.isInteger(p.height) || p.height <= 0)) throw new Error(`invalid attachment height at index ${i}`);
    if (p.aspect != null && (!Number.isFinite(p.aspect) || p.aspect <= 0)) throw new Error(`invalid attachment aspect at index ${i}`);
    if (p.duration_ms != null && (!Number.isInteger(p.duration_ms) || p.duration_ms < 0)) throw new Error(`invalid attachment duration_ms at index ${i}`);
    if (p.file_size != null && (!Number.isInteger(p.file_size) || p.file_size < 0)) throw new Error(`invalid attachment file_size at index ${i}`);
  }
}

function normalizeAttachmentPayloadsForRpc(payloads: AttachmentPayload[]): AttachmentPayload[] {
  return payloads
    .map((p, index) => {
      const sortOrder = Number.isFinite(Number(p?.sort_order)) ? Math.max(0, Math.trunc(Number(p.sort_order))) : index;
      const type = attachmentTypeForKind(p?.type ?? null);
      const url = asOptString(p?.url);
      if (!type || !url) return null;

      const dims = normalizeMediaDimensionsForAttachment(type, p?.width, p?.height, p?.aspect);
      const durationMs = asNonNegNum(p?.duration_ms);
      const fileSize = asNonNegNum(p?.file_size);

      const normalized: AttachmentPayload = {
        sort_order: sortOrder,
        type,
        url,
        thumb_url: type === "image" || type === "video" ? asOptString(p?.thumb_url) : null,
        mime: asOptString(p?.mime),
        width: dims.width,
        height: dims.height,
        aspect: dims.aspect,
        duration_ms: durationMs != null ? Math.trunc(durationMs) : null,
        file_name: asOptString(p?.file_name),
        file_size: fileSize != null ? Math.trunc(fileSize) : null,
        provider: asOptString(p?.provider) ?? inferProvider(url),
      };

      if (type === "audio" || type === "file") {
        normalized.thumb_url = null;
        normalized.width = null;
        normalized.height = null;
        normalized.aspect = null;
      }

      return normalized;
    })
    .filter((p): p is AttachmentPayload => !!p);
}

function defaultContentForKind(kind: string, original: any, fallbackText: string): string {
  const k = (kind || "text").toLowerCase();
  const caption = pickTextFromOriginal({ text: original?.caption ?? original?.text ?? "" }, "");

  if (k === "text") return pickTextFromOriginal(original, fallbackText) || "";
  if (k === "image") return caption || "[Image]";
  if (k === "audio") return caption || "[Audio]";
  if (k === "video") return caption || "[Video]";
  if (k === "file") return caption || "[File]";
  if (k === "map") return caption || "[Location]";
  if (k === "notice") return caption || "[Notice]";
  return caption || "[Message]";
}

function validateBusinessRules(kind: string, originalText: string, attachments: AttachmentPayload[]) {
  const k = (kind || "text").toLowerCase();

  if (k === "text" && !originalText.trim()) {
    throw new Error("text message requires non-empty text");
  }

  if (["image", "video", "audio", "file"].includes(k) && attachments.length === 0) {
    throw new Error(`${k} message requires at least one attachment`);
  }

  if (originalText.length > MAX_TEXT_CHARS) {
    throw new Error(`text too long (max=${MAX_TEXT_CHARS})`);
  }

  const caption = originalText.trim();
  if (k !== "text" && caption.length > MAX_CAPTION_CHARS) {
    throw new Error(`caption too long (max=${MAX_CAPTION_CHARS})`);
  }
}

const effectiveTier = (p: ProfileRow, m: ChatMemberSetting | null): Tier => {
  if (m?.auto_translate === false) return "free";
  if (m?.auto_translate == null && p.auto_translate_default === false) return "free";
  const userTier = asTier(p.user_tier ?? "free");
  const wanted = asTier(m?.translation_tier ?? p.translation_tier ?? userTier);
  return minTier(wanted, userTier);
};

const effectiveIsFree = (p: ProfileRow, m: ChatMemberSetting | null) =>
  effectiveTier(p, m) === "free";

const effectiveSendLang = (p: ProfileRow, m: ChatMemberSetting | null) =>
  upperLang(m?.send_lang_override) ?? upperLang(p.preferred_lang);

const effectiveViewLang = (p: ProfileRow, m: ChatMemberSetting | null) =>
  upperLang(m?.view_lang_override) ?? upperLang(p.view_lang);

const effectiveTone = (p: ProfileRow, m: ChatMemberSetting | null) =>
  asOptString(m?.translation_tone) ?? asOptString(p.translation_tone_default);

function buildComputed(params: {
  is_group: boolean;
  target_lang: string | null;
  should_translate: boolean;
  sender_selected_tier: Tier;
  max_generated_tier: Tier;
}) {
  return {
    is_group: params.is_group,
    target_lang: params.target_lang,
    should_translate: params.should_translate,
    sender_selected_tier: params.sender_selected_tier,
    max_generated_tier: params.max_generated_tier,
  };
}

function isInternalPushAction(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? req.headers.get("x-api-key") ?? "";
  const marker = req.headers.get("x-push-action") ?? "";
  return marker === "1" && (auth === `Bearer ${SERVICE_ROLE_KEY}` || apikey === SERVICE_ROLE_KEY);
}

function describeAuthToken(token: string, source: string, headerLen = 0, bearerSeen = false) {
  const s = String(token ?? "").trim();
  return `source=${source}:headerLen=${headerLen}:tokenLen=${s.length}:dots=${(s.match(/\./g) ?? []).length}:bearer=${bearerSeen ? "1" : "0"}:startsEy=${s.startsWith("ey") ? "1" : "0"}`;
}

function extractBearerToken(req: Request, body?: SendMessageBody): { token: string | null; authHeaderSeen: boolean; authHeaderShape: string } {
  const raw =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    req.headers.get("x-authorization") ??
    req.headers.get("X-Authorization") ??
    "";

  const header = String(raw || "").trim();
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    const token = (m ? m[1] : header).trim();
    const authHeaderShape = describeAuthToken(token, "header", header.length, !!m);
    if (token && token.toLowerCase() !== "undefined" && token.toLowerCase() !== "null") {
      return { token, authHeaderSeen: true, authHeaderShape };
    }
    return { token: null, authHeaderSeen: true, authHeaderShape };
  }

  const xSupabaseAuth = String(req.headers.get("x-supabase-auth") ?? req.headers.get("X-Supabase-Auth") ?? "").trim();
  if (xSupabaseAuth) {
    const shape = describeAuthToken(xSupabaseAuth, "x-supabase-auth");
    return { token: xSupabaseAuth, authHeaderSeen: true, authHeaderShape: shape };
  }

  const bodyToken = typeof body?.__auth_token === "string" ? body.__auth_token.trim() : "";
  if (bodyToken) {
    const shape = describeAuthToken(bodyToken, "body_fallback");
    return { token: bodyToken, authHeaderSeen: false, authHeaderShape: shape };
  }

  return { token: null, authHeaderSeen: false, authHeaderShape: "missing" };
}

async function verifyAuthToken(token: string, authHeaderShape: string): Promise<{ userId: string | null; reason: string | null }> {
  const adminResult = await supabaseAdmin.auth.getUser(token);
  if (!adminResult.error && adminResult.data?.user?.id) {
    return { userId: adminResult.data.user.id, reason: null };
  }

  // Fallback: verify with an anon client carrying the user's JWT in the Authorization header.
  // This is useful on Edge runtimes/projects where admin.auth.getUser(token) is stricter than the gateway's JWT validation.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const userResult = await userClient.auth.getUser();
  if (!userResult.error && userResult.data?.user?.id) {
    return { userId: userResult.data.user.id, reason: null };
  }

  console.warn(`${LOG_PREFIX}[auth_get_user_failed]`, {
    build: SEND_MESSAGE_BUILD,
    authHeaderShape,
    adminCode: (adminResult.error as any)?.code ?? null,
    adminName: (adminResult.error as any)?.name ?? null,
    adminMessage: (adminResult.error as any)?.message ?? null,
    adminStatus: (adminResult.error as any)?.status ?? null,
    anonCode: (userResult.error as any)?.code ?? null,
    anonName: (userResult.error as any)?.name ?? null,
    anonMessage: (userResult.error as any)?.message ?? null,
    anonStatus: (userResult.error as any)?.status ?? null,
  });
  return { userId: null, reason: "auth_get_user_failed" };
}

type RequesterContext = {
  requesterId: string | null;
  internal: boolean;
  authReason?: string | null;
  rpcClient: ReturnType<typeof createClient> | null;
};

function createUserRpcClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
}

async function resolveRequester(req: Request, body: SendMessageBody): Promise<RequesterContext> {
  if (isInternalPushAction(req)) {
    const senderId = asOptString(body.sender_id);
    return { requesterId: senderId, internal: true, authReason: null, rpcClient: null };
  }

  const { token, authHeaderSeen, authHeaderShape } = extractBearerToken(req, body);
  if (!token) {
    console.warn(LOG_PREFIX + "[auth_missing]", {
      build: SEND_MESSAGE_BUILD,
      authHeaderSeen,
      authHeaderShape,
      hasApikey: !!(req.headers.get("apikey") ?? req.headers.get("x-api-key")),
      hasBodyFallback: typeof body?.__auth_token === "string" && body.__auth_token.trim().length > 0,
    });
    return { requesterId: null, internal: false, authReason: "auth_token_missing", rpcClient: null };
  }

  const verified = await verifyAuthToken(token, authHeaderShape);
  if (!verified.userId) {
    return { requesterId: null, internal: false, authReason: verified.reason ?? "auth_get_user_failed", rpcClient: null };
  }

  return {
    requesterId: verified.userId,
    internal: false,
    authReason: null,
    rpcClient: createUserRpcClient(token),
  };
}


async function getProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id,user_tier,translation_tier,auto_translate_default,preferred_lang,view_lang,translation_tone_default,setting_lang")
    .eq("user_id", userId)
    .single();

  if (error) throw new Error(`profiles fetch failed(${userId}): ${error.message}`);
  return data as ProfileRow;
}

async function getChatMemberSetting(roomId: number, userId: string): Promise<ChatMemberSetting | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_members")
    .select("user_id, auto_translate, translation_tier, send_lang_override, view_lang_override, translation_tone")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && (error as any)?.code !== "PGRST116") {
    throw new Error(`chat_members error: ${error.message}`);
  }
  return (data ?? null) as ChatMemberSetting | null;
}

async function getRoomMemberIds(roomId: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("chat_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("active", true)
    .is("left_at", null);

  if (error) throw new Error(`member list failed: ${error.message}`);
  return (data ?? []).map((r: any) => r.user_id).filter((x: any) => typeof x === "string");
}

async function getRoomSecurityState(roomId: number): Promise<RoomSecurityState | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_rooms")
    .select("id, secure_mode_enabled, current_secure_epoch, secure_policy, type, room_type")
    .eq("id", roomId)
    .maybeSingle();

  if (error && (error as any)?.code !== "PGRST116") {
    throw new Error(`chat_rooms security state failed: ${error.message}`);
  }

  return (data ?? null) as RoomSecurityState | null;
}

function findPlaintextSecureLeak(body: SendMessageBody): string | null {
  if (isNonEmptyString(body.text)) return "plaintext text is not allowed for secure messages";
  if (isNonEmptyString(body.content)) return "plaintext content is not allowed for secure messages";
  if ((body as any).original != null) return "plaintext original payload is not allowed for secure messages";

  const lpUrl = asOptString((body as any).link_preview_url ?? (body as any).linkPreviewUrl);
  if (lpUrl) return "plaintext link_preview_url is not allowed for secure messages";

  if ((body as any).link_preview_status != null || (body as any).linkPreviewStatus != null) {
    return "plaintext link_preview_status is not allowed for secure messages";
  }

  const rawAttachments = (body as any).attachments ?? (body as any).files ?? (body as any).media ?? null;
  if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
    return "plaintext attachments are not allowed for secure messages";
  }
  if (rawAttachments && !Array.isArray(rawAttachments)) {
    return "plaintext attachments are not allowed for secure messages";
  }

  return null;
}

async function broadcast(roomId: number, event: string, payload: any): Promise<void> {
  await fetch(BROADCAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomId}`, event, payload }],
    }),
  }).catch((e) => {
    errorLog("broadcast_failed", {
      roomId,
      event,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

async function refreshLastMessageSummary(roomId: number): Promise<void> {
  const { error: roomError } = await supabaseAdmin.rpc("refresh_chat_rooms_last_msg", {
    p_room_ids: [roomId],
  });
  if (roomError) {
    errorLog("refresh_chat_rooms_last_msg_failed", { roomId, error: roomError.message });
  }

  const { error: memberError } = await supabaseAdmin.rpc("refresh_chat_members_last_msg", {
    p_room_id: roomId,
  });
  if (memberError) {
    errorLog("refresh_chat_members_last_msg_failed", { roomId, error: memberError.message });
  }
}

async function enqueueTranslateJob(args: {
  inserted: any;
  roomId: number;
  senderId: string;
  originalText: string;
  targetLang: string;
  tier: Tier;
  tone: string | null;
  sourceLang: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("chat_translate_jobs").upsert(
    {
      message_id: Number(args.inserted.id),
      message_uid: String(args.inserted.message_uid),
      room_id: args.roomId,
      sender_id: args.senderId,
      target_lang: args.targetLang,
      tier: args.tier,
      tone: args.tone,
      source_lang: args.sourceLang,
      source_text: args.originalText,
      status: "queued",
      scheduled_at: new Date().toISOString(),
    },
    {
      onConflict: "message_id,target_lang",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`enqueue translate job failed: ${error.message}`);
  }
}

async function enqueuePreviewJob(args: {
  inserted: any;
  roomId: number;
  sourceUrl: string;
}): Promise<void> {
  const sourceUrl = asOptString(args.sourceUrl);
  if (!sourceUrl) return;

  const messageId = Number(args.inserted.id);
  const scheduledAt = new Date().toISOString();

  const { error } = await supabaseAdmin.from("chat_link_preview_jobs").upsert(
    {
      message_id: messageId,
      room_id: args.roomId,
      source_url: sourceUrl,
      status: "queued",
      scheduled_at: scheduledAt,
      lease_owner: null,
      locked_at: null,
      lease_expires_at: null,
      last_error: linkPreviewDebug("enqueued", {
        messageId,
        roomId: args.roomId,
        sourceHost: safeUrlHost(sourceUrl),
      }),
      updated_at: scheduledAt,
    },
    {
      onConflict: "message_id",
      ignoreDuplicates: false,
    },
  );

  if (error) {
    errorLog("link_preview_job_enqueue_failed", {
      messageId,
      roomId: args.roomId,
      sourceHost: safeUrlHost(sourceUrl),
      error: error.message,
    });
    throw new Error(`enqueue preview job failed: ${error.message}`);
  }

  log("link_preview_job_enqueued", {
    messageId,
    roomId: args.roomId,
    sourceHost: safeUrlHost(sourceUrl),
    scheduledAt,
  });

  await kickLinkPreviewWorker({
    messageId,
    roomId: args.roomId,
    sourceUrl,
    reason: "send-message-enqueued",
  });
}

async function kickLinkPreviewWorker(args: {
  messageId: number;
  roomId: number;
  sourceUrl: string;
  reason: string;
}): Promise<void> {
  const workerUrl = `${SUPABASE_URL}/functions/v1/link-preview-worker`;
  const workerSecret = Deno.env.get("LINK_PREVIEW_WORKER_SECRET") || "";
  const functionsKey = workerSecret || SERVICE_ROLE_KEY;
  const startedAt = Date.now();

  log("link_preview_worker_kick_start", {
    messageId: args.messageId,
    roomId: args.roomId,
    reason: args.reason,
    workerUrl,
    sourceHost: safeUrlHost(args.sourceUrl),
    hasWorkerSecret: Boolean(workerSecret),
    hasServiceRole: Boolean(SERVICE_ROLE_KEY),
    timeoutMs: LINK_PREVIEW_KICK_TIMEOUT_MS,
  });

  await markPreviewJobDebug(args.messageId, linkPreviewDebug("kick_start", {
    roomId: args.roomId,
    reason: args.reason,
    workerHost: safeUrlHost(workerUrl),
    sourceHost: safeUrlHost(args.sourceUrl),
    hasWorkerSecret: Boolean(workerSecret),
    hasServiceRole: Boolean(SERVICE_ROLE_KEY),
    timeoutMs: LINK_PREVIEW_KICK_TIMEOUT_MS,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_PREVIEW_KICK_TIMEOUT_MS);

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "apikey": SERVICE_ROLE_KEY,
        "x-functions-key": functionsKey,
      },
      body: JSON.stringify({
        source: "send-message",
        reason: args.reason,
        message_id: args.messageId,
        room_id: args.roomId,
        source_url: args.sourceUrl,
      }),
      signal: controller.signal,
    });

    const body = await res.text().catch(() => "");
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      errorLog("link_preview_worker_kick_failed", {
        status: res.status,
        body: body.slice(0, 500),
        durationMs,
        messageId: args.messageId,
        roomId: args.roomId,
      });
      await markPreviewJobDebug(args.messageId, linkPreviewDebug("kick_failed", {
        status: res.status,
        durationMs,
        body: body.slice(0, 240),
      }));
      return;
    }

    log("link_preview_worker_kick_response", {
      messageId: args.messageId,
      roomId: args.roomId,
      status: res.status,
      durationMs,
      body: body.slice(0, 500),
    });
    await markPreviewJobDebug(args.messageId, linkPreviewDebug("kick_response", {
      status: res.status,
      durationMs,
      body: body.slice(0, 240),
    }));
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    errorLog("link_preview_worker_kick_error", {
      name: errorName,
      error: errorMessage,
      durationMs,
      messageId: args.messageId,
      roomId: args.roomId,
    });
    await markPreviewJobDebug(args.messageId, linkPreviewDebug("kick_error", {
      name: errorName,
      error: errorMessage,
      durationMs,
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function runBackgroundTasks(params: {
  inserted: any;
  roomId: number;
  senderId: string;
  originalText: string;
  shouldTranslate: boolean;
  targetLang: string | null;
  maxGeneratedTier: Tier;
  tone: string | null;
  sourceLang: string | null;
}) {
  const tasks: Array<Promise<void>> = [];

  if (params.shouldTranslate && params.targetLang) {
    tasks.push(
      enqueueTranslateJob({
        inserted: params.inserted,
        roomId: params.roomId,
        senderId: params.senderId,
        originalText: params.originalText,
        targetLang: upperLang(params.targetLang)!,
        tier: params.maxGeneratedTier,
        tone: params.maxGeneratedTier === "high" ? params.tone : null,
        sourceLang: params.sourceLang,
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      errorLog("background_task_failed", {
        index,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        messageId: params.inserted?.id ?? null,
        roomId: params.roomId,
      });
    }
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = (await req.json()) as SendMessageBody;
    const { requesterId, internal, authReason, rpcClient } = await resolveRequester(req, body);
    if (!requesterId) return unauthorized("not authenticated", { reason: authReason ?? "auth_failed" });

    // Message RPCs must run with the caller JWT because the SQL functions use auth.uid().
    // Calling them through service-role/admin makes auth.uid() null and causes SQL 28000.
    const callerRpc = rpcClient ?? supabaseAdmin;

    const room_id = Number(body.room_id);
    const sender_id = String(body.sender_id ?? "").trim();

    if (!Number.isFinite(room_id) || room_id <= 0 || !sender_id) {
      return badRequest("Invalid inputs");
    }

    if (requesterId !== sender_id) {
      return forbidden("sender mismatch");
    }

    const client_msg_id = isNonEmptyString(body.client_msg_id) ? body.client_msg_id : null;
    const is_notice = Boolean(body.is_notice ?? false);
    const moment_config = normalizeJsonbValue(body.moment_config);
    const meta = normalizeJsonbValue(body.meta);
    const secureRequested = isSecureRequest(body);

    const replyCandidate =
      (body as any).reply_to_message_uid ??
      (body as any).replyToMessageUid ??
      (body as any).reply_to_message_id ??
      (body as any).replyToMessageId ??
      null;
    const reply_to_message_uid =
      typeof replyCandidate === "string" &&
      UUID_RE.test(replyCandidate)
        ? replyCandidate
        : null;

    const [roomSecurity, memberIds] = await Promise.all([
      getRoomSecurityState(room_id),
      getRoomMemberIds(room_id),
    ]);

    if (!roomSecurity) {
      return badRequest("room not found", { stage: "validation", room_id });
    }

    const securePolicy = String(roomSecurity.secure_policy ?? "mixed").trim().toLowerCase();
    const secureCapability = roomSecurity.secure_mode_enabled === true && Number(roomSecurity.current_secure_epoch ?? 0) > 0;

    if (!secureRequested && securePolicy === "required") {
      return json(409, {
        error: "secure mode is required for this room",
        stage: "validation",
        secure_required: true,
        room_id,
      });
    }

    const otherIds = memberIds.filter((id) => id !== sender_id);
    const roomKind = String(roomSecurity.room_type ?? roomSecurity.type ?? "").trim().toLowerCase();
    const is_group = roomKind === "group" || roomKind === "open" || roomKind === "beacon" || otherIds.length > 1;

    if (secureRequested) {
      if (!secureCapability) {
        return badRequest("secure mode is not enabled for this room", {
          stage: "validation",
          secure: true,
          room_id,
        });
      }

      const secureKind = isNonEmptyString(body.kind) ? String(body.kind).trim().toLowerCase() : "text";
      if (!SECURE_ALLOWED_KINDS.has(secureKind)) {
        return badRequest("secure v1 supports only text/image/video/audio/file/map kinds", {
          stage: "validation",
          kind: secureKind,
        });
      }

      const leakError = findPlaintextSecureLeak(body);
      if (leakError) {
        return badRequest(leakError, { stage: "validation", secure: true, kind: secureKind });
      }

      const sender_device_id = asOptString((body as any).sender_device_id ?? (body as any).secure_sender_device_id ?? (body as any).device_id);
      const secure_epoch_raw = (body as any).secure_epoch ?? (body as any).secureEpoch;
      const secure_epoch = asPositiveSmallInt(secure_epoch_raw, 0);
      const message_uid = asOptString((body as any).message_uid ?? (body as any).secure_message_uid ?? (body as any).messageUid);
      const cipher_suite = asOptString((body as any).cipher_suite) ?? "x25519+hkdf-sha256+chacha20poly1305";
      const ciphertext = asOptString((body as any).ciphertext);
      const nonce = asOptString((body as any).nonce);
      const aad_version = asPositiveSmallInt((body as any).aad_version ?? 1, 1);
      const secure_meta = normalizeJsonbValue((body as any).secure_meta);

      if (!isUuidString(sender_device_id)) {
        return badRequest("invalid sender_device_id", { stage: "validation", secure: true });
      }
      if (secure_epoch <= 0) {
        return badRequest("secure_epoch is required", { stage: "validation", secure: true });
      }
      if (secure_epoch !== Number(roomSecurity.current_secure_epoch ?? 0)) {
        return json(409, {
          error: "stale secure epoch",
          stage: "validation",
          secure: true,
          room_id,
          client_secure_epoch: secure_epoch,
          server_secure_epoch: Number(roomSecurity.current_secure_epoch ?? 0),
        });
      }
      if (!isUuidString(message_uid)) {
        return badRequest("invalid message_uid", { stage: "validation", secure: true });
      }
      if (!ciphertext) {
        return badRequest("ciphertext is required", { stage: "validation", secure: true });
      }
      if (!nonce) {
        return badRequest("nonce is required", { stage: "validation", secure: true });
      }

      const { data: rpcData, error: rpcError } = await callerRpc.rpc("send_chat_secure_message_atomic", {
        p_actor_user_id: requesterId,
        p_room_id: room_id,
        p_sender_id: sender_id,
        p_message_uid: message_uid,
        p_sender_device_id: sender_device_id,
        p_secure_epoch: secure_epoch,
        p_kind: secureKind,
        p_is_notice: is_notice,
        p_client_msg_id: client_msg_id,
        p_cipher_suite: cipher_suite,
        p_ciphertext: ciphertext,
        p_nonce: nonce,
        p_aad_version: aad_version,
        p_secure_meta: secure_meta,
        p_moment_config: moment_config,
        p_reply_to_message_uid: reply_to_message_uid,
        p_delete_at: (body as any).delete_at ?? null,
        p_meta: meta,
      });

      if (rpcError) {
        errorLog("rpc_secure_error", {
          code: rpcError.code,
          message: rpcError.message,
          details: (rpcError as any)?.details ?? null,
          hint: (rpcError as any)?.hint ?? null,
          room_id,
          sender_id,
          sender_device_id,
          client_msg_id,
          internal,
        });

        if (rpcError.code === "28000") {
          return unauthorized(rpcError.message, { stage: "rpc_secure", reason: "rpc_auth_uid_missing_or_invalid" });
        }
        if (rpcError.code === "42501") return forbidden(rpcError.message);

        return json(400, {
          error: rpcError.message,
          code: rpcError.code ?? null,
          details: (rpcError as any)?.details ?? null,
          hint: (rpcError as any)?.hint ?? null,
          stage: "rpc_secure",
        });
      }

      const rpcRaw = rpcData as any;
      const rpc = Array.isArray(rpcRaw) ? (rpcRaw[0] ?? null) : rpcRaw;
      if (!rpc || !rpc.message) {
        errorLog("rpc_secure_empty_shape", { rpcRaw, room_id, sender_id, sender_device_id });
        throw new Error("secure RPC returned empty result");
      }

      const inserted = rpc.message as any;
      const insertedAttachments = Array.isArray(rpc.attachments) ? rpc.attachments : [];
      const payload = {
        ...inserted,
        attachments: insertedAttachments,
        status: "committed" as const,
        computed: {
          is_group,
          target_lang: null,
          should_translate: false,
          sender_selected_tier: null,
          max_generated_tier: null,
          is_secure: true,
        },
      };

      await broadcast(room_id, "new-message", payload);
      return json(200, { success: true, data: payload });
    }

    const kindIn = isNonEmptyString(body.kind) ? body.kind : "text";
    let original = normalizeOriginal(body);
    const kind = detectPayloadKind(kindIn, original);
    const rawTextFallback = (body.text ?? body.content ?? "") as string;
    const original_text = pickTextFromOriginal(original, rawTextFallback);

    const client_source_lang = upperLang(body.source_lang);
    const detected_source_lang = kind === "text" && isNonEmptyString(original_text)
      ? detectLangHeuristic(original_text)
      : null;
    // For text messages, only trust source language when it is detected from
    // the actual text. Client source_lang can be a stale/profile language and
    // must not block translation of Latin-script languages into EN.
    let source_lang = kind === "text" ? detected_source_lang : client_source_lang;
    if (client_source_lang && detected_source_lang && client_source_lang !== detected_source_lang) {
      log("source_lang_client_mismatch", {
        room_id,
        sender_id,
        client_source_lang,
        detected_source_lang,
      });
    }

    original = injectMediaUrlIntoOriginal(kind, original, rawTextFallback);

    const [senderProfile, senderMember] = await Promise.all([
      getProfile(sender_id),
      getChatMemberSetting(room_id, sender_id),
    ]);

    const senderEffTier = effectiveTier(senderProfile, senderMember);
    const sender_send_lang = effectiveSendLang(senderProfile, senderMember);

    let target_lang: string | null = null;
    let max_generated_tier: Tier = senderEffTier;
    let tone: string | null = null;

    if (!is_group) {
      const receiver_id = otherIds[0];
      const [receiverProfile, receiverMember] = await Promise.all([
        getProfile(receiver_id),
        getChatMemberSetting(room_id, receiver_id),
      ]);

      const receiverEffTier = effectiveTier(receiverProfile, receiverMember);
      const receiver_view_lang = effectiveViewLang(receiverProfile, receiverMember);
      max_generated_tier = maxTier(senderEffTier, receiverEffTier);
      target_lang = effectiveIsFree(receiverProfile, receiverMember)
        ? (sender_send_lang ?? receiver_view_lang ?? null)
        : (receiver_view_lang ?? null);
      tone = max_generated_tier === "high" ? (effectiveTone(receiverProfile, receiverMember) ?? null) : null;
    } else {
      // CO·ONN policy: group rooms do not run automatic server translation.
      // Group translation is swipe/manual only and must be stored locally.
      target_lang = null;
      tone = null;
      max_generated_tier = senderEffTier;
    }

    let should_translate = false;
    if (
      kind === "text" &&
      isNonEmptyString(original_text) &&
      isNonEmptyString(target_lang) &&
      max_generated_tier !== "free"
    ) {
      const tgt = upperLang(target_lang);
      // Translate when target exists unless the source language is confidently
      // known to be the same as the target. If source_lang is unknown, enqueue
      // the job and let the translation engine handle detection.
      should_translate = !!tgt && (!source_lang || source_lang !== tgt);
    }

    // Text policy:
    // - original is the source text.
    // - content is reserved for server-generated translation only.
    // - send-message only enqueues translation; the translate worker fills content/translated_text later.
    // Therefore, do not store the source text in content for text messages.
    const content_to_store = kind === "text" ? null : defaultContentForKind(kind, original, original_text);
    const previewSourceUrl = kind === "text" ? extractFirstUrl(original_text || "") : null;

    const attachmentPayloadsRaw = buildAttachmentPayloads(kind, original, rawTextFallback);
    const attachmentPayloads = normalizeAttachmentPayloadsForRpc(attachmentPayloadsRaw);

    try {
      validateAttachmentPayloadsStrict(attachmentPayloads);
      validateBusinessRules(kind, original_text, attachmentPayloads);
    } catch (e: any) {
      errorLog("attachment_or_business_validation_failed", {
        error: String(e?.message ?? e),
        kind,
        room_id,
        sender_id,
      });
      return badRequest(String(e?.message ?? e), { stage: "validation", kind });
    }

    const computed = buildComputed({
      is_group,
      target_lang,
      should_translate,
      sender_selected_tier: senderEffTier,
      max_generated_tier,
    });

    const { data: rpcData, error: rpcError } = await callerRpc.rpc("send_chat_message_atomic", {
      p_actor_user_id: requesterId,
      p_room_id: room_id,
      p_sender_id: sender_id,
      p_kind: kind,
      p_is_notice: is_notice,
      p_client_msg_id: client_msg_id,
      p_moment_config: moment_config,
      p_original: original,
      p_content: content_to_store,
      p_source_lang: source_lang,
      p_sender_selected_tier: senderEffTier,
      p_max_generated_tier: max_generated_tier,
      p_reply_to_message_uid: reply_to_message_uid,
      p_delete_at: (body as any).delete_at ?? null,
      p_meta: meta,
      p_link_preview_url: previewSourceUrl || null,
      p_link_preview_status: previewSourceUrl ? "pending" : null,
      p_attachments: attachmentPayloads,
    });

    if (rpcError) {
      errorLog("rpc_error", {
        code: rpcError.code,
        message: rpcError.message,
        details: (rpcError as any)?.details ?? null,
        hint: (rpcError as any)?.hint ?? null,
        room_id,
        sender_id,
        client_msg_id,
        internal,
      });

      if (rpcError.code === "28000") {
        return unauthorized(rpcError.message, { stage: "rpc", reason: "rpc_auth_uid_missing_or_invalid" });
      }
      if (rpcError.code === "42501") return forbidden(rpcError.message);

      return json(400, {
        error: rpcError.message,
        code: rpcError.code ?? null,
        details: (rpcError as any)?.details ?? null,
        hint: (rpcError as any)?.hint ?? null,
        stage: "rpc",
      });
    }

    const rpcRaw = rpcData as any;
    const rpc = Array.isArray(rpcRaw) ? (rpcRaw[0] ?? null) : rpcRaw;
    if (!rpc || !rpc.message) {
      errorLog("rpc_empty_shape", { rpcRaw });
      throw new Error("RPC returned empty result");
    }

    const inserted = rpc.message as any;
    const insertedAttachments = Array.isArray(rpc.attachments) ? rpc.attachments : [];
    const payload = {
      ...inserted,
      attachments: insertedAttachments,
      status: "committed" as const,
      computed,
    };

    if (rpc.mode !== "existing") {
      await refreshLastMessageSummary(room_id);
      if (previewSourceUrl) {
        try {
          await enqueuePreviewJob({
            inserted,
            roomId: room_id,
            sourceUrl: previewSourceUrl,
          });
        } catch (e) {
          errorLog("link_preview_inline_task_failed", {
            error: e instanceof Error ? e.message : String(e),
            messageId: inserted?.id ?? null,
            roomId: room_id,
            sourceHost: safeUrlHost(previewSourceUrl),
          });
        }
      }

      const background = runBackgroundTasks({
        inserted,
        roomId: room_id,
        senderId: sender_id,
        originalText: original_text,
        shouldTranslate: should_translate,
        targetLang: target_lang,
        maxGeneratedTier: max_generated_tier,
        tone,
        sourceLang: source_lang,
      });

      const ER: any = (globalThis as any).EdgeRuntime;
      if (ER && typeof ER.waitUntil === "function") {
        ER.waitUntil(background);
      } else {
        background.catch((e) => {
          errorLog("background_unhandled", {
            error: e instanceof Error ? e.message : String(e),
            messageId: inserted?.id ?? null,
          });
        });
      }
    }

    await broadcast(room_id, "new-message", payload);

    return json(200, { success: true, data: payload });
  } catch (e: any) {
    errorLog("fatal", { error: String(e?.message ?? e) });
    return json(500, { error: String(e?.message ?? e) });
  }
});
