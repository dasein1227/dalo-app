// src/lib/chatDelete/deleteMineTombstones.ts
//
// "나에게만 삭제"는 로컬에서 물리 삭제되므로, 서버 pull / realtime으로 메시지가 다시 와도
// 해당 메시지가 로컬에 "부활"하지 않도록 tombstone(차단 목록)을 유지한다.
//
// ✅ 옵션 A 적용:
// - 서버: public.chat_message_deletions(user_id, room_id, message_id, deleted_at)
// - 클라: AsyncStorage 캐시 + 서버 tombstone 병합(SSOT)
// - pull/realtime upsert 전에 tombstone 체크로 부활 차단
//
// ✅ 운영 안전장치:
// - TTL(기본 30일) + MAX_ITEMS 상한으로 무한 증가 방지
// - 네트워크 실패 시에도 로컬 캐시로 부활은 막는다(best-effort)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'chat:delete_mine_tombstones:v2';

// 운영 안전 범위: 너무 커지면 성능/저장공간 문제 → 상한 + TTL
const MAX_ITEMS = 4000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type MapShape = Record<string, number>; // messageId(string) -> deletedAtMs(number)

let _loaded = false;
let _map: MapShape = {};
let _loadPromise: Promise<void> | null = null;

function nowMs() {
  return Date.now();
}

function prune(map: MapShape): MapShape {
  const t = nowMs();

  // 1) TTL 제거
  const kept: [string, number][] = Object.entries(map)
    .map(([id, ts]) => [String(id), Number(ts)] as [string, number])
    .filter(([id, ts]) => id.length > 0 && Number.isFinite(ts) && ts > 0 && t - ts <= TTL_MS);

  // 2) 개수 상한(최근순 유지)
  kept.sort((a, b) => b[1] - a[1]);
  const sliced = kept.slice(0, MAX_ITEMS);

  const out: MapShape = {};
  for (const [id, ts] of sliced) out[id] = ts;
  return out;
}

async function persist() {
  try {
    _map = prune(_map);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_map));
  } catch {
    // best-effort
  }
}

function isoToMs(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function mergeServerRows(rows: any[]) {
  for (const r of rows ?? []) {
    const id = String(r?.message_id ?? '').trim();
    if (!id) continue;

    const ms = isoToMs(r?.deleted_at);
    if (!ms) continue;

    const prev = _map[id] ?? 0;
    if (!prev || ms > prev) _map[id] = ms;
  }
}

async function fetchServerTombstones() {
  // RLS로 auth.uid()의 row만 반환됨
  const { data, error } = await supabase
    .from('chat_message_deletions')
    .select('message_id, deleted_at')
    .order('deleted_at', { ascending: false })
    .limit(MAX_ITEMS);

  if (error) return [];
  return (data ?? []) as any[];
}

/**
 * ✅ 최초 1회 로드:
 * 1) AsyncStorage 캐시 로드
 * 2) 서버 tombstone fetch → 캐시에 병합(SSOT)
 * 3) prune + persist
 */
export async function ensureDeleteMineTombstonesLoaded() {
  if (_loaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      // 1) local cache
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') _map = parsed as MapShape;
        }
      } catch {
        // ignore
      }

      _map = prune(_map);

      // 2) server merge (best-effort)
      try {
        const rows = await fetchServerTombstones();
        mergeServerRows(rows);
      } catch {
        // ignore
      }

      // 3) prune + persist
      _map = prune(_map);
      await persist();
    } finally {
      _loaded = true;
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/**
 * ✅ 강제 refresh(서버 재조회)
 */
export async function refreshDeleteMineTombstones() {
  await ensureDeleteMineTombstonesLoaded();
  try {
    const rows = await fetchServerTombstones();
    mergeServerRows(rows);
    _map = prune(_map);
    persist(); // background
  } catch {
    // ignore
  }
}

/**
 * ✅ 로컬 tombstone 기록(즉시 부활 방지용)
 */
export async function markDeletedMine(messageId: string) {
  const id = String(messageId ?? '').trim();
  if (!id) return;

  await ensureDeleteMineTombstonesLoaded();

  _map[id] = nowMs();
  persist(); // best-effort
}

export async function unmarkDeletedMine(messageId: string) {
  const id = String(messageId ?? '').trim();
  if (!id) return;

  await ensureDeleteMineTombstonesLoaded();

  if (_map[id] != null) {
    delete _map[id];
    persist();
  }
}

export async function isDeletedMine(messageId: string): Promise<boolean> {
  const id = String(messageId ?? '').trim();
  if (!id) return false;

  await ensureDeleteMineTombstonesLoaded();

  const ts = _map[id];
  if (!ts) return false;

  const t = nowMs();
  if (t - ts > TTL_MS) {
    delete _map[id];
    persist();
    return false;
  }
  return true;
}

// ✅ hot path: pull/upsert에서 빠르게 쓰기 위한 sync getter (load는 외부에서 보장)
export function isDeletedMineSync(messageId: string): boolean {
  const id = String(messageId ?? '').trim();
  if (!id) return false;

  const ts = _map[id];
  if (!ts) return false;

  return nowMs() - ts <= TTL_MS;
}

/**
 * ✅ 옵션 A 핵심 API: 서버 tombstone upsert
 * - "나에게만 삭제" 실행 시 이 함수 호출
 * - RLS로 user_id는 auth.uid()로 강제(클라에서 user_id 넣지 않음)
 */
export async function markDeletedMineServer(args: {
  roomId: number;
  messageId: number | string;
}) {
  const room_id = Number(args.roomId);
  const message_id_str = String(args.messageId ?? '').trim();

  if (!Number.isFinite(room_id) || room_id <= 0) return;
  if (!message_id_str) return;

  // ✅ 즉시 부활 방지(로컬 먼저)
  await markDeletedMine(message_id_str);

  // bigint인 경우 number로, 아니면 string으로 보내도 됨
  const message_id: any = Number.isFinite(Number(message_id_str)) ? Number(message_id_str) : message_id_str;

  try {
    const { error } = await supabase
      .from('chat_message_deletions')
      .upsert(
        {
          room_id,
          message_id,
          deleted_at: new Date().toISOString(),
        } as any,
        { onConflict: 'user_id,message_id' },
      );

    // 서버 실패해도 로컬 tombstone이 있으니 "부활"은 막는다.
    if (error) {
      // best-effort
    }
  } catch {
    // best-effort
  }
}
