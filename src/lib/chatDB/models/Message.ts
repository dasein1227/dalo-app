// src/lib/chatDB/models/Message.ts
import { Model } from "@nozbe/watermelondb";
import { field, text, writer } from "@nozbe/watermelondb/decorators";
// Parse Postgres timestamptz strings reliably on JS engines (Hermes included).
// Supports:
// - ISO: 2026-03-02T03:24:37.544Z / +00:00
// - Postgres text: 2026-03-02 03:24:37.544+00
function parsePgTimestamptzMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;

  const s0 = v.trim();
  if (!s0) return null;

  // Fast path: ISO usually parses fine.
  const ms0 = Date.parse(s0);
  if (Number.isFinite(ms0)) return ms0;

  // Normalize "YYYY-MM-DD HH:MM:SS(.mmm)?+00" -> ISO-ish
  let s = s0.replace(" ", "T");
  // +00  -> +00:00
  s = s.replace(
    /([+-]\d{2})(?!:)(\d{2})?$/,
    (_m, hh, mm) => `${hh}:${mm ?? "00"}`,
  );
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

export type LinkPreviewStatus = "none" | "pending" | "ready" | "error";

const SECURE_LOCKED_CONTENT = "🔐 암호화된 메시지";

function forceSecurePlaintextScrub(m: any) {
  if (!m?.is_secure) return;
  m.content = SECURE_LOCKED_CONTENT;
  m.original = null;
  m.translated_text = null;
  m.translated_by_tier = null;
  m.link_preview = null;
  m.link_preview_url = null;
  m.link_preview_status = "none";
  m.media_url = null;
  m.media_width = null;
  m.media_height = null;
  m.media_aspect = null;
  m.media_mime = null;
  m.media_provider = null;
}

function normalizeReplyRef(payload: any): string | null {
  const v =
    payload?.reply_to_message_uid ??
    payload?.replyToMessageUid ??
    payload?.reply_to_message_id ??
    payload?.replyToMessageId ??
    payload?.reply_to ??
    payload?.replyTo ??
    null;
  return v == null ? null : String(v);
}

export default class Message extends Model {
  static table = "messages";

  @field("room_id") room_id!: number;
  @text("sender_id") sender_id!: string;
  @text("message_uid") message_uid!: string | null;

  // per-room monotonic sequence (nullable for legacy rows)
  @field("room_seq") room_seq!: number | null;

  @text("original") original!: string | null;
  @text("content") content!: string | null;

  @text("translated_text") translated_text!: string | null;
  @text("translated_by_tier") translated_by_tier!: string | null;

  @text("kind") kind!: string;
  @field("is_notice") is_notice!: boolean;
  @field("notice_pinned_at") notice_pinned_at!: number | null;

  @field("created_at") created_at!: number;

  // unified delete timestamp (ms). null means not scheduled.
  @field("delete_at") delete_at!: number | null;
  @text("moment_config") moment_config!: string | null;
  @field("deleted_for_all_at") deleted_for_all_at!: number | null;
  @text("deleted_for_all_by") deleted_for_all_by!: string | null;
  @field("unread_count") unread_count!: number | null;

  @text("client_msg_id") client_msg_id!: string | null;

  // secure v1 (DB ciphertext + local decrypt)
  @field("is_secure") is_secure!: boolean;
  @field("secure_epoch") secure_epoch!: number | null;
  @text("secure_sender_device_id") secure_sender_device_id!: string | null;
  @text("cipher_suite") cipher_suite!: string | null;
  @text("ciphertext") ciphertext!: string | null;
  @text("nonce") nonce!: string | null;
  @field("aad_version") aad_version!: number | null;
  @text("secure_meta") secure_meta!: string | null;

  @text("link_preview") link_preview!: string | null;
  @text("link_preview_url") link_preview_url!: string | null;
  @text("link_preview_status") link_preview_status!: string | null;

  // reply/meta
  @text("meta") meta!: string | null;
  @text("metadata") metadata!: string | null;
  // NOTE: local SQLite column stays reply_to_message_id for backward compatibility.
  @text("reply_to_message_id") reply_to_message_uid!: string | null;
  @text("reply_to") reply_to!: string | null;

  // 카카오/라인급: local DB에도 media_* 정규화 컬럼 저장
  @text("media_url") media_url!: string | null;
  @field("media_width") media_width!: number | null;
  @field("media_height") media_height!: number | null;
  @field("media_aspect") media_aspect!: number | null;
  @text("media_mime") media_mime!: string | null;
  @text("media_provider") media_provider!: string | null;

  get isLocal() {
    return String(this.id).startsWith("local_");
  }

  get createdAt(): number {
    return Number(this.created_at ?? 0) || 0;
  }

  // UI/정렬에서 쓸 안전한 seq
  get roomSeq(): number {
    const n = Number(this.room_seq ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }

  @writer
  async updateFromServer(payload: {
    room_id: number | string;
    sender_id: string;
    message_uid?: string | null;
    room_seq?: number | string | null;

    original: string | null;
    content: string | null;
    translated_text?: string | null;
    translated_by_tier?: string | null;

    kind: string | null;
    is_notice: boolean | null;
    notice_pinned_at?: string | number | null;

    created_at: number | string;
    client_msg_id?: string | null;

    is_secure?: boolean | null;
    secure_epoch?: number | string | null;
    secure_sender_device_id?: string | null;
    cipher_suite?: string | null;
    ciphertext?: string | null;
    nonce?: string | null;
    aad_version?: number | string | null;
    secure_meta?: any | null;

    delete_at?: string | number | null;
    moment_config?: any | null;
    deleted_for_all_at?: string | number | null;
    deleted_for_all_by?: string | null;
    unread_count?: number | null;

    link_preview?: any | null;
    link_preview_url?: string | null;
    link_preview_status?: LinkPreviewStatus | string | null;

    // reply/meta
    meta?: any | null;
    metadata?: any | null;
    reply_to_message_uid?: string | number | null;
    replyToMessageUid?: string | number | null;
    reply_to_message_id?: string | number | null;
    replyToMessageId?: string | number | null;
    reply_to?: string | number | null;
    replyTo?: string | number | null;

    // media 정규화
    media_url?: string | null;
    media_width?: number | string | null;
    media_height?: number | string | null;
    media_aspect?: number | string | null;
    media_mime?: string | null;
    media_provider?: string | null;
  }) {
    await this.update((m: any) => {
      m.room_id = Number(payload.room_id);
      m.sender_id = payload.sender_id;
      if (payload.message_uid !== undefined)
        m.message_uid = payload.message_uid ?? null;

      if (typeof payload.created_at === "string") {
        const ms = parsePgTimestamptzMs(payload.created_at);
        m.created_at = ms != null ? ms : 0;
      } else {
        m.created_at = Number(payload.created_at ?? 0) || 0;
      }

      if (payload.room_seq != null) {
        const rs = Number(payload.room_seq);
        m.room_seq = Number.isFinite(rs) && rs > 0 ? Math.trunc(rs) : null;
      }

      if (payload.delete_at !== undefined) {
        const v: any = payload.delete_at;
        if (v == null) {
          m.delete_at = null;
        } else if (typeof v === "string") {
          const ms = parsePgTimestamptzMs(v);
          m.delete_at = ms != null ? ms : null;
        } else {
          const ms = Number(v);
          m.delete_at = Number.isFinite(ms) ? ms : null;
        }
      }
      if (payload.moment_config !== undefined) {
        m.moment_config =
          payload.moment_config == null
            ? null
            : typeof payload.moment_config === "string"
              ? payload.moment_config
              : JSON.stringify(payload.moment_config);
      }
      if (payload.deleted_for_all_at !== undefined) {
        const v: any = payload.deleted_for_all_at;
        if (v == null) m.deleted_for_all_at = null;
        else if (typeof v === "string") {
          const ms = parsePgTimestamptzMs(v);
          m.deleted_for_all_at = ms != null ? ms : null;
        } else {
          const ms = Number(v);
          m.deleted_for_all_at = Number.isFinite(ms) ? ms : null;
        }
      }
      if (payload.deleted_for_all_by !== undefined)
        m.deleted_for_all_by = payload.deleted_for_all_by ?? null;
      if (payload.unread_count !== undefined) {
        const n =
          payload.unread_count == null ? NaN : Number(payload.unread_count);
        m.unread_count = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
      }

      m.original = payload.original ?? null;
      m.content = payload.content ?? null;
      if (payload.translated_text !== undefined)
        m.translated_text = payload.translated_text ?? null;
      if (payload.translated_by_tier !== undefined)
        m.translated_by_tier = payload.translated_by_tier ?? null;

      m.kind = payload.kind ?? "text";
      m.is_notice = payload.is_notice ?? false;
      if (payload.notice_pinned_at !== undefined) {
        const ms = parsePgTimestamptzMs(payload.notice_pinned_at);
        m.notice_pinned_at = ms != null ? ms : null;
      }

      if (payload.client_msg_id !== undefined)
        m.client_msg_id = payload.client_msg_id ?? null;

      if (payload.is_secure !== undefined) m.is_secure = !!payload.is_secure;
      if (payload.secure_epoch !== undefined) {
        const n =
          payload.secure_epoch == null ? NaN : Number(payload.secure_epoch);
        m.secure_epoch = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }
      if (payload.secure_sender_device_id !== undefined)
        m.secure_sender_device_id = payload.secure_sender_device_id ?? null;
      if (payload.cipher_suite !== undefined)
        m.cipher_suite = payload.cipher_suite ?? null;
      if (payload.ciphertext !== undefined)
        m.ciphertext = payload.ciphertext ?? null;
      if (payload.nonce !== undefined) m.nonce = payload.nonce ?? null;
      if (payload.aad_version !== undefined) {
        const n =
          payload.aad_version == null ? NaN : Number(payload.aad_version);
        m.aad_version = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }
      if (payload.secure_meta !== undefined) {
        m.secure_meta =
          payload.secure_meta == null
            ? null
            : typeof payload.secure_meta === "string"
              ? payload.secure_meta
              : JSON.stringify(payload.secure_meta);
      }

      if (payload.link_preview !== undefined) {
        m.link_preview =
          payload.link_preview == null
            ? null
            : typeof payload.link_preview === "string"
              ? payload.link_preview
              : JSON.stringify(payload.link_preview);
      }
      if (payload.link_preview_url !== undefined)
        m.link_preview_url = payload.link_preview_url ?? null;
      if (payload.link_preview_status !== undefined) {
        const v = String(payload.link_preview_status ?? "").trim();
        m.link_preview_status =
          v === "pending" || v === "ready" || v === "error" ? v : "none";
      }

      // reply/meta
      if (payload.meta !== undefined) {
        m.meta =
          payload.meta == null
            ? null
            : typeof payload.meta === "string"
              ? payload.meta
              : JSON.stringify(payload.meta);
      }
      if (payload.metadata !== undefined) {
        m.metadata =
          payload.metadata == null
            ? null
            : typeof payload.metadata === "string"
              ? payload.metadata
              : JSON.stringify(payload.metadata);
      }
      const replyRef = normalizeReplyRef(payload);
      if (
        payload.reply_to_message_uid !== undefined ||
        payload.replyToMessageUid !== undefined ||
        payload.reply_to_message_id !== undefined ||
        payload.replyToMessageId !== undefined ||
        payload.reply_to !== undefined ||
        payload.replyTo !== undefined
      ) {
        m.reply_to_message_uid = replyRef;
      }
      if (payload.reply_to !== undefined || payload.replyTo !== undefined) {
        m.reply_to =
          payload.reply_to == null
            ? payload.replyTo == null
              ? null
              : String(payload.replyTo)
            : String(payload.reply_to);
      }

      // media
      if (payload.media_url !== undefined)
        m.media_url = payload.media_url ?? null;
      if (payload.media_width !== undefined) {
        const n =
          payload.media_width == null ? NaN : Number(payload.media_width);
        m.media_width = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }
      if (payload.media_height !== undefined) {
        const n =
          payload.media_height == null ? NaN : Number(payload.media_height);
        m.media_height = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }
      if (payload.media_aspect !== undefined) {
        const n =
          payload.media_aspect == null ? NaN : Number(payload.media_aspect);
        m.media_aspect = Number.isFinite(n) && n > 0 ? n : null;
      }
      if (payload.media_mime !== undefined)
        m.media_mime = payload.media_mime ?? null;
      if (payload.media_provider !== undefined)
        m.media_provider = payload.media_provider ?? null;

      forceSecurePlaintextScrub(m);
    });
  }

  // pull.ts helper
  applyRow(payload: any) {
    (this as any).room_id = Number(payload.room_id);
    (this as any).sender_id = String(payload.sender_id ?? "");
    if (payload.message_uid !== undefined)
      (this as any).message_uid = payload.message_uid ?? null;

    const rs = payload.room_seq;
    if (rs != null) {
      const n = Number(rs);
      (this as any).room_seq =
        Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }

    // delete_at merge (server may send null; preserve local soft-delete)
    if (payload.delete_at !== undefined) {
      const cur: any = (this as any).delete_at;
      const curMs = cur == null ? null : Number(cur);
      const raw: any = payload.delete_at;
      let incMs: number | null = null;
      if (raw == null) {
        incMs = null;
      } else if (typeof raw === "string") {
        const ms = parsePgTimestamptzMs(raw);
        incMs = ms != null ? ms : null;
      } else {
        const ms = Number(raw);
        incMs = Number.isFinite(ms) ? ms : null;
      }

      // If server says null, do NOT resurrect a locally deleted message.
      if (incMs == null) {
        if (curMs == null) (this as any).delete_at = null;
        // else keep existing curMs
      } else {
        if (curMs == null) (this as any).delete_at = incMs;
        else (this as any).delete_at = Math.min(curMs, incMs);
      }
    }
    if (payload.moment_config !== undefined) {
      (this as any).moment_config =
        payload.moment_config == null
          ? null
          : typeof payload.moment_config === "string"
            ? payload.moment_config
            : JSON.stringify(payload.moment_config);
    }
    if (payload.deleted_for_all_at !== undefined) {
      const raw: any = payload.deleted_for_all_at;
      let ms: number | null = null;
      if (raw == null) ms = null;
      else if (typeof raw === "string") {
        const parsed = parsePgTimestamptzMs(raw);
        ms = parsed != null ? parsed : null;
      } else {
        const n = Number(raw);
        ms = Number.isFinite(n) ? n : null;
      }
      (this as any).deleted_for_all_at = ms;
    }
    if (payload.deleted_for_all_by !== undefined)
      (this as any).deleted_for_all_by = payload.deleted_for_all_by ?? null;
    if (payload.unread_count !== undefined) {
      const n =
        payload.unread_count == null ? NaN : Number(payload.unread_count);
      (this as any).unread_count =
        Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    }

    (this as any).original = payload.original ?? null;
    (this as any).content = payload.content ?? null;
    if (payload.translated_text !== undefined)
      (this as any).translated_text = payload.translated_text ?? null;
    if (payload.translated_by_tier !== undefined)
      (this as any).translated_by_tier = payload.translated_by_tier ?? null;

    (this as any).kind = payload.kind ?? "text";
    (this as any).is_notice = payload.is_notice ?? false;
    if (payload.notice_pinned_at !== undefined) {
      const ms = parsePgTimestamptzMs(payload.notice_pinned_at);
      (this as any).notice_pinned_at = ms != null ? ms : null;
    }

    if (typeof payload.created_at === "string") {
      const ms = parsePgTimestamptzMs(payload.created_at);
      (this as any).created_at = ms != null ? ms : 0;
    } else {
      (this as any).created_at = Number(payload.created_at ?? 0) || 0;
    }

    if (payload.client_msg_id !== undefined)
      (this as any).client_msg_id = payload.client_msg_id ?? null;

    if (payload.is_secure !== undefined)
      (this as any).is_secure = !!payload.is_secure;
    if (payload.secure_epoch !== undefined) {
      const n =
        payload.secure_epoch == null ? NaN : Number(payload.secure_epoch);
      (this as any).secure_epoch =
        Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    if (payload.secure_sender_device_id !== undefined)
      (this as any).secure_sender_device_id =
        payload.secure_sender_device_id ?? null;
    if (payload.cipher_suite !== undefined)
      (this as any).cipher_suite = payload.cipher_suite ?? null;
    if (payload.ciphertext !== undefined)
      (this as any).ciphertext = payload.ciphertext ?? null;
    if (payload.nonce !== undefined)
      (this as any).nonce = payload.nonce ?? null;
    if (payload.aad_version !== undefined) {
      const n = payload.aad_version == null ? NaN : Number(payload.aad_version);
      (this as any).aad_version =
        Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    if (payload.secure_meta !== undefined) {
      (this as any).secure_meta =
        payload.secure_meta == null
          ? null
          : typeof payload.secure_meta === "string"
            ? payload.secure_meta
            : JSON.stringify(payload.secure_meta);
    }

    if (payload.link_preview !== undefined) {
      (this as any).link_preview =
        payload.link_preview == null
          ? null
          : typeof payload.link_preview === "string"
            ? payload.link_preview
            : JSON.stringify(payload.link_preview);
    }
    if (payload.link_preview_url !== undefined)
      (this as any).link_preview_url = payload.link_preview_url ?? null;
    if (payload.link_preview_status !== undefined) {
      const v = String(payload.link_preview_status ?? "").trim();
      (this as any).link_preview_status =
        v === "pending" || v === "ready" || v === "error" ? v : "none";
    }

    // reply/meta
    if (payload.meta !== undefined)
      (this as any).meta =
        payload.meta == null
          ? null
          : typeof payload.meta === "string"
            ? payload.meta
            : JSON.stringify(payload.meta);
    if (payload.metadata !== undefined)
      (this as any).metadata =
        payload.metadata == null
          ? null
          : typeof payload.metadata === "string"
            ? payload.metadata
            : JSON.stringify(payload.metadata);
    const replyRef = normalizeReplyRef(payload);
    if (
      payload.reply_to_message_uid !== undefined ||
      payload.replyToMessageUid !== undefined ||
      payload.reply_to_message_id !== undefined ||
      payload.replyToMessageId !== undefined ||
      payload.reply_to !== undefined ||
      payload.replyTo !== undefined
    ) {
      (this as any).reply_to_message_uid = replyRef;
    }
    if (payload.reply_to !== undefined || payload.replyTo !== undefined) {
      (this as any).reply_to =
        payload.reply_to == null
          ? payload.replyTo == null
            ? null
            : String(payload.replyTo)
          : String(payload.reply_to);
    }

    // media
    if (payload.media_url !== undefined)
      (this as any).media_url = payload.media_url ?? null;
    if (payload.media_width !== undefined) {
      const n = payload.media_width == null ? NaN : Number(payload.media_width);
      (this as any).media_width =
        Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    if (payload.media_height !== undefined) {
      const n =
        payload.media_height == null ? NaN : Number(payload.media_height);
      (this as any).media_height =
        Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    if (payload.media_aspect !== undefined) {
      const n =
        payload.media_aspect == null ? NaN : Number(payload.media_aspect);
      (this as any).media_aspect = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (payload.media_mime !== undefined)
      (this as any).media_mime = payload.media_mime ?? null;
    if (payload.media_provider !== undefined)
      (this as any).media_provider = payload.media_provider ?? null;

    forceSecurePlaintextScrub(this as any);
  }
}
