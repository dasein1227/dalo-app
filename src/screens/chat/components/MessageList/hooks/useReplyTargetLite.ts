import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export type ReplyTargetLite = {
  id: string;
  senderId: string | null;
  senderName: string | null;
  kind: string | null;
  content: string | null;
  original: any;
  meta: any;
  thumbUri: string | null;
  translatedText: string | null;
  messageUid?: string | null;
  message_uid?: string | null;
  clientMsgId?: string | null;
  client_msg_id?: string | null;
};

const __replyTargetCache = new Map<string, ReplyTargetLite>();
const __replyTargetInflight = new Map<string, Promise<ReplyTargetLite | null>>();

function looksNumericId(id: string) {
  return /^[0-9]+$/.test(String(id ?? '').trim());
}

export function readReplyTargetCache(replyId: string): ReplyTargetLite | null {
  return __replyTargetCache.get(String(replyId ?? '').trim()) ?? null;
}

export function primeReplyTargetCache(replyId: string, target: ReplyTargetLite | null) {
  const rid = String(replyId ?? '').trim();
  if (!rid || !target) return;
  __replyTargetCache.set(rid, target);
}

export async function fetchReplyTargetLiteCached(replyId: string): Promise<ReplyTargetLite | null> {
  const rid = String(replyId ?? '').trim();
  if (!rid) return null;
  const cached = __replyTargetCache.get(rid);
  if (cached) return cached;
  const inflight = __replyTargetInflight.get(rid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      let q = supabase
        .from('chat_messages')
        .select(
          'id, message_uid, client_msg_id, sender_id, sender_name, kind, type, content, original, meta, metadata, thumb_uri, thumbnail, thumb, translated_text',
        )
        .limit(1);
      q = looksNumericId(rid)
        ? q.eq('id', rid)
        : q.or(`message_uid.eq.${rid},client_msg_id.eq.${rid}`);
      const { data, error } = await q;
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : (data as any);
      if (!row) return null;
      const out: ReplyTargetLite = {
        id: String(row.message_uid ?? row.id ?? row.client_msg_id ?? rid),
        messageUid: typeof row.message_uid === 'string' ? row.message_uid : null,
        message_uid: typeof row.message_uid === 'string' ? row.message_uid : null,
        clientMsgId: typeof row.client_msg_id === 'string' ? row.client_msg_id : null,
        client_msg_id: typeof row.client_msg_id === 'string' ? row.client_msg_id : null,
        senderId: String(row.sender_id ?? '').trim() || null,
        senderName: typeof row.sender_name === 'string' ? row.sender_name : null,
        kind:
          (typeof row.kind === 'string' ? row.kind : null) ||
          (typeof row.type === 'string' ? row.type : null),
        content: typeof row.content === 'string' ? row.content : null,
        original: row.original ?? null,
        meta: row.meta ?? row.metadata ?? null,
        thumbUri:
          (typeof row.thumb_uri === 'string' && row.thumb_uri.trim().length ? row.thumb_uri.trim() : null) ||
          (typeof row.thumbnail === 'string' && row.thumbnail.trim().length ? row.thumbnail.trim() : null) ||
          (typeof row.thumb === 'string' && row.thumb.trim().length ? row.thumb.trim() : null),
        translatedText: typeof row.translated_text === 'string' ? row.translated_text : null,
      };
      __replyTargetCache.set(rid, out);
      return out;
    } catch {
      return null;
    } finally {
      __replyTargetInflight.delete(rid);
    }
  })();

  __replyTargetInflight.set(rid, p);
  return p;
}

type HookArgs = {
  replyId: string | null;
  scrollingRef?: React.MutableRefObject<boolean>;
  injectedReplyTarget?: ReplyTargetLite | null;
  disableFetch?: boolean;
};

export function useReplyTargetLite(
  replyIdOrArgs: string | null | HookArgs,
  scrollingRefLegacy?: React.MutableRefObject<boolean>,
) {
  const args: HookArgs =
    typeof replyIdOrArgs === 'string' || replyIdOrArgs == null
      ? { replyId: replyIdOrArgs, scrollingRef: scrollingRefLegacy }
      : replyIdOrArgs;

  const { replyId, injectedReplyTarget } = args;

  return useMemo<ReplyTargetLite | null>(() => {
    if (injectedReplyTarget !== undefined) return injectedReplyTarget ?? null;
    if (!replyId) return null;
    return readReplyTargetCache(replyId) ?? null;
  }, [injectedReplyTarget, replyId]);
}
