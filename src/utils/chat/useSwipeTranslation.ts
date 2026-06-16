// src/utils/chat/useSwipeTranslation.ts
// -----------------------------------------------------------------------------
// Swipe/manual translation hook (translate-on-demand)
//
// Policy
//   - Swipe/manual translation never writes translation results to the server.
//   - Existing local cache may be shown even when the room translation toggle is OFF.
//   - A new translation request is allowed only when the caller explicitly allows it
//     (normally: the top translation button / room auto_translate is ON).
//   - A new translation result is displayed only after it is successfully saved into
//     the local message_translations table.
//
// Local cache policy (WatermelonDB: message_translations)
//   - Purpose = swipe_my_view
//   - Cache is per local user + room + message + source mode + target language + tier + tone.
// -----------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/lib/chatDB/database';
import MessageTranslation from '@/lib/chatDB/models/MessageTranslation';
import { supabase } from '@/lib/supabase';

type FromMode = 'content' | 'original';
type Tier = 'free' | 'mid' | 'high';
type Tone = 'business' | 'polite' | 'casual' | 'neutral' | 'creative';

type TranslateOnDemandResponse = {
  ok: boolean;
  translated_text: string | null;
  provider: 'openai' | 'deepl' | 'none';
  tier_used: Tier;
  target_lang: string | null;
  tone_used: Tone;
  context_used_count: number;
  reason?: string;
};

const SWIPE_PURPOSE = 'swipe_my_view';

function toStr(v: unknown): string {
  return String(v ?? '').trim();
}

function toRoomId(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function readRaw(row: unknown, key: string): unknown {
  return (row as any)?._raw?.[key];
}

function readTranslatedText(row: unknown): string | null {
  const value =
    (row as any)?.translatedText ??
    (row as any)?.translated_text ??
    readRaw(row, 'translated_text') ??
    null;

  const text = toStr(value);
  return text.length > 0 ? text : null;
}

function readUpdatedAt(row: unknown): number {
  const value = (row as any)?.updatedAt ?? (row as any)?.updated_at ?? readRaw(row, 'updated_at') ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTier(v: unknown): Tier {
  const s = toStr(v).toLowerCase();
  return s === 'high' || s === 'mid' || s === 'free' ? s : 'free';
}

function normalizeTone(v: unknown): Tone {
  const s = toStr(v).toLowerCase();
  if (s === 'business' || s === 'polite' || s === 'casual' || s === 'neutral' || s === 'creative') {
    return s;
  }
  return 'neutral';
}

function normalizeProvider(v: unknown): 'openai' | 'deepl' | 'none' {
  const s = toStr(v).toLowerCase();
  return s === 'openai' || s === 'deepl' || s === 'none' ? s : 'none';
}

function buildCacheKey(p: {
  roomId: number | string;
  userId: string;
  purpose: string;
  messageId: number | string;
  from: FromMode;
  targetLang: string;
  tier: Tier;
  tone: Tone;
}): string {
  const roomId = toStr(p.roomId);
  const userId = toStr(p.userId) || 'unknown';
  const messageId = toStr(p.messageId);
  const targetLang = toStr(p.targetLang).toUpperCase();
  return `t:${roomId}:${userId}:${p.purpose}:${messageId}:${p.from}:${targetLang}:${p.tier}:${p.tone}`;
}

function assignTranslationFields(
  model: any,
  p: {
    cacheKey?: string;
    roomId: number;
    userId: string;
    purpose: string;
    messageId: number | string;
    from: FromMode;
    targetLang: string;
    tier: Tier;
    tone: Tone;
    provider: 'openai' | 'deepl' | 'none';
    translatedText: string;
    createdAt?: number;
    updatedAt: number;
  },
) {
  const targetLang = toStr(p.targetLang).toUpperCase();
  const messageId = toStr(p.messageId);

  if (p.cacheKey) {
    model._raw.id = p.cacheKey;
  }

  model.roomId = p.roomId;
  model.messageId = messageId;
  model.userId = p.userId;
  model.purpose = p.purpose;
  model.fromMode = p.from;
  model.targetLang = targetLang;
  model.generatedTier = p.tier;
  model.tone = p.tone;
  model.provider = p.provider;
  model.translatedText = p.translatedText;
  if (p.createdAt != null) model.createdAt = p.createdAt;
  model.updatedAt = p.updatedAt;

  // Raw fallback keeps writes aligned with the current schema even if a stale model was loaded.
  model._raw.room_id = p.roomId;
  model._raw.message_id = messageId;
  model._raw.user_id = p.userId;
  model._raw.purpose = p.purpose;
  model._raw.from_mode = p.from;
  model._raw.target_lang = targetLang;
  model._raw.generated_tier = p.tier;
  model._raw.tone = p.tone;
  model._raw.provider = p.provider;
  model._raw.translated_text = p.translatedText;
  if (p.createdAt != null) model._raw.created_at = p.createdAt;
  model._raw.updated_at = p.updatedAt;
}

export function useSwipeTranslation(args: { roomId: number; myUserId: string }) {
  const { roomId, myUserId } = args;
  const roomIdNum = toRoomId(roomId);
  const userId = toStr(myUserId);

  // MessageItem에서 number로 비교하니 number 유지
  const [loadingMsgId, setLoadingMsgId] = useState<number | null>(null);

  // inflight de-dupe (same message/from in same room/user)
  const inflightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const col = useMemo(() => database.get<MessageTranslation>('message_translations'), []);

  const findLatestCachedTranslation = useCallback(
    async (p: { messageId: number | string; from: FromMode }): Promise<string | null> => {
      if (!roomIdNum || !userId) return null;

      try {
        const rows = await col
          .query(
            Q.where('room_id', roomIdNum),
            Q.where('user_id', userId),
            Q.where('purpose', SWIPE_PURPOSE),
            Q.where('message_id', toStr(p.messageId)),
            Q.where('from_mode', p.from),
          )
          .fetch();

        if (!rows.length) return null;

        const sorted = [...rows].sort((a, b) => readUpdatedAt(b) - readUpdatedAt(a));
        return readTranslatedText(sorted[0]);
      } catch (error) {
        console.warn('[swipe-translate:cache-read-failed]', {
          roomId: roomIdNum,
          userId,
          messageId: p.messageId,
          from: p.from,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [col, roomIdNum, userId],
  );

  const findByCacheKeyText = useCallback(
    async (cacheKey: string): Promise<string | null> => {
      try {
        const row = await col.find(cacheKey);
        return readTranslatedText(row);
      } catch {
        return null;
      }
    },
    [col],
  );

  const saveToLocalCache = useCallback(
    async (p: {
      cacheKey: string;
      messageId: number | string;
      from: FromMode;
      targetLang: string;
      tier: Tier;
      tone: Tone;
      provider: 'openai' | 'deepl' | 'none';
      translatedText: string;
    }): Promise<boolean> => {
      if (!roomIdNum || !userId) return false;

      const now = Date.now();

      try {
        await database.write(async () => {
          let existing: MessageTranslation | null = null;
          try {
            existing = await col.find(p.cacheKey);
          } catch {
            existing = null;
          }

          if (existing) {
            await existing.update((m) => {
              assignTranslationFields(m as any, {
                roomId: roomIdNum,
                userId,
                purpose: SWIPE_PURPOSE,
                messageId: p.messageId,
                from: p.from,
                targetLang: p.targetLang,
                tier: p.tier,
                tone: p.tone,
                provider: p.provider,
                translatedText: p.translatedText,
                updatedAt: now,
              });
            });
            return;
          }

          await col.create((m) => {
            assignTranslationFields(m as any, {
              cacheKey: p.cacheKey,
              roomId: roomIdNum,
              userId,
              purpose: SWIPE_PURPOSE,
              messageId: p.messageId,
              from: p.from,
              targetLang: p.targetLang,
              tier: p.tier,
              tone: p.tone,
              provider: p.provider,
              translatedText: p.translatedText,
              createdAt: now,
              updatedAt: now,
            });
          });
        });

        const savedText = await findByCacheKeyText(p.cacheKey);
        return !!savedText;
      } catch (error) {
        console.warn('[swipe-translate:cache-save-failed]', {
          roomId: roomIdNum,
          userId,
          messageId: p.messageId,
          from: p.from,
          targetLang: p.targetLang,
          tier: p.tier,
          provider: p.provider,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [col, findByCacheKeyText, roomIdNum, userId],
  );

  const requestServer = useCallback(
    async (p: { messageId: number; from: FromMode }): Promise<TranslateOnDemandResponse | null> => {
      if (!roomIdNum) return null;

      const { data, error } = await supabase.functions.invoke<TranslateOnDemandResponse>('translate-on-demand', {
        body: {
          room_id: roomIdNum,
          message_id: p.messageId,
          from: p.from,
        },
      });

      if (error) {
        console.warn('[swipe-translate:server-failed]', {
          roomId: roomIdNum,
          messageId: p.messageId,
          from: p.from,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }

      if (!data?.ok) {
        console.warn('[swipe-translate:server-rejected]', {
          roomId: roomIdNum,
          messageId: p.messageId,
          from: p.from,
          reason: data?.reason ?? 'unknown',
        });
        return null;
      }

      return data;
    },
    [roomIdNum],
  );

  /**
   * Swipe/manual translation.
   *
   * Important:
   *   1) Local cache is checked before loading state and before server request.
   *   2) allowRequest=false still returns an existing local translation.
   *   3) New server translation result is saved locally only.
   *   4) New result is displayed only after local save + local read succeeds.
   */
  const translateForMyView = useCallback(
    async (p: { messageId: number; from: FromMode; allowRequest?: boolean }): Promise<string | null> => {
      const cachedBeforeRequest = await findLatestCachedTranslation({
        messageId: p.messageId,
        from: p.from,
      });
      if (cachedBeforeRequest) return cachedBeforeRequest;

      if (!p.allowRequest) return null;
      if (!roomIdNum || !userId) return null;

      const inflightKey = `room:${roomIdNum}:user:${userId}:msg:${p.messageId}:from:${p.from}`;
      if (inflightRef.current.has(inflightKey)) return inflightRef.current.get(inflightKey)!;

      setLoadingMsgId(p.messageId);

      const task = (async () => {
        const res = await requestServer({ messageId: p.messageId, from: p.from });
        if (!res) return null;

        const targetLang = toStr(res.target_lang).toUpperCase();
        const translated = toStr(res.translated_text);

        // free / no lang / no output => keep current view.
        if (!targetLang || !translated) return null;
        if (res.tier_used === 'free') return null;

        const tier = normalizeTier(res.tier_used);
        const tone = normalizeTone(res.tone_used);
        const provider = normalizeProvider(res.provider);

        const cacheKey = buildCacheKey({
          roomId: roomIdNum,
          userId,
          purpose: SWIPE_PURPOSE,
          messageId: p.messageId,
          from: p.from,
          targetLang,
          tier,
          tone,
        });

        const saved = await saveToLocalCache({
          cacheKey,
          messageId: p.messageId,
          from: p.from,
          targetLang,
          tier,
          tone,
          provider,
          translatedText: translated,
        });

        if (!saved) return null;

        // Strict policy: show only what can be read back from local cache.
        return (
          (await findByCacheKeyText(cacheKey)) ??
          (await findLatestCachedTranslation({ messageId: p.messageId, from: p.from }))
        );
      })().finally(() => {
        inflightRef.current.delete(inflightKey);
        setLoadingMsgId((cur) => (cur === p.messageId ? null : cur));
      });

      inflightRef.current.set(inflightKey, task);
      return task;
    },
    [findByCacheKeyText, findLatestCachedTranslation, requestServer, roomIdNum, saveToLocalCache, userId],
  );

  return {
    loadingMsgId,
    translateForMyView,
  };
}
