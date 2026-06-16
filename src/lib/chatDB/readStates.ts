// src/lib/chatDB/readStates.ts
import { Q } from '@nozbe/watermelondb';
import { database } from '@/lib/chatDB/database';
import RoomReadState from '@/lib/chatDB/models/RoomReadState';

type AnyCollection = any;

export type RoomReadStateInput = {
  room_id: number | string | null | undefined;
  user_id: string | null | undefined;
  last_read_seq?: number | string | null;
  is_active?: boolean | null;
  updated_at?: number | string | Date | null;
};

function toRoomId(v: RoomReadStateInput['room_id']): number | null {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toUserId(v: RoomReadStateInput['user_id']): string | null {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
}

function toSeq(v: RoomReadStateInput['last_read_seq']): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function toMs(v: RoomReadStateInput['updated_at']): number {
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : Date.now();
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return Date.now();
    return v < 10_000_000_000 ? Math.trunc(v * 1000) : Math.trunc(v);
  }
  if (typeof v === 'string') {
    const asNum = Number(v);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 10_000_000_000 ? Math.trunc(asNum * 1000) : Math.trunc(asNum);
    }
    const ms = Date.parse(v);
    return Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : Date.now();
  }
  return Date.now();
}

function keyOf(roomId: number, userId: string): string {
  return `${roomId}:${userId}`;
}

function normalizeRows(rows: RoomReadStateInput[]): Array<{
  room_id: number;
  user_id: string;
  last_read_seq: number;
  is_active: boolean;
  updated_at: number;
}> {
  const map = new Map<string, {
    room_id: number;
    user_id: string;
    last_read_seq: number;
    is_active: boolean;
    updated_at: number;
  }>();

  for (const row of rows ?? []) {
    const roomId = toRoomId(row.room_id);
    const userId = toUserId(row.user_id);
    if (roomId == null || !userId) continue;

    const next = {
      room_id: roomId,
      user_id: userId,
      last_read_seq: toSeq(row.last_read_seq),
      is_active: row.is_active !== false,
      updated_at: toMs(row.updated_at),
    };

    const key = keyOf(roomId, userId);
    const prev = map.get(key);
    if (!prev || next.last_read_seq >= prev.last_read_seq || next.updated_at >= prev.updated_at) {
      map.set(key, {
        ...next,
        last_read_seq: Math.max(prev?.last_read_seq ?? 0, next.last_read_seq),
        updated_at: Math.max(prev?.updated_at ?? 0, next.updated_at),
      });
    }
  }

  return Array.from(map.values());
}

export async function prepareRoomReadStateUpserts(
  collection: AnyCollection,
  rows: RoomReadStateInput[],
): Promise<any[]> {
  const normalized = normalizeRows(rows);
  if (!normalized.length) return [];

  const roomIds = Array.from(new Set(normalized.map((r) => r.room_id)));
  const userIds = Array.from(new Set(normalized.map((r) => r.user_id)));

  const existingRows = await collection
    .query(Q.where('room_id', Q.oneOf(roomIds)), Q.where('user_id', Q.oneOf(userIds)))
    .fetch();

  const existingByKey = new Map<string, any[]>();
  for (const row of existingRows ?? []) {
    const roomId = toRoomId((row as any).room_id ?? (row as any)._raw?.room_id);
    const userId = toUserId((row as any).user_id ?? (row as any)._raw?.user_id);
    if (roomId == null || !userId) continue;
    const key = keyOf(roomId, userId);
    const list = existingByKey.get(key) ?? [];
    list.push(row);
    existingByKey.set(key, list);
  }

  const ops: any[] = [];
  for (const next of normalized) {
    const key = keyOf(next.room_id, next.user_id);
    const existing = existingByKey.get(key) ?? [];

    if (existing.length > 0) {
      for (const row of existing) {
        const prevSeq = toSeq((row as any).last_read_seq ?? (row as any)._raw?.last_read_seq);
        const prevActive = (row as any).is_active ?? (row as any)._raw?.is_active;
        const prevUpdated = toMs((row as any).updated_at ?? (row as any)._raw?.updated_at ?? null);
        const mergedSeq = Math.max(prevSeq, next.last_read_seq);
        const mergedUpdated = Math.max(prevUpdated, next.updated_at);

        if (prevSeq === mergedSeq && prevActive === next.is_active && prevUpdated === mergedUpdated) {
          continue;
        }

        ops.push(
          row.prepareUpdate((r: any) => {
            r.room_id = next.room_id;
            r.user_id = next.user_id;
            r.last_read_seq = mergedSeq;
            r.is_active = next.is_active;
            r.updated_at = mergedUpdated;
          }),
        );
      }
      continue;
    }

    ops.push(
      collection.prepareCreate((r: any) => {
        r.room_id = next.room_id;
        r.user_id = next.user_id;
        r.last_read_seq = next.last_read_seq;
        r.is_active = next.is_active;
        r.updated_at = next.updated_at;
      }),
    );
  }

  return ops;
}

export async function upsertRoomReadStates(rows: RoomReadStateInput[]): Promise<void> {
  const normalized = normalizeRows(rows);
  if (!normalized.length) return;

  await database.write(async () => {
    const collection = database.collections.get<RoomReadState>('room_read_states');
    const ops = await prepareRoomReadStateUpserts(collection, normalized);
    if (ops.length > 0) await database.batch(...ops);
  });
}
