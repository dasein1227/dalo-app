// src/lib/chatSync/push.ts
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';

export type Tier = 'free' | 'mid' | 'high';

export type MomentConfig =
  | { type: 'READ_BASED'; delay: number } // seconds
  | { type: 'TIME_BASED' }; // delete_at is sent separately (deleteAtMs)

export type ProfileLangConfig = {
  translation_tier?: Tier | null;
  view_lang?: string | null;
  preferred_lang?: string | null;
  translation_tone_default?: string | null;
};

export type RoomType = 'self' | 'direct' | 'group';

export type TranslateFn = (args: {
  text: string;
  targetLang: string;
  tier: Tier;
  tone?: string | null;
  sourceLang?: string | null;
}) => Promise<any>;

export type SendRoomMessageArgs = {
  roomId: number;
  senderId: string;

  content: string | null;
  original?: string | null;

  kind: 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';

  roomType?: RoomType;
  my?: ProfileLangConfig | null;
  peer?: ProfileLangConfig | null;

  sourceLang?: string | null;
  senderSelectedTier?: Tier | null;

  // ✅ Moment delete
  deleteAtMs?: number | null;
  momentConfig?: MomentConfig | null;

  translateFn?: TranslateFn;
};

/**
 * ✅ 디버그 로그 토글 (기본 OFF)
 * - DEV에서만 동작
 * - 필요할 때만 EXPO_PUBLIC_DEBUG_CHAT=1 설정
 */
const DEBUG_CHAT =
  __DEV__ &&
  String((process as any)?.env?.EXPO_PUBLIC_DEBUG_CHAT ?? '').trim() === '1';

function genClientMsgId(roomId: number) {
  return `c_${roomId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function tierRank(t: Tier): number {
  if (t === 'high') return 3;
  if (t === 'mid') return 2;
  return 1;
}

function maxTier(a?: Tier | null, b?: Tier | null): Tier {
  const aa = a ?? 'free';
  const bb = b ?? 'free';
  return tierRank(aa) >= tierRank(bb) ? aa : bb;
}

function safeSet(obj: any, key: string, value: any) {
  try {
    if (obj && key in obj) obj[key] = value;
  } catch {}
}

function isNonEmptyString(v: unknown) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeLangCode(v?: string | null): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;

  const lowered = s.toLowerCase();
  if (lowered === 'kr') return 'ko';
  if (lowered === 'jp') return 'ja';
  if (lowered === 'cn') return 'zh';
  return lowered;
}

function normalizeTranslatedText(v: any): string | null {
  if (typeof v === 'string') return v;

  if (v && typeof v === 'object') {
    if (typeof (v as any).text === 'string') return (v as any).text;
    if (typeof (v as any).result === 'string') return (v as any).result;
    if (typeof (v as any).translated_text === 'string') return (v as any).translated_text;
    if (typeof (v as any).translation === 'string') return (v as any).translation;
  }
  return null;
}

function pickTargetLang(args: SendRoomMessageArgs, assumedRoomType: RoomType): string | null {
  const myPref = normalizeLangCode(args.my?.preferred_lang ?? null);
  const myView = normalizeLangCode(args.my?.view_lang ?? null);

  const peerPref = normalizeLangCode(args.peer?.preferred_lang ?? null);
  const peerView = normalizeLangCode(args.peer?.view_lang ?? null);

  if (assumedRoomType === 'self') return myPref ?? myView ?? null;
  if (assumedRoomType === 'direct') return peerPref ?? peerView ?? myPref ?? myView ?? null;
  return null;
}

function dbg(...args: any[]) {
  if (!DEBUG_CHAT) return;
  try {
    console.log('[push.ts]', ...args);
  } catch {}
}

/** =========================
 * ✅ Functions 에러 로그 유틸
 * ========================= */

function truncate(s: string, max = 2000) {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (truncated ${s.length - max} chars)`;
}

function summarizePayload(payload: any) {
  // 민감정보는 기본적으로 없음(채팅 텍스트는 민감할 수 있으니 preview 제한)
  const content = typeof payload?.content === 'string' ? payload.content : '';
  const original = typeof payload?.original === 'string' ? payload.original : '';
  const hasMoment = payload?.moment_config != null;

  return {
    room_id: payload?.room_id,
    sender_id: payload?.sender_id,
    kind: payload?.kind,
    is_notice: payload?.is_notice,
    client_msg_id: payload?.client_msg_id,
    source_lang: payload?.source_lang ?? null,
    sender_selected_tier: payload?.sender_selected_tier ?? null,
    max_generated_tier: payload?.max_generated_tier ?? null,
    delete_at: payload?.delete_at ?? null,
    moment_config: hasMoment ? payload.moment_config : null,

    // lengths only
    content_len: content.length,
    original_len: original.length,
    // small preview only
    content_preview: truncate(content.replace(/\s+/g, ' '), 120),
  };
}

async function readInvokeErrorDetails(fnErr: any): Promise<{
  status: number | null;
  requestId: string | null;
  cfRay: string | null;
  supabaseRequestId: string | null;
  bodyText: string | null;
  bodyJson: any | null;
}> {
  const ctx: any = fnErr?.context;
  const res: Response | null = ctx?.response ?? null;

  const status = (res as any)?.status ?? ctx?.status ?? null;

  let requestId: string | null = null;
  let cfRay: string | null = null;
  let supabaseRequestId: string | null = null;

  try {
    const headers = (res as any)?.headers;
    if (headers?.get) {
      // 다양한 환경에서 들어올 수 있는 헤더 후보들
      requestId =
        headers.get('x-request-id') ||
        headers.get('x-supabase-request-id') ||
        headers.get('x-vercel-id') ||
        null;

      supabaseRequestId = headers.get('x-supabase-request-id') || null;
      cfRay = headers.get('cf-ray') || null;
    }
  } catch {}

  let bodyText: string | null = null;
  let bodyJson: any | null = null;

  // DEV에서는 무조건 body를 뽑아보는게 최우선(500의 실체)
  const SHOULD_DUMP_BODY = __DEV__ || DEBUG_CHAT;

  if (SHOULD_DUMP_BODY && res) {
    try {
      const cloned = (res as any).clone ? (res as any).clone() : res;
      const text = await cloned.text();
      bodyText = truncate(text, 6000);

      // JSON이면 파싱 시도
      try {
        bodyJson = JSON.parse(text);
      } catch {
        bodyJson = null;
      }
    } catch (e) {
      bodyText = `[failed to read response body] ${String((e as any)?.message ?? e)}`;
      bodyJson = null;
    }
  }

  return { status, requestId, cfRay, supabaseRequestId, bodyText, bodyJson };
}

async function reconcileLocalWithServer(localId: string, serverRow: any) {
  if (!serverRow) return;
  const serverCreatedAt = serverRow.created_at ?? serverRow.createdAt ?? null;

  await database.write(async () => {
    const messages = database.get<Message>('messages');

    let localMsg: any = null;
    try {
      localMsg = await messages.find(localId);
    } catch {
      localMsg = null;
    }
    if (!localMsg) return;

    try {
      await localMsg.update((m: any) => {
        if (serverRow.room_id != null) m.room_id = serverRow.room_id;
        if (serverRow.sender_id != null) m.sender_id = serverRow.sender_id;
        if (serverRow.original != null) m.original = serverRow.original;
        if (serverRow.content != null) m.content = serverRow.content;
        if (serverRow.kind != null) m.kind = serverRow.kind;
        if (serverRow.is_notice != null) m.is_notice = !!serverRow.is_notice;

        if (serverCreatedAt != null) {
          const d = typeof serverCreatedAt === 'string' ? Date.parse(serverCreatedAt) : Number(serverCreatedAt);
          if (!Number.isNaN(d) && Number.isFinite(d)) m.created_at = d;
        }

        // ✅ delete_at (server may return ISO string or ms)
        if ((serverRow as any).delete_at !== undefined) {
          const del = (serverRow as any).delete_at as any;
          if (del == null) {
            (m as any).delete_at = null;
          } else if (typeof del === 'string') {
            const dms = Date.parse(del);
            (m as any).delete_at = Number.isFinite(dms) ? dms : null;
          } else {
            const dms = Number(del);
            (m as any).delete_at = Number.isFinite(dms) ? dms : null;
          }
        }

        if (serverRow.client_msg_id != null) m.client_msg_id = serverRow.client_msg_id;

        // ✅ room_seq (server-assigned per room)
        {
          const rs = Number(serverRow.room_seq ?? 0);
          if (Number.isFinite(rs) && rs > 0) safeSet(m, 'room_seq', Math.trunc(rs));
        }

        safeSet(m, 'source_lang', serverRow.source_lang ?? serverRow.sourceLang ?? null);
        safeSet(m, 'sender_selected_tier', serverRow.sender_selected_tier ?? null);
        safeSet(m, 'max_generated_tier', serverRow.max_generated_tier ?? null);
        safeSet(m, 'link_preview', serverRow.link_preview ?? null);
        safeSet(m, 'link_preview_url', serverRow.link_preview_url ?? null);
        safeSet(m, 'link_preview_status', serverRow.link_preview_status ?? null);
      });
    } catch (e) {
      console.warn('[push.ts] reconcileLocalWithServer update failed', e);
    }
  });
}

async function computeContentIfNeeded(args: SendRoomMessageArgs): Promise<{
  original: string;
  content: string;
  sourceLang?: string | null;
  senderSelectedTier?: Tier;
  maxGeneratedTier?: Tier;
}> {
  const baseContent = (args.content ?? '').toString();
  const baseOriginal = isNonEmptyString(args.original) ? args.original! : baseContent;

  if (args.kind !== 'text' && args.kind !== 'notice') {
    const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';
    dbg('skip: non-text kind', { kind: args.kind });
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
    };
  }

  if (!baseContent.trim()) {
    const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';
    dbg('skip: empty baseContent');
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
    };
  }

  if (!args.translateFn) {
    const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';
    dbg('skip: translateFn missing');
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
    };
  }

  const assumedRoomType: RoomType = args.roomType ?? 'direct';
  const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';

  const peerTier = args.peer?.translation_tier ?? 'free';
  const finalTier = assumedRoomType === 'direct' ? maxTier(senderTier, peerTier) : senderTier;

  const targetLang = pickTargetLang(args, assumedRoomType);

  dbg('translate: preflight', {
    assumedRoomType,
    kind: args.kind,
    senderTier,
    peerTier: assumedRoomType === 'direct' ? peerTier : undefined,
    finalTier,
    sourceLang: args.sourceLang ?? null,
    targetLang,
    baseContentPreview: baseContent.slice(0, 80),
  });

  if (!targetLang) {
    dbg('skip: targetLang missing');
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: assumedRoomType === 'direct' ? finalTier : senderTier,
    };
  }

  try {
    const raw = await args.translateFn({
      text: baseContent,
      targetLang,
      tier: finalTier,
      tone: assumedRoomType === 'self' && finalTier === 'high' ? args.my?.translation_tone_default ?? null : null,
      sourceLang: args.sourceLang ?? null,
    });

    const translated = normalizeTranslatedText(raw);
    const out = translated && translated.trim() ? translated : baseContent;

    dbg('translate: result', {
      changed: out !== baseContent,
      translatedPreview: (translated ?? '').toString().slice(0, 100),
    });

    return {
      original: baseOriginal,
      content: out,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: assumedRoomType === 'direct' ? finalTier : senderTier,
    };
  } catch (e: any) {
    dbg('translate: exception', { message: e?.message ?? String(e) });
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: assumedRoomType === 'direct' ? finalTier : senderTier,
    };
  }
}

export async function sendRoomMessage(args: SendRoomMessageArgs) {
  const { roomId, senderId, kind } = args;

  const now = Date.now();
  const clientMsgId = genClientMsgId(roomId);
  const localId = `local_${roomId}_${now}_${Math.random().toString(36).slice(2)}`;

  dbg('sendRoomMessage: start', {
    roomId,
    kind,
    roomType: args.roomType,
    hasTranslateFn: !!args.translateFn,
    contentPreview: (args.content ?? '').toString().slice(0, 80),
  });

  const computed = await computeContentIfNeeded(args);

  dbg('sendRoomMessage: computed', {
    changed: computed.content !== (args.content ?? '').toString(),
    sourceLang: computed.sourceLang ?? null,
    senderSelectedTier: computed.senderSelectedTier ?? null,
    maxGeneratedTier: computed.maxGeneratedTier ?? null,
  });

  // ✅ 24h max-lifetime cap (local pre-cap for offline security)
  const cap24hMs = now + 24 * 60 * 60 * 1000;

  // ✅ normalize moment config for server cap enforcement:
  // - if deleteAtMs exists but momentConfig is null => treat as TIME_BASED
  const normalizedMomentConfig: MomentConfig | null =
    args.momentConfig != null
      ? args.momentConfig
      : args.deleteAtMs != null
        ? { type: 'TIME_BASED' }
        : null;

  // ✅ local delete_at scheduling:
  let localDeleteAtMs: number | null = null;
  if (normalizedMomentConfig?.type === 'READ_BASED') {
    localDeleteAtMs = cap24hMs;
  } else if (args.deleteAtMs != null) {
    const v = Number(args.deleteAtMs);
    localDeleteAtMs = Number.isFinite(v) ? Math.min(v, cap24hMs) : cap24hMs;
  }

  // 1) local DB (optimistic)
  await database.write(async () => {
    const collection = database.get<Message>('messages');
    await collection.create((m: any) => {
      m._raw.id = localId;
      m.room_id = roomId;
      m.sender_id = senderId;
      m.original = computed.original;
      m.content = computed.content;
      m.kind = kind;
      m.is_notice = false;
      m.created_at = now;
      m.client_msg_id = clientMsgId;

      // ✅ delete_at (ms) local schedule (pre-capped)
      (m as any).delete_at = localDeleteAtMs;

      safeSet(m, 'source_lang', computed.sourceLang ?? null);
      safeSet(m, 'sender_selected_tier', computed.senderSelectedTier ?? null);
      safeSet(m, 'max_generated_tier', computed.maxGeneratedTier ?? null);
      safeSet(m, 'link_preview', null);
    });
  });

  // 2) server via Edge Function
  const payload: any = {
    room_id: roomId,
    sender_id: senderId,
    kind,
    is_notice: false,
    content: computed.content,
    original: computed.original,
    client_msg_id: clientMsgId,
  };

  // ✅ server delete_at:
  if (normalizedMomentConfig?.type === 'TIME_BASED' && args.deleteAtMs != null) {
    payload.delete_at = new Date(args.deleteAtMs).toISOString();
  }

  // ✅ moment_config:
  if (normalizedMomentConfig != null) payload.moment_config = normalizedMomentConfig;

  if (computed.sourceLang != null) payload.source_lang = computed.sourceLang;
  if (computed.senderSelectedTier != null) payload.sender_selected_tier = computed.senderSelectedTier;
  if (computed.maxGeneratedTier != null) payload.max_generated_tier = computed.maxGeneratedTier;

  // ✅ invoke 직전 payload 요약 로그 (DEBUG_CHAT에서만)
  dbg('message-send: invoke payload(summary)', summarizePayload(payload));

  const { data: fnRes, error: fnErr } = await supabase.functions.invoke('message-send', {
    body: payload,
  });

  if (fnErr) {
    const details = await readInvokeErrorDetails(fnErr);

    // ✅ 항상 찍는 최소 정보 (운영에서도 유용)
    console.warn('[push.ts] message-send invoke failed:', {
      name: (fnErr as any).name,
      message: (fnErr as any).message,
      status: details.status,
      requestId: details.requestId,
      supabaseRequestId: details.supabaseRequestId,
      cfRay: details.cfRay,
      clientMsgId,
      roomId,
      kind,
    });

    // ✅ DEV/DEBUG_CHAT에서만 상세 바디/페이로드 요약 덤프
    if (__DEV__ || DEBUG_CHAT) {
      console.warn('[push.ts] message-send invoke failed: payload(summary)', summarizePayload(payload));

      if (details.bodyJson != null) {
        console.warn('[push.ts] message-send invoke failed: body(json)', details.bodyJson);
      } else if (details.bodyText) {
        console.warn('[push.ts] message-send invoke failed: body(text)', details.bodyText);
      } else {
        console.warn('[push.ts] message-send invoke failed: body(empty)');
      }
    }

    return;
  }

  if (!fnRes?.success || !fnRes?.message) {
    console.warn('[push.ts] message-send bad response', {
      success: fnRes?.success,
      hasMessage: !!fnRes?.message,
      clientMsgId,
    });
    if (__DEV__ || DEBUG_CHAT) console.warn('[push.ts] message-send bad response detail:', fnRes);
    return;
  }

  dbg('sendRoomMessage: server insert ok', { clientMsgId });

  await reconcileLocalWithServer(localId, fnRes.message);
}
