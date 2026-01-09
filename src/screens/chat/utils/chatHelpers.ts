// src/screens/chat/utils/chatHelpers.ts
import type { RoomType, Tier } from '@/lib/chatSync/push';

export type RoomKind = 'self' | 'dm' | 'personal' | 'group' | 'open' | 'beacon' | 'business_dm';

export type MemberNick = {
  user_id: string;
  nickname: string | null;
  avatar_url?: string | null;
};

export type Kind = 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';

export const VALID_KINDS: Kind[] = ['text', 'image', 'audio', 'video', 'file', 'map', 'notice'];

export function coerceKind(v: unknown): Kind {
  return (VALID_KINDS as string[]).includes(String(v)) ? (v as Kind) : 'text';
}

export type PickedAsset = {
  uri: string;
  filename: string;
  isVideo: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
};

export function buildChatTitle(opts: {
  roomType: RoomKind | null;
  meId: string;
  members: MemberNick[];
  customTitle?: string | null;
}): string {
  const { roomType, meId, members, customTitle } = opts;

  if (customTitle && customTitle.trim()) return customTitle.trim();
  if (!roomType) return '채팅';

  switch (roomType) {
    case 'self':
      return '나와의 채팅';
    case 'dm':
    case 'personal': {
      const other = members.find((m) => m.user_id !== meId);
      return other?.nickname || '1:1 채팅';
    }
    case 'group': {
      const others = members.filter((m) => m.user_id !== meId);
      if (!others.length) return '그룹 채팅';
      const names = others.map((m) => m.nickname || '사용자');
      if (names.length <= 3) return names.join(' · ');
      return `${names[0]} 외 ${names.length - 1}명`;
    }
    case 'open':
      return '오픈채팅';
    case 'beacon':
      return '비콘 채팅';
    case 'business_dm':
      return '상담';
    default:
      return '채팅';
  }
}

export function safeJsonParse(v: unknown) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function isUriLike(v: unknown) {
  if (!v) return false;
  const t = String(v).trim();
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('file://') || t.startsWith('content://');
}

export function isProbablyJsonObjectString(v?: string | null) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (!((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) return false;
  try {
    const parsed = JSON.parse(s);
    return !!parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

export function stripReplyPrefix(s: string): { text: string; replyId: string | null } {
  const raw = String(s ?? '');
  const m = raw.match(/^\s*\[reply:([^\]]+)\]\s*/i);
  if (!m) return { text: raw, replyId: null };
  const replyId = String(m[1] ?? '').trim() || null;
  const text = raw.replace(/^\s*\[reply:[^\]]+\]\s*/i, '');
  return { text, replyId };
}

export function normalizeOneLine(s?: string | null) {
  const raw = String(s ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

export function toMillis(v: any): number | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function toTier(v: any): Tier {
  const s = String(v ?? '').trim();
  if (s === 'high' || s === 'mid' || s === 'free') return s as Tier;
  return 'free' as Tier;
}

export function toLangCodeUpper(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.toUpperCase();
}

export function normalizeTone(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return 'nature';
  return s;
}

export function toPushRoomType(kind: RoomKind | null | undefined): RoomType | undefined {
  if (!kind) return undefined;
  if (kind === 'self') return 'self';
  if (kind === 'dm' || kind === 'personal' || kind === 'business_dm') return 'direct';
  return undefined;
}

/**
 * ✅ FIX: original(JSON) 노출 방지 + "원문 텍스트"만 추출
 */
export function extractOriginalTextForDisplay(opts: { rawOriginal: string; rawContent: string; meta: any }) {
  const { rawOriginal, rawContent, meta } = opts;

  const o = String(rawOriginal ?? '').trim();
  if (!o) return '';

  // 1) 예전 데이터: original이 그냥 텍스트인 경우 그대로 사용
  if (!isProbablyJsonObjectString(o)) return o;

  // 2) original이 JSON인 경우: 가능한 텍스트 키 탐색
  const candidates = [
    meta?.text_original,
    meta?.original_text,
    meta?.originalText,
    meta?.text,
    meta?.content_original,
    meta?.contentOriginal,
    meta?.message_original,
    meta?.messageOriginal,
  ];

  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length) return v.trim();
  }

  void rawContent;
  return '';
}

/**
 * ✅ Reply 프리뷰에서 "원문/번역" 둘 다 만들어 두기 (InputBar/MessageItem 공용)
 */
export function deriveTextPairForReplyPreview(opts: {
  msg: any;
  meId: string | null;
}): { originalText: string; translatedText: string; primaryText: string; altText: string } {
  const { msg, meId } = opts;

  const isMe = String(msg?.senderId ?? '') === String(meId ?? '');
  const rawContent = typeof msg?.content === 'string' ? msg.content : '';
  const rawOriginal = typeof msg?.original === 'string' ? msg.original : '';
  const meta = safeJsonParse(rawOriginal);

  const contentTextClean = (() => {
    const c = String(rawContent ?? '').trim();
    if (!c) return '';
    if (isProbablyJsonObjectString(c)) return '';
    return c;
  })();

  const originalTextClean = extractOriginalTextForDisplay({
    rawOriginal,
    rawContent,
    meta,
  }).trim();

  const pickDisplayText = (s: string) => {
    const { text } = stripReplyPrefix(s);
    return String(text ?? '').trim();
  };

  const primaryText = (() => {
    if (isMe) {
      const t = pickDisplayText(originalTextClean);
      return t || pickDisplayText(contentTextClean);
    }
    const t = pickDisplayText(contentTextClean);
    return t || pickDisplayText(originalTextClean);
  })();

  const altText = (() => {
    if (isMe) {
      const t = pickDisplayText(contentTextClean);
      return t || pickDisplayText(originalTextClean);
    }
    const t = pickDisplayText(originalTextClean);
    return t || pickDisplayText(contentTextClean);
  })();

  const originalText = pickDisplayText(originalTextClean);
  const translatedText = pickDisplayText(contentTextClean);

  return {
    originalText: normalizeOneLine(originalText),
    translatedText: normalizeOneLine(translatedText),
    primaryText: normalizeOneLine(primaryText),
    altText: normalizeOneLine(altText),
  };
}

export function pickThumbUri(msg: any): string | null {
  const kind = String(msg?.kind ?? 'text');
  if (kind !== 'image' && kind !== 'video') return null;

  const c = String(msg?.content ?? '').trim();
  if (isUriLike(c)) return c;

  const meta = safeJsonParse(msg?.original);
  const arrCandidates: any[] = [meta?.uris, meta?.images, meta?.media, meta?.items, meta?.files].filter(Array.isArray);

  for (const arr of arrCandidates) {
    for (const it of arr) {
      if (typeof it === 'string' && isUriLike(it)) return String(it);
      if (it && typeof it === 'object') {
        if (isUriLike(it.uri)) return String(it.uri);
        if (isUriLike(it.url)) return String(it.url);
        if (isUriLike(it.thumbUri)) return String(it.thumbUri);
        if (isUriLike(it.thumbnail)) return String(it.thumbnail);
      }
    }
  }

  const candidates: any[] = [meta?.thumbUri, meta?.thumb_url, meta?.thumbnail, meta?.thumbnailUrl, meta?.uri, meta?.url];
  for (const vv of candidates) {
    if (isUriLike(vv)) return String(vv);
  }

  return null;
}

export type ReadCursor = { seq: number | null; at: number | null };

export function pickReadCursorFromRow(row: any): ReadCursor {
  const seqCand = row?.last_read_room_seq ?? row?.last_read_seq ?? row?.last_read_seq_room ?? null;
  const seq = Number(seqCand);
  const at = toMillis(row?.last_read_at ?? null);
  return {
    seq: Number.isFinite(seq) && seq > 0 ? seq : null,
    at: at != null ? at : null,
  };
}
