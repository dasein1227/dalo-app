// src/utils/chat/normalizeMessage.ts
// -----------------------------------------------------------------------------
// KakaoTalk/LINE-grade media normalization
// - Single source for UI media: msg.media_url (server/backfill) -> local DB column
// - Fallback: parse msg.original (supports escaped/double-stringified JSON)
// - Never depend on content being a URL (content can be "[Image]")
// -----------------------------------------------------------------------------

export type UIRenderMessage = {
  id: string;
  roomId: number;
  senderId: string;
  message_uid?: string | null;
  messageUid?: string | null;

  content: string | null;
  original: string | null;
  kind: string;

  createdAt: number;
  isMine: boolean;

  link_preview?: string | null;
  link_preview_url?: string | null;
  link_preview_status?: string | null;

  // media (single-path)
  fileType?: string | null;
  fileUrl?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaAspect?: number | null;
};

function coerceToMs(v: any): number {
  if (v == null) return 1;

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 1;
    return v < 1_000_000_000_000 ? Math.floor(v * 1000) : Math.floor(v);
  }

  const s = String(v).trim();
  if (!s) return 1;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 1;
    return n < 1_000_000_000_000 ? Math.floor(n * 1000) : Math.floor(n);
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t);

  return 1;
}

function toStrOrNull(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.length ? v : null;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  const s = String(v);
  return s.length ? s : null;
}

function isHttpUrl(s?: string | null) {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}
function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = s.trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}
function isUrlLike(s?: string | null) {
  return isHttpUrl(s) || isLocalUri(s);
}

function extKindFromUrl(url: string): { kind: string; fileType: string } | null {
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(lower)) return { kind: 'image', fileType: 'image' };
  if (/\.(mp4|mov|avi|mkv|webm)$/i.test(lower)) return { kind: 'video', fileType: 'video' };
  if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(lower)) return { kind: 'audio', fileType: 'audio' };
  if (/\.(pdf|zip|doc|docx|ppt|pptx|xls|xlsx)$/i.test(lower)) return { kind: 'file', fileType: 'file' };
  return null;
}

function safeJsonParseDeep(v: any, maxDepth = 2): any | null {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;

  let cur: any = v;
  for (let i = 0; i < maxDepth; i++) {
    if (typeof cur !== 'string') break;
    const t = cur.trim();
    if (!t) return null;

    // only parse if it looks like JSON or quoted JSON
    const looksJson =
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']')) ||
      (t.startsWith('"') && t.endsWith('"'));
    if (!looksJson) return null;

    try {
      cur = JSON.parse(t);
      // keep unwrapping if it's still a stringified JSON
      continue;
    } catch {
      return null;
    }
  }

  return typeof cur === 'object' ? cur : null;
}

function pickUrlFromMeta(meta: any): string | null {
  if (!meta || typeof meta !== 'object') return null;

  const images = (meta as any).images;
  if (Array.isArray(images) && images.length) {
    const first = images[0];
    const u = typeof first === 'string' ? first : first?.uri ?? first?.url ?? first?.fileUrl ?? null;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }

  const candidates = [
    (meta as any).fileUrl,
    (meta as any).url,
    (meta as any).uri,
    (meta as any).path,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  return null;
}

function clampAspect(a: number): number {
  // 카톡/라인급: extreme aspect prevents layout jitter
  if (!Number.isFinite(a) || a <= 0) return 1;
  return Math.max(0.5, Math.min(2.0, a));
}

export function normalizeMessage(m: any, myId: string): UIRenderMessage {
  const id = String(m?.id ?? '');
  const roomId = Number(m?.room_id ?? m?.roomId ?? 0);
  const senderId = String(m?.sender_id ?? m?.senderId ?? '');

  const rawContent = toStrOrNull(m?.content ?? null);
  const rawOriginal = toStrOrNull(m?.original ?? null);
  const messageUid = toStrOrNull(m?.message_uid ?? m?.messageUid ?? m?._raw?.message_uid ?? null);

  // declared kind from DB
  let kind: string = String(m?.kind ?? m?.type ?? 'text').toLowerCase();

  // ✅ 1) media_* 컬럼(서버/백필) 우선
  const mediaUrlRaw = toStrOrNull(m?.media_url ?? m?.mediaUrl ?? m?._raw?.media_url ?? null);
  const mediaUrl = mediaUrlRaw && isUrlLike(mediaUrlRaw) ? mediaUrlRaw.trim() : null;

  const mw = m?.media_width ?? m?.mediaWidth ?? m?._raw?.media_width;
  const mh = m?.media_height ?? m?.mediaHeight ?? m?._raw?.media_height;
  const ma = m?.media_aspect ?? m?.mediaAspect ?? m?._raw?.media_aspect;

  const mediaWidth = mw == null ? null : (Number.isFinite(Number(mw)) ? Math.trunc(Number(mw)) : null);
  const mediaHeight = mh == null ? null : (Number.isFinite(Number(mh)) ? Math.trunc(Number(mh)) : null);
  const mediaAspect = ma == null ? null : (Number.isFinite(Number(ma)) ? clampAspect(Number(ma)) : null);

  let fileUrl: string | null = mediaUrl;
  let fileType: string | null = null;

  if (fileUrl) {
    const ek = extKindFromUrl(fileUrl);
    if (ek) {
      kind = kind === 'text' ? ek.kind : kind;
      fileType = ek.fileType;
    } else {
      fileType = kind;
    }
  }

  // ✅ 2) fallback: original 파싱
  if (!fileUrl) {
    const meta = safeJsonParseDeep(rawOriginal) ?? safeJsonParseDeep(rawContent);
    const metaUrl = pickUrlFromMeta(meta);
    if (metaUrl && isUrlLike(metaUrl)) {
      fileUrl = metaUrl.trim();
      const ek = extKindFromUrl(fileUrl);
      if (ek) {
        kind = kind === 'text' ? ek.kind : kind;
        fileType = ek.fileType;
      } else {
        fileType = kind;
      }
    }
  }

  const createdAt = coerceToMs(m?.created_at ?? m?.createdAt ?? m?.created_at_ms ?? m?.created_at_epoch ?? null);

  return {
    id,
    roomId,
    senderId,
    message_uid: messageUid,
    messageUid,

    // content는 “텍스트 렌더 / 리스트 프리뷰” 용도로만 유지 (미디어 렌더는 fileUrl 단일 경로)
    content: rawContent,
    original: rawOriginal,

    kind,
    createdAt,

    isMine: senderId === String(myId),

    link_preview: toStrOrNull(m?.link_preview ?? m?.linkPreview ?? null),
    link_preview_url: toStrOrNull(m?.link_preview_url ?? m?.linkPreviewUrl ?? null),
    link_preview_status: toStrOrNull(m?.link_preview_status ?? m?.linkPreviewStatus ?? null),

    fileType,
    fileUrl,
    mediaWidth,
    mediaHeight,
    mediaAspect,
  };
}
