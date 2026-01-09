// src/lib/chatDB/dbTrace.ts
// WatermelonDB queue가 "어디서 멈추는지" 찾기 위한 강제 트레이서.
// - write/read 시작/종료 로그
// - 3.5초 이상 걸리면 경고 + stack 출력

import { database } from '@/lib/chatDB/database';

const TIMEOUT_MS = 3500;

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function stackTop(maxLines = 8) {
  const s = new Error().stack ?? '';
  return s
    .split('\n')
    .slice(2, 2 + maxLines)
    .map((l) => l.trim())
    .join(' | ');
}

async function runWithWatchdog<T>(
  type: 'READ' | 'WRITE',
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = Math.random().toString(16).slice(2, 8);
  const start = Date.now();
  const stack = stackTop();

  console.log(`[DB:${type}] start #${id} ${label} @${stamp()}`);
  let timer: any = null;

  try {
    timer = setTimeout(() => {
      console.warn(
        `[DB:${type}] TIMEOUT #${id} ${label} > ${TIMEOUT_MS}ms (elapsed=${Date.now() - start}ms) stack=${stack}`,
      );
    }, TIMEOUT_MS);

    const out = await fn();

    console.log(
      `[DB:${type}] done  #${id} ${label} (ms=${Date.now() - start}) @${stamp()}`,
    );
    return out;
  } catch (e) {
    console.error(`[DB:${type}] error #${id} ${label}`, e, `stack=${stack}`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dbRead<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return runWithWatchdog('READ', label, () => database.read(fn));
}

export async function dbWrite<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return runWithWatchdog('WRITE', label, () => database.write(fn));
}
