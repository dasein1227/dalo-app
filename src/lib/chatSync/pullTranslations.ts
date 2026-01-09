// src/lib/chatSync/push.ts

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';

export type Tier = 'free' | 'mid' | 'high';

export type ProfileLangConfig = {
  // profiles 테이블의 개념을 그대로 매핑
  translation_tier?: Tier | null; // 유저가 설정한 번역 등급
  view_lang?: string | null; // 채팅 화면에서 번역될 언어
  preferred_lang?: string | null; // 내가 보낼 때 번역될 언어(게시/전달 기본)
  translation_tone_default?: string | null; // high에서만 사용될 톤(필요 시)
};

export type RoomType = 'self' | 'direct' | 'group';

export type TranslateFn = (args: {
  text: string;
  targetLang: string;
  tier: Tier;
  // high tier 사용자라면 tone을 사용할 수도 있음(지금 단계에선 선택)
  tone?: string | null;
  // 원하면 sourceLang도 함께 넘길 수 있음
  sourceLang?: string | null;
}) => Promise<string>;

export type SendRoomMessageArgs = {
  roomId: number;
  senderId: string;

  /**
   * 기존 호출부 호환:
   * - content/original을 그대로 넘기면 기존과 동일하게 저장/전송됨
   */
  content: string | null;
  original?: string | null;

  kind: 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';

  /**
   * ✅ Self + 1:1 구현을 위한 확장 파라미터(선택)
   * 이 값들이 없으면 기존 방식으로 그대로 동작한다.
   */
  roomType?: RoomType;

  my?: ProfileLangConfig | null; // sender(나) 프로필 설정
  peer?: ProfileLangConfig | null; // direct(1:1) 상대 프로필 설정

  // 원문 언어(감지/설정 결과). 없으면 저장 생략 가능
  sourceLang?: string | null;

  // 발신자가 선택한 tier (translation_tier)
  senderSelectedTier?: Tier | null;

  // 번역 호출 함수(없으면 자동 번역 계산을 시도하지 않고 args.content를 사용)
  translateFn?: TranslateFn;
};

function genClientMsgId(roomId: number) {
  // 외부 라이브러리 없이 충돌 가능성 낮게
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
  } catch {
    // ignore
  }
}

async function computeContentIfNeeded(args: SendRoomMessageArgs): Promise<{
  original: string;
  content: string;
  sourceLang?: string | null;
  senderSelectedTier?: Tier;
  maxGeneratedTier?: Tier;
}> {
  const baseContent = (args.content ?? '').toString();
  const baseOriginal =
    args.original && args.original.toString().trim().length > 0
      ? args.original.toString()
      : baseContent;

  // 기본: 기존 동작 유지
  // - translateFn 또는 roomType이 없으면, caller가 이미 만들어 준 content를 그대로 쓴다.
  if (!args.translateFn || !args.roomType) {
    return {
      original: baseOriginal,
      content: baseContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: (args.senderSelectedTier ?? args.my?.translation_tier ?? 'free') as Tier,
      maxGeneratedTier: undefined,
    };
  }

  const senderTier: Tier = (args.senderSelectedTier ?? args.my?.translation_tier ?? 'free') as Tier;

  // free면 번역 호출 없이 original 그대로 content 사용(테이블 증가/비용 최소)
  if (senderTier === 'free') {
    return {
      original: baseOriginal,
      content: baseOriginal,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: senderTier,
    };
  }

  // ✅ Self: content는 preferred_lang 번역(공부/게시 기본)
  if (args.roomType === 'self') {
    const targetLang = (args.my?.preferred_lang ?? '').toString().trim();
    if (!targetLang) {
      // preferred_lang 없으면 안전하게 원문 유지
      return {
        original: baseOriginal,
        content: baseOriginal,
        sourceLang: args.sourceLang ?? null,
        senderSelectedTier: senderTier,
        maxGeneratedTier: senderTier,
      };
    }

    const translated = await args.translateFn({
      text: baseOriginal,
      targetLang,
      tier: senderTier,
      tone: senderTier === 'high' ? args.my?.translation_tone_default ?? null : null,
      sourceLang: args.sourceLang ?? null,
    });

    return {
      original: baseOriginal,
      content: (translated ?? baseOriginal).toString(),
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: senderTier,
    };
  }

  // ✅ 1:1: content는 상대 view_lang 번역(수신자 기본 표시)
  if (args.roomType === 'direct') {
    const peerViewLang = (args.peer?.view_lang ?? '').toString().trim();
    const peerTier: Tier = (args.peer?.translation_tier ?? 'free') as Tier;

    // max_generated_tier = max(수신자 translation_tier, sender_selected_tier)
    const finalTier = maxTier(peerTier, senderTier);

    // view_lang이 없으면 번역 불가 → 원문 전달(안전)
    if (!peerViewLang) {
      return {
        original: baseOriginal,
        content: baseOriginal,
        sourceLang: args.sourceLang ?? null,
        senderSelectedTier: senderTier,
        maxGeneratedTier: finalTier,
      };
    }

    const translated = await args.translateFn({
      text: baseOriginal,
      targetLang: peerViewLang,
      tier: finalTier,
      // 1:1 전송 번역은 기본적으로 tone을 강하게 개입시키지 않는 편이 안정적
      // 필요해지면 정책으로 확장 가능
      tone: null,
      sourceLang: args.sourceLang ?? null,
    });

    return {
      original: baseOriginal,
      content: (translated ?? baseOriginal).toString(),
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: senderTier,
      maxGeneratedTier: finalTier,
    };
  }

  // group은 이 단계에서 다루지 않음(기존 값 유지)
  return {
    original: baseOriginal,
    content: baseContent,
    sourceLang: args.sourceLang ?? null,
    senderSelectedTier: senderTier,
    maxGeneratedTier: undefined,
  };
}

export async function sendRoomMessage(args: SendRoomMessageArgs) {
  const { roomId, senderId, kind } = args;

  const now = Date.now();
  const clientMsgId = genClientMsgId(roomId);

  // 로컬 row id는 local_* (Watermelon PK)
  const localId = `local_${roomId}_${now}_${Math.random().toString(36).slice(2)}`;

  // ✅ content/original 계산(필요 시 번역 포함)
  let computed: Awaited<ReturnType<typeof computeContentIfNeeded>>;
  try {
    computed = await computeContentIfNeeded(args);
  } catch (e) {
    // 번역 실패해도 전송 자체는 진행(원문 기준)
    console.warn('[sendRoomMessage] computeContentIfNeeded failed:', e);
    const fallbackContent = (args.content ?? args.original ?? '').toString();
    const fallbackOriginal =
      args.original && args.original.toString().trim().length > 0 ? args.original.toString() : fallbackContent;

    computed = {
      original: fallbackOriginal,
      content: fallbackContent,
      sourceLang: args.sourceLang ?? null,
      senderSelectedTier: (args.senderSelectedTier ?? args.my?.translation_tier ?? 'free') as Tier,
      maxGeneratedTier: undefined,
    };
  }

  const baseOriginal = computed.original;
  const baseContent = computed.content;

  // 1) 로컬 DB 저장
  await database.write(async () => {
    const collection = database.get<Message>('messages');
    await collection.create((m: any) => {
      m._raw.id = localId;
      m.room_id = roomId;
      m.sender_id = senderId;

      // 기존 필드
      m.original = baseOriginal;
      m.content = baseContent;
      m.kind = kind;
      m.is_notice = false;
      m.created_at = now;

      // ✅ 핵심
      m.client_msg_id = clientMsgId;

      // 확장 필드(스키마에 존재할 때만 세팅)
      safeSet(m, 'source_lang', computed.sourceLang ?? null);
      safeSet(m, 'sender_selected_tier', computed.senderSelectedTier ?? null);
      safeSet(m, 'max_generated_tier', computed.maxGeneratedTier ?? null);
    });
  });

  // 2) 서버 전송
  // 컬럼이 없을 수도 있으므로, undefined는 insert payload에서 제외되도록 구성
  const payload: any = {
    room_id: roomId,
    sender_id: senderId,
    original: baseOriginal,
    content: baseContent,
    kind,
    client_msg_id: clientMsgId, // ✅ 핵심
  };

  if (computed.sourceLang != null) payload.source_lang = computed.sourceLang;
  if (computed.senderSelectedTier != null) payload.sender_selected_tier = computed.senderSelectedTier;
  if (computed.maxGeneratedTier != null) payload.max_generated_tier = computed.maxGeneratedTier;

  const { error } = await supabase.from('chat_messages').insert(payload);

  if (error) {
    // 서버 실패해도 로컬은 남겨두고(재전송/실패표시) UX 유지
    console.warn('[sendRoomMessage] Supabase insert error:', error);
  }
}
