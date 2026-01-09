// src/lib/chatSync/push.ts
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';
import { upsertMessagesAtomic, type ChatMessageRow } from './pull';
import { markDeletedMineServer } from '@/lib/chatDelete/deleteMineTombstones';

export type Tier = 'free' | 'mid' | 'high';

export type MomentConfig =
  | { type: 'READ_BASED'; delay: number } // seconds
  | { type: 'TIME_BASED' }; // delete_at is sent separately (deleteAtMs)

export type ProfileLangConfig = {
  translation_tier?: Tier | null;
  view_lang?: string | null;
  preferred_lang?: string | null;
  translation_tone_default?: string | null;
  setting_lang?: string | null;
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

const SUPABASE_URL =
  String((process as any)?.env?.EXPO_PUBLIC_SUPABASE_URL ?? '').trim() ||
  String((process as any)?.env?.EXPO_PUBLIC_SUPABASE_PROJECT_URL ?? '').trim();

const SUPABASE_ANON_KEY =
  String((process as any)?.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

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
  // ✅ sender(나) 기준: "보낼 언어" = my.preferred_lang
  const mySend = normalizeLangCode(args.my?.preferred_lang ?? null);
  const myView = normalizeLangCode(args.my?.view_lang ?? null);

  // ✅ receiver(상대) 기준: "받을 언어" = peer.view_lang (없으면 setting_lang)
  const peerView = normalizeLangCode(args.peer?.view_lang ?? null);
  const peerSetting = normalizeLangCode(args.peer?.setting_lang ?? null);

  // ✅ SELF: 나에게 표시할 언어(보낼 언어가 있으면 그걸 우선)
  if (assumedRoomType === 'self') return mySend ?? myView ?? null;

  // ✅ DIRECT(DM/business_dm): "내가 보낼 언어"가 최우선
  //    (peer.preferred_lang은 '상대가 보낼 언어'라서 여기서 쓰면 안 됨)
  if (assumedRoomType === 'direct') {
    return mySend ?? peerView ?? peerSetting ?? myView ?? null;
  }
  return null;
}

function dbg(...args: any[]) {
  if (!DEBUG_CHAT) return;
  try {
    console.log('[push.ts]', ...args);
  } catch {}
}

function truncate(s: string, max = 3000) {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (truncated ${s.length - max} chars)`;
}

function summarizePayload(payload: any) {
  const content = typeof payload?.content === 'string' ? payload.content : '';
  const original = typeof payload?.original === 'string' ? payload.original : '';
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
    moment_config: payload?.moment_config ?? null,
    content_len: content.length,
    original_len: original.length,
    content_preview: truncate(content.replace(/\s+/g, ' '), 120),
  };
}

/**
 * ✅ invoke가 에러일 때 supabase-js가 바디를 제대로 안 주는 경우가 있어서
 * DEBUG_CHAT에서만 raw fetch로 동일 요청을 재시도하여 "진짜 에러 바디"를 확보한다.
 */
async function debugFetchEdgeFunction(name: string, body: any) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[push.ts] debugFetchEdgeFunction: missing SUPABASE env', {
      hasUrl: !!SUPABASE_URL,
      hasAnon: !!SUPABASE_ANON_KEY,
    });
    return null;
  }

  let accessToken: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data?.session?.access_token ?? null;
  } catch {}

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: {
      sb_request_id: res.headers.get('sb-request-id') || res.headers.get('sb_request_id'),
      x_request_id: res.headers.get('x-request-id'),
      x_supabase_request_id: res.headers.get('x-supabase-request-id'),
      cf_ray: res.headers.get('cf-ray'),
      content_type: res.headers.get('content-type'),
    },
    bodyText: truncate(text, 6000),
    bodyJson: json,
    url,
  };
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

  // ✅ 어떤 분기에서도 maxGeneratedTier가 null/undefined로 빠지지 않도록 "기본값"을 먼저 확정
  const assumedRoomType: RoomType = args.roomType ?? 'direct';
  const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';
  const peerTier: Tier = args.peer?.translation_tier ?? 'free';
  const finalTier: Tier = assumedRoomType === 'direct' ? maxTier(senderTier, peerTier) : senderTier;
  const defaultMaxGeneratedTier: Tier = assumedRoomType === 'direct' ? finalTier : senderTier;

  if (args.kind !== 'text' && args.kind !== 'notice') {
    dbg('skip: non-text kind', { kind: args.kind });
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: defaultMaxGeneratedTier,
    };
  }

  if (!baseContent.trim()) {
    dbg('skip: empty baseContent');
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: defaultMaxGeneratedTier,
    };
  }

  if (!args.translateFn) {
    dbg('skip: translateFn missing');
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: defaultMaxGeneratedTier,
    };
  }

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
      maxGeneratedTier: defaultMaxGeneratedTier,
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
      maxGeneratedTier: defaultMaxGeneratedTier,
    };
  } catch (e: any) {
    dbg('translate: exception', { message: e?.message ?? String(e) });
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: defaultMaxGeneratedTier,
    };
  }
}

export async function sendRoomMessage(args: SendRoomMessageArgs) {
  const { roomId, senderId, kind } = args;

  const now = Date.now();
  const clientMsgId = genClientMsgId(roomId);
  const localId = `local_${roomId}_${now}_${Math.random().toString(36).slice(2)}`;

  // ✅ 번역 대기 없이 즉시 보여줄 base 값
  const baseContent = (args.content ?? '').toString();
  const baseOriginal = isNonEmptyString(args.original) ? args.original! : baseContent;

  // ✅ local tier 기본값 (null 방지)
  const assumedRoomType: RoomType = args.roomType ?? 'direct';
  const senderTier: Tier = args.senderSelectedTier ?? args.my?.translation_tier ?? 'free';
  const peerTier: Tier = args.peer?.translation_tier ?? 'free';
  const finalTier: Tier = assumedRoomType === 'direct' ? maxTier(senderTier, peerTier) : senderTier;
  const defaultMaxGeneratedTier: Tier = assumedRoomType === 'direct' ? finalTier : senderTier;

  const cap24hMs = now + 24 * 60 * 60 * 1000;

  const normalizedMomentConfig: MomentConfig | null =
    args.momentConfig != null
      ? args.momentConfig
      : args.deleteAtMs != null
        ? { type: 'TIME_BASED' }
        : null;

  let localDeleteAtMs: number | null = null;
  if (normalizedMomentConfig?.type === 'READ_BASED') {
    localDeleteAtMs = cap24hMs;
  } else if (args.deleteAtMs != null) {
    const v = Number(args.deleteAtMs);
    localDeleteAtMs = Number.isFinite(v) ? Math.min(v, cap24hMs) : cap24hMs;
  }

  // 1) local DB (optimistic) — ✅ 즉시 생성 (번역 기다리지 않음)
  await database.write(async () => {
    const collection = database.get<Message>('messages');
    await collection.create((m: any) => {
      m._raw.id = localId;
      m.room_id = roomId;
      m.sender_id = senderId;
      m.original = baseOriginal;
      m.content = baseContent;
      m.kind = kind;
      m.is_notice = false;
      m.created_at = now;
      m.client_msg_id = clientMsgId;
      (m as any).delete_at = localDeleteAtMs;

      safeSet(m, 'source_lang', args.sourceLang ?? null);
      safeSet(m, 'sender_selected_tier', senderTier);
      safeSet(m, 'max_generated_tier', defaultMaxGeneratedTier);
      safeSet(m, 'link_preview', null);
    });
  });

  // 2) 이제 번역/가공(시간이 걸려도 UI는 이미 떠 있음)
  const computed = await computeContentIfNeeded(args);

  // 2-1) 번역 결과가 바뀌면 로컬 메시지 업데이트
  if (computed.content !== baseContent || computed.original !== baseOriginal) {
    await database.write(async () => {
      const messages = database.get<Message>('messages');
      const localMsg = await messages.find(localId).catch(() => null);
      if (!localMsg) return;

      await (localMsg as any).update((m: any) => {
        m.original = computed.original;
        m.content = computed.content;

        safeSet(m, 'source_lang', computed.sourceLang ?? (args.sourceLang ?? null));
        safeSet(m, 'sender_selected_tier', computed.senderSelectedTier ?? senderTier);
        safeSet(m, 'max_generated_tier', computed.maxGeneratedTier ?? defaultMaxGeneratedTier);
      });
    });
  }

  // 3) server via Edge Function (computed 기준으로 전송)
  const payload: any = {
    room_id: roomId,
    sender_id: senderId,
    kind,
    is_notice: false,
    content: computed.content,
    original: computed.original,
    client_msg_id: clientMsgId,
  };

  if (normalizedMomentConfig?.type === 'TIME_BASED' && args.deleteAtMs != null) {
    payload.delete_at = new Date(args.deleteAtMs).toISOString();
  }

  if (normalizedMomentConfig != null) payload.moment_config = normalizedMomentConfig;

  // ✅ tier 값은 서버가 null 가정하면 바로 죽기 쉬우니 "항상" 보낸다
  payload.source_lang = computed.sourceLang ?? (args.sourceLang ?? null);
  payload.sender_selected_tier = computed.senderSelectedTier ?? senderTier;
  payload.max_generated_tier = computed.maxGeneratedTier ?? payload.sender_selected_tier;

  const { data: fnRes, error: fnErr } = await supabase.functions.invoke('message-send', {
    body: payload,
  });

  if (fnErr) {
    console.warn('[push.ts] message-send invoke failed:', {
      name: (fnErr as any).name,
      message: (fnErr as any).message,
      status: (fnErr as any)?.context?.response?.status ?? (fnErr as any)?.context?.status ?? null,
      clientMsgId,
      roomId,
      kind,
    });

    // DEV raw fetch (기존 로직 유지)
    if (__DEV__) {
      try {
        const raw = await debugFetchEdgeFunction('message-send', payload);
        console.warn('[push.ts] message-send raw(fetch) result:', raw);
      } catch (e: any) {
        console.warn('[push.ts] message-send raw(fetch) failed:', e?.message ?? String(e));
      }
      console.warn('[push.ts] message-send invoke failed: payload(summary)', summarizePayload(payload));
    }
    return;
  }

  if (!fnRes?.success || !fnRes?.message) {
    console.warn('[push.ts] message-send bad response', {
      success: fnRes?.success,
      hasMessage: !!fnRes?.message,
      clientMsgId,
    });
    return;
  }

  // ✅ 서버 응답을 "pull/upsert" 동일 경로로 주입 (Atomic)
  try {
    await upsertMessagesAtomic([fnRes.message as ChatMessageRow]);
  } catch (e: any) {
    console.warn('[push.ts] upsertMessagesAtomic failed, fallback reconcile', {
      message: e?.message ?? String(e),
      clientMsgId,
    });
    await reconcileLocalWithServer(localId, fnRes.message);
  }
}


/**
 * ✅ NEW: "나에게만 삭제" (옵션 A: per-user tombstone table)
 * - 서버: public.chat_message_deletions에 upsert (RLS: auth.uid())
 * - 로컬: WatermelonDB에서 해당 메시지 레코드 물리 삭제
 * - 로컬 tombstone(캐시)도 함께 찍어 pull/realtime로 부활하지 않게 함
 *
 * ⚠️ '모두에게 삭제' / '모먼트 삭제' (delete_at) 로직은 기존 그대로 유지.
 */
export async function deleteMessageMine(args: {
  roomId: number;
  messageId: number | string;
}) {
  const roomId = Number(args.roomId);
  const messageIdStr = String(args.messageId ?? '').trim();

  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (!messageIdStr) return;

  // 1) 서버 tombstone + 로컬 tombstone(즉시 부활 방지)
  await markDeletedMineServer({ roomId, messageId: messageIdStr });

  // 2) 로컬 메시지 물리 삭제
  try {
    await database.write(async () => {
      const collection = database.get<Message>('messages');

      let msg: any = null;
      try {
        msg = await collection.find(messageIdStr);
      } catch {
        msg = null;
      }
      if (!msg) return;

      const st = String((msg as any)?._raw?._status ?? '');
      if (st === 'deleted') return;

      await (msg as any).destroyPermanently();
    });
  } catch {
    // best-effort
  }
}

/**
 * ✅ NEW: 다중 선택(배치)용 helper
 * - 안전 우선: 순차 처리 (서버/로컬 동기화 안정성)
 */
export async function deleteMessagesMine(args: {
  roomId: number;
  messageIds: Array<number | string>;
}) {
  const roomId = Number(args.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return;

  const ids = Array.isArray(args.messageIds) ? args.messageIds : [];
  for (const id of ids) {
    const s = String(id ?? '').trim();
    if (!s) continue;
    await deleteMessageMine({ roomId, messageId: s });
  }
}
