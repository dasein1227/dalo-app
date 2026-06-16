// src/lib/chatSync/roomVersion.ts

import { BehaviorSubject, type Observable } from 'rxjs';

const RVDBG = false; // ✅ 필요할 때만 true

const subjects = new Map<number, BehaviorSubject<number>>();

function log(...args: any[]) {
  if (!RVDBG) return;
  // eslint-disable-next-line no-console
  console.log('[RV]', ...args);
}

function getSubject(roomId: number): BehaviorSubject<number> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return new BehaviorSubject<number>(0);

  const existing = subjects.get(rid);
  if (existing) return existing;

  const created = new BehaviorSubject<number>(0);
  subjects.set(rid, created);
  log('createSubject', { rid });
  return created;
}

/**
 * bumpRoomVersion(roomId, reason?)
 * - reason을 붙여 "누가 bump쳤는지" 추적
 */
export function bumpRoomVersion(roomId: number, reason?: string) {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return;

  const s = getSubject(rid);
  const next = (s.value ?? 0) + 1;
  s.next(next);
  log('bump', { rid, next, reason: reason ?? 'unknown' });
}

export function observeRoomVersion(roomId: number): Observable<number> {
  const rid = Math.trunc(Number(roomId) || 0);
  log('observe', { rid });
  return getSubject(rid).asObservable();
}

export function getRoomVersion(roomId: number): number {
  const rid = Math.trunc(Number(roomId) || 0);
  return getSubject(rid).value ?? 0;
}
