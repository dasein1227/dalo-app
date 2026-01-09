// src/lib/chatSync/pull.ts

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import {
  ensureDeleteMineTombstonesLoaded,
  isDeletedMineSync,
} from '@/lib/chatDelete/deleteMineTombstones';
import Message from '@/lib/chatDB/models/Message';
import { Q } from '@nozbe/watermelondb';

export type ChatMessageRow = {
  id: number | string;
  room_id: number;
  sender_id: string;

  room_seq?: number | null;

  // ⚠️ DB가 JSONB로 내려오는 환경이 있으니 any 허용 후 아래에서 문자열로 정규화
  original: any | null;
  content: any | null;

  translated_text?: any | null;

  kind: string | null;
  is_notice: boolean | null;

  source_lang: string | null;
  sender_selected_tier: string | null;
  max_generated_tier: string | null;

  client_msg_id?: string | null;
  created_at: string; // ISO

  // ✅ moment/delete
  delete_at?: string | null;
  moment_config?: any | null;

  link_preview?: any | null;
  link_preview_url?: string | null;
  link_preview_status?: string | null;
};

// -------------------------------------------------------------------
// 기존 유틸
// -------------------------------------------------------------------
function toMs(iso: string) {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toMsOrNull(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;

  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;

  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toStrOrNull(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length ? v : ''; // 빈 문자열도 허용
  }
  // JSONB object -> string으로 저장 (Watermelon string 컬럼 보호)
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

// dedupe에서 쓰는 텍스트 정규화: JSONB면 내부 텍스트를 최대한 뽑는다
function normText(v: any): string {
  if (typeof v === 'string') return v.trim();
  if (!v || typeof v !== 'object') return '';

  const cands = [
    (v as any).text,
    (v as any).content,
    (v as any).message,
    (v as any).body,
    (v as any).original_text,
    (v as any).text_original,
    (v as any).originalText,
  ];
  for (const x of cands) {
    if (typeof x === 'string' && x.trim().length) return x.trim();
  }

  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

function toPreviewString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function extractPreviewUrlFromPreview(v: any): string | null {
  if (v == null) return null;

  if (typeof v === 'object' && typeof (v as any).url === 'string') {
    const u = String((v as any).url).trim();
    return u.length ? u : null;
  }

  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      if (o && typeof o === 'object' && typeof (o as any).url === 'string') {
        const u = String((o as any).url).trim();
        return u.length ? u : null;
      }
    } catch {}
  }

  return null;
}

function normalizeStatus(s: any): 'none' | 'pending' | 'ready' | 'error' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'pending') return 'pending';
  if (v === 'ready') return 'ready';
  if (v === 'error') return 'error';
  return 'none';
}

// ✅ reply prefix 유틸
function splitReplyPrefix(v: any): { replyId: string | null; text: string } {
  const raw = typeof v === 'string' ? v : '';
  const m = raw.match(/^\s*\[reply:([^\]]+)\]\s*/i);
  if (!m) return { replyId: null, text: raw };
  const replyId = String(m[1] ?? '').trim() || null;
  const text = raw.replace(/^\s*\[reply:[^\]]+\]\s*/i, '');
  return { replyId, text };
}

function attachReplyPrefix(replyId: string | null, text: string) {
  const t = String(text ?? '');
  if (!replyId) return t;
  const cur = splitReplyPrefix(t);
  if (cur.replyId) return t;
  return `[reply:${replyId}] ${t}`;
}

type DedupeResult = {
  ops: any[];
  matchedByClientMsgId: Map<string, any>;
  matchedByServerId: Map<string, any>;
};

/**
 * ✅ 서버 rows와 매칭되는 local_* 메시지들을 찾아 "삭제 준비" + "prefix 보존용 매칭"을 함께 반환
 */
async function collectLocalDedupe(
  collection: any,
  rows: ChatMessageRow[],
): Promise<DedupeResult> {
  const ops: any[] = [];
  const deleteIds = new Set<string>();

  const matchedByClientMsgId = new Map<string, any>();
  const matchedByServerId = new Map<string, any>();

  const pushDelete = (m: any) => {
    if (!m) return;
    const st = String((m as any)?._raw?._status ?? '');
    if (st === 'deleted') return;

    const id = String((m as any).id ?? '');
    if (!id) return;
    if (deleteIds.has(id)) return;

    deleteIds.add(id);
    ops.push((m as any).prepareMarkAsDeleted());
  };

  if (!rows.length) return { ops, matchedByClientMsgId, matchedByServerId };

  // A) client_msg_id 매칭
  const clientIds = rows
    .map((r) => r.client_msg_id)
    .filter((id): id is string => !!id);

  if (clientIds.length > 0) {
    const locals = await collection
      .query(
        Q.where('client_msg_id', Q.oneOf(clientIds)),
        Q.where('id', Q.like('local_%')),
      )
      .fetch();

    for (const m of locals as any[]) {
      const cmid = String((m as any).client_msg_id ?? '').trim();
      if (cmid) matchedByClientMsgId.set(cmid, m);
      pushDelete(m);
    }
  }

  // B) fallback: 내용/시간 매칭
  const rowsNoClientId = rows.filter((r) => !r.client_msg_id);
  if (!rowsNoClientId.length) return { ops, matchedByClientMsgId, matchedByServerId };

  const roomIds = Array.from(new Set(rowsNoClientId.map((r) => r.room_id)));
  for (const roomId of roomIds) {
    const locals = await collection
      .query(Q.where('room_id', roomId), Q.where('id', Q.like('local_%')))
      .fetch();

    if (!locals.length) continue;

    const localsArr = locals as any[];
    const targets = rowsNoClientId.filter((r) => r.room_id === roomId);

    for (const r of targets) {
      const rMs = toMs(r.created_at);
      if (!rMs) continue;

      const rTextA = normText(r.original);
      const rTextB = normText(r.content);

      const candidates = localsArr.filter((m) => {
        const st = String((m as any)?._raw?._status ?? '');
        if (st === 'deleted') return false;

        const mId = String((m as any).id ?? '');
        if (deleteIds.has(mId)) return false;

        const mSender = String((m as any).sender_id ?? '');
        const mMs = Number((m as any).created_at ?? 0);
        if (mSender !== r.sender_id) return false;
        if (!Number.isFinite(mMs)) return false;

        return Math.abs(mMs - rMs) <= 10_000;
      });

      if (!candidates.length) continue;

      const hit = candidates.find((m) => {
        const mOrig = normText((m as any).original);
        const mCont = normText((m as any).content);

        if (rTextA && (mOrig === rTextA || mCont === rTextA)) return true;
        if (rTextB && (mOrig === rTextB || mCont === rTextB)) return true;

        const keyA = rTextA.length >= 6 ? rTextA : '';
        const keyB = rTextB.length >= 6 ? rTextB : '';

        if (keyA && (mOrig.includes(keyA) || mCont.includes(keyA))) return true;
        if (keyB && (mOrig.includes(keyB) || mCont.includes(keyB))) return true;

        return false;
      });

      if (hit) {
        matchedByServerId.set(String(r.id), hit);
        pushDelete(hit);
      }
    }
  }

  return { ops, matchedByClientMsgId, matchedByServerId };
}

// -------------------------------------------------------------------
// Upsert caller tagging (debug-friendly)
// -------------------------------------------------------------------
function normalizeSourceTag(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  // keep it log-friendly
  return s
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9._:\/-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

function inferCallerTag(): string {
  try {
    const s = new Error().stack ?? '';
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);

    const exclude = [
      'src/lib/chatSync/pull',
      'src\\lib\\chatSync\\pull',
      '/src/lib/chatSync/pull',
      '\\src\\lib\\chatSync\\pull',
      'node_modules',
      'watermelondb',
    ];

    const hit = lines.find((l) => {
      const hasSrc = l.includes('/src/') || l.includes('\\src\\') || l.includes('src/');
      if (!hasSrc) return false;
      if (exclude.some((k) => l.includes(k))) return false;
      return true;
    });

    if (!hit) return '';
    // extract "src/..." portion when possible
    const m1 = hit.match(/([A-Za-z]:\\.*?\\src\\.*?\.(?:ts|tsx|js|jsx)):(\d+):(\d+)/);
    if (m1) {
      const full = String(m1[1] ?? '').replace(/\\/g, '/');
      const rel = full.split('/src/')[1] ?? full;
      return `caller:${rel}:${m1[2]}:${m1[3]}`;
    }

    const m2 = hit.match(/((?:.*?\/)?src\/.*?\.(?:ts|tsx|js|jsx)):(\d+):(\d+)/);
    if (m2) {
      const full = String(m2[1] ?? '');
      const rel = full.split('src/')[1] ?? full;
      return `caller:${rel}:${m2[2]}:${m2[3]}`;
    }

    return normalizeSourceTag(hit);
  } catch {
    return '';
  }
}

/**
 * ✅ Atomic Sync
 */
export async function upsertMessagesAtomic(rows: ChatMessageRow[], source?: string) {
  if (!rows.length) return;

  const inferred = source ? '' : inferCallerTag();
  const tag = normalizeSourceTag(source) || normalizeSourceTag(inferred) || 'unknown';

  await ensureDeleteMineTombstonesLoaded();

  const collection = database.get<Message>('messages');

  const writeFn = async function upsertMessagesAtomic_write() {
    const batchOps: any[] = [];

    // A) 로컬 중복 삭제 + 매칭맵 확보(Reply prefix 보존용)
    const dedupe = await collectLocalDedupe(collection, rows);
    batchOps.push(...dedupe.ops);

    // B) 서버 메시지 upsert 준비
    const serverIds = rows.map((r) => String(r.id));
    const existingMsgs = serverIds.length
      ? await collection.query(Q.where('id', Q.oneOf(serverIds))).fetch()
      : [];
    const existingMap = new Map((existingMsgs as any[]).map((m) => [String((m as any).id), m]));

    for (const row of rows) {
      const idStr = String(row.id);

      // ✅ 서버 delete_at -> 로컬(ms)
      const deleteAtMs = toMsOrNull((row as any).delete_at ?? null);
      const isExpiredNow = deleteAtMs != null && deleteAtMs > 0 && deleteAtMs <= Date.now();

      // ✅ '나에게만 삭제' 부활 방지
      if (isDeletedMineSync(idStr)) {
        const ex = existingMap.get(idStr) as any | undefined;
        if (ex) batchOps.push(ex.prepareDestroyPermanently());
        continue;
      }

      // ✅ 만료 → 로컬에서 제거
      if (isExpiredNow) {
        const ex = existingMap.get(idStr) as any | undefined;
        if (ex) batchOps.push(ex.prepareDestroyPermanently());
        continue;
      }

      const existing = existingMap.get(idStr) as any | undefined;

      const createdMs = toMs(row.created_at);

      const lpStr = toPreviewString(row.link_preview ?? null);

      const serverUrl =
        typeof row.link_preview_url === 'string' && row.link_preview_url.trim().length
          ? row.link_preview_url.trim()
          : null;

      const parsedUrl = extractPreviewUrlFromPreview(row.link_preview ?? null);
      const lpUrl = serverUrl || parsedUrl;

      const serverStatus = row.link_preview_status ? normalizeStatus(row.link_preview_status) : null;
      const lpStatus: 'none' | 'pending' | 'ready' | 'error' =
        serverStatus ?? (lpUrl ? 'ready' : 'none');

      // ✅ 문자열 정규화 (JSONB 방어)
      const rowOriginalStr = toStrOrNull(row.original);
      const rowContentStr = toStrOrNull(row.content);
      const rowTranslatedStr =
        (row as any).translated_text !== undefined
          ? toStrOrNull((row as any).translated_text)
          : undefined;

      // ✅ reply prefix 보존용 local match
      const localMatch =
        (row.client_msg_id ? dedupe.matchedByClientMsgId.get(String(row.client_msg_id)) : null) ||
        dedupe.matchedByServerId.get(idStr) ||
        null;

      const localMatchContent = localMatch ? String((localMatch as any).content ?? '') : '';
      const localMatchOriginal = localMatch ? String((localMatch as any).original ?? '') : '';

      // ✅ "서버가 reply prefix를 잃어버린 경우" 보정
      const makeMergedContent = (serverContent: string | null, existingContent: string) => {
        const ex = splitReplyPrefix(existingContent);
        const srv = splitReplyPrefix(serverContent ?? '');
        if (ex.replyId && !srv.replyId) {
          return attachReplyPrefix(ex.replyId, (serverContent ?? '').trim());
        }
        return serverContent;
      };

      const makeMergedContentFromLocal = (serverContent: string | null) => {
        const lm = splitReplyPrefix(localMatchContent || localMatchOriginal);
        const srv = splitReplyPrefix(serverContent ?? '');
        if (lm.replyId && !srv.replyId) {
          return attachReplyPrefix(lm.replyId, (serverContent ?? '').trim());
        }
        return serverContent;
      };

      if (existing) {
        batchOps.push(
          existing.prepareUpdate((m: any) => {
            m.room_id = row.room_id;
            m.sender_id = row.sender_id;

            if (rowOriginalStr != null) m.original = rowOriginalStr;

            const exContent = typeof m.content === 'string' ? m.content : '';
            const merged = makeMergedContent(rowContentStr, exContent);
            m.content = merged;

            m.kind = row.kind ?? 'text';
            m.is_notice = row.is_notice ?? false;

            if (createdMs) m.created_at = createdMs;

            (m as any).delete_at = deleteAtMs;

            if (row.room_seq != null) {
              const seq = Number(row.room_seq);
              m.room_seq = Number.isFinite(seq) ? Math.trunc(seq) : null;
            } else {
              m.room_seq = null;
            }

            if (rowTranslatedStr !== undefined) {
              m.translated_text = rowTranslatedStr;
            }

            if (row.client_msg_id) m.client_msg_id = row.client_msg_id;

            m.link_preview = lpStr;
            m.link_preview_url = lpUrl;
            m.link_preview_status = lpStatus;
          }),
        );
      } else {
        const mergedForCreate = makeMergedContentFromLocal(rowContentStr);

        batchOps.push(
          collection.prepareCreate((m: any) => {
            m._raw.id = idStr;

            m.room_id = row.room_id;
            m.sender_id = row.sender_id;

            m.original = rowOriginalStr;
            m.content = mergedForCreate;

            m.kind = row.kind ?? 'text';
            m.is_notice = row.is_notice ?? false;

            m.created_at = createdMs;

            (m as any).delete_at = deleteAtMs;

            if (row.room_seq != null) {
              const seq = Number(row.room_seq);
              m.room_seq = Number.isFinite(seq) ? Math.trunc(seq) : null;
            } else {
              m.room_seq = null;
            }

            if (rowTranslatedStr !== undefined) {
              m.translated_text = rowTranslatedStr;
            }

            if (row.client_msg_id) m.client_msg_id = row.client_msg_id;

            m.link_preview = lpStr;
            m.link_preview_url = lpUrl;
            m.link_preview_status = lpStatus;
          }),
        );
      }
    }

    if (batchOps.length > 0) {
      await database.batch(...batchOps);
    }
  };
  (writeFn as any).__label = `upsert:${tag}`;
  await database.write(writeFn);
}

export async function upsertMessages(rows: ChatMessageRow[], source?: string) {
  return upsertMessagesAtomic(rows, source);
}

export async function pullInitialMessages(roomId: number) {
  const nowIso = new Date().toISOString();

  let data: any[] | null = null;
  let error: any = null;

  {
    const res = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .or(`delete_at.is.null,delete_at.gt.${nowIso}`)
      .order('room_seq', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);

    data = res.data as any[] | null;
    error = res.error;
  }

  if (error) {
    const res2 = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .or(`delete_at.is.null,delete_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(50);

    data = res2.data as any[] | null;
    error = res2.error;
  }

  if (error) {
    console.warn('[pullInitialMessages] error:', error);
    return;
  }

  const rows = (data ?? []) as ChatMessageRow[];
  const nowMs = Date.now();
  const filtered = rows.filter((r) => {
    const d = toMsOrNull((r as any).delete_at ?? null);
    return d == null || d <= 0 || d > nowMs;
  });

  await upsertMessagesAtomic(filtered, 'pullInitialMessages');
}

export async function pullOlderMessagesBySeq(roomId: number, beforeSeq: number) {
  const nowIso = new Date().toISOString();

  const seq = Math.max(0, Math.trunc(Number(beforeSeq ?? 0) || 0));
  if (!seq) return 0;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .or(`delete_at.is.null,delete_at.gt.${nowIso}`)
    .lt('room_seq', seq)
    .order('room_seq', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[pullOlderMessagesBySeq] error:', error);
    return 0;
  }

  const rows = (data ?? []) as ChatMessageRow[];
  const nowMs = Date.now();
  const filtered = rows.filter((r) => {
    const d = toMsOrNull((r as any).delete_at ?? null);
    return d == null || d <= 0 || d > nowMs;
  });

  await upsertMessagesAtomic(filtered, 'pullOlderMessagesBySeq');
  return filtered.length;
}

export async function pullOlderMessages(roomId: number, before: string) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .or(`delete_at.is.null,delete_at.gt.${nowIso}`)
    .lt('created_at', before)
    .order('room_seq', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[pullOlderMessages] error:', error);
    return 0;
  }

  const rows = (data ?? []) as ChatMessageRow[];
  const nowMs = Date.now();
  const filtered = rows.filter((r) => {
    const d = toMsOrNull((r as any).delete_at ?? null);
    return d == null || d <= 0 || d > nowMs;
  });

  await upsertMessagesAtomic(filtered, 'pullOlderMessages');
  return filtered.length;
}
