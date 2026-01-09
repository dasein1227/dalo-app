// src/lib/chatDB/database.ts

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { chatSchema } from './schema';
import migrations from './migrations/index';

import Message from './models/Message';
import Room from './models/Room';
import Profile from './models/Profile';
import MessageTranslation from './models/MessageTranslation';

const adapter = new SQLiteAdapter({
  schema: chatSchema,
  migrations,
  dbName: 'chatdb',
  onSetUpError: (error) => {
    console.error('[DB] onSetUpError', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Message, Room, Profile, MessageTranslation],
});

// -------------------------------------------------------------------
// Global DB read/write tracer (debug)
// -------------------------------------------------------------------
const TIMEOUT_MS = 4000;

// 심볼리케이션/스택 프리뷰 캐시 (로그 폭발 방지)
const _whereSrcCache = new Map<string, string>();
const _pending = new Set<string>();
const _printedPreview = new Set<string>();

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function getStackLines(maxLines = 60) {
  const s = new Error().stack ?? '';
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  // 첫 줄 "Error" 제거
  return lines.slice(1, 1 + maxLines);
}

function pickLabel(args: any[]) {
  const firstArg = args[0];
  if (typeof firstArg === 'function') {
    // 함수명은 익명일 수 있으니 displayName / __label 도 지원
    return (
      (firstArg as any).displayName ||
      (firstArg as any).__label ||
      firstArg.name ||
      'anonymous_fn'
    );
  }
  return 'action';
}

function pickWhereRaw(lines: string[]) {
  const exclude = [
    'wrapRW',
    'getStackLines',
    'pickWhereRaw',
    'trySymbolicate',
    'maybeKickSymbolicate',
    'watermelondb',
    'node_modules',
    'src/lib/chatDB/database',
    'src\\lib\\chatDB\\database',
  ];

  const firstUseful =
    lines.find((l) => !exclude.some((k) => l.includes(k))) ?? lines[0];

  return firstUseful ?? 'unknown';
}

type StackFrameLite = {
  methodName?: string;
  file?: string;
  lineNumber?: number;
  column?: number;
};

function parseStackToFrames(lines: string[]): StackFrameLite[] {
  const frames: StackFrameLite[] = [];

  for (const line of lines) {
    // V8: "at fn (file:line:col)" or "at file:line:col"
    let m = line.match(/^at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/);
    if (m) {
      frames.push({
        methodName: m[1],
        file: m[2],
        lineNumber: Number(m[3]),
        column: Number(m[4]),
      });
      continue;
    }

    m = line.match(/^at\s+(.*?):(\d+):(\d+)$/);
    if (m) {
      frames.push({
        methodName: undefined,
        file: m[1],
        lineNumber: Number(m[2]),
        column: Number(m[3]),
      });
      continue;
    }

    // Hermes(iOS): "fn@file:line:col"
    m = line.match(/^(.*?)@(.*?):(\d+):(\d+)$/);
    if (m) {
      frames.push({
        methodName: m[1],
        file: m[2],
        lineNumber: Number(m[3]),
        column: Number(m[4]),
      });
      continue;
    }
  }

  return frames;
}

function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

function isDatabaseTracerFile(file: string) {
  const f = normalizePath(file);
  return f.includes('/src/lib/chatDB/database.ts');
}

function pickWhereSrcFromSymbolicated(symbolicatedStack: any[]): string | null {
  const stack = Array.isArray(symbolicatedStack) ? symbolicatedStack : [];
  // 1) /src/ 프레임 중에서 database.ts는 제외하고 첫 번째를 선택
  for (const f of stack) {
    const file = String(f?.file ?? '');
    if (!file) continue;

    const nf = normalizePath(file);
    const isSrc =
      nf.includes('/src/') || nf.startsWith('src/') || nf.includes('\\src\\');

    if (!isSrc) continue;
    if (isDatabaseTracerFile(nf)) continue;
    if (nf.includes('/node_modules/')) continue;

    const line =
      f?.lineNumber ?? f?.line ?? f?.line_number ?? f?.lineNo ?? '';
    const col =
      f?.column ?? f?.columnNumber ?? f?.col ?? f?.column_no ?? '';

    // line/col이 비어도 파일만이라도 반환
    const tail = line ? `:${line}${col ? `:${col}` : ''}` : '';
    return `${file}${tail}`;
  }

  // 2) 그래도 없으면 database.ts를 제외한 첫 프레임이라도 반환
  for (const f of stack) {
    const file = String(f?.file ?? '');
    if (!file) continue;
    if (isDatabaseTracerFile(file)) continue;

    const line =
      f?.lineNumber ?? f?.line ?? f?.line_number ?? f?.lineNo ?? '';
    const col =
      f?.column ?? f?.columnNumber ?? f?.col ?? f?.column_no ?? '';
    const tail = line ? `:${line}${col ? `:${col}` : ''}` : '';
    return `${file}${tail}`;
  }

  return null;
}

async function trySymbolicate(rawLines: string[]): Promise<string | null> {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return null;

  try {
    // DEV 전용 내부 API (없으면 null)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sym = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');
    const symbolicateStackTrace = sym?.default ?? sym;
    if (typeof symbolicateStackTrace !== 'function') return null;

    const frames = parseStackToFrames(rawLines).filter((f) => !!f.file);
    if (!frames.length) return null;

    const res = await symbolicateStackTrace(frames);

    // res.stack 또는 res 자체가 stack 배열일 수 있음
    const stack = (res?.stack ?? res) as any[];
    return pickWhereSrcFromSymbolicated(stack);
  } catch {
    return null;
  }
}

function makeKey(whereRaw: string, rawLines: string[]) {
  // whereRaw가 번들이면 같은 위치가 계속 나오므로 상위 몇 줄을 키로 사용
  const head = rawLines.slice(0, 8).join(' | ');
  return `${whereRaw} :: ${head}`;
}

function maybeKickSymbolicate(
  key: string,
  rawLines: string[],
  logPrefix: string,
) {
  if (_whereSrcCache.has(key) || _pending.has(key)) return;
  _pending.add(key);

  setTimeout(async () => {
    try {
      const whereSrc = await trySymbolicate(rawLines);
      if (whereSrc) {
        _whereSrcCache.set(key, whereSrc);
        console.log(`${logPrefix} resolved whereSrc=${whereSrc}`);
      } else {
        // 한번만 raw 스택 프리뷰 출력 (디버깅용)
        if (!_printedPreview.has(key)) {
          _printedPreview.add(key);
          console.log(`${logPrefix} stackPreview=${rawLines.slice(0, 12).join(' | ')}`);
        }
      }
    } finally {
      _pending.delete(key);
    }
  }, 0);
}

function wrapRW<T extends (...args: any[]) => any>(
  type: 'READ' | 'WRITE',
  original: T,
): T {
  const wrapped = (async (...args: any[]) => {
    const id = Math.random().toString(16).slice(2, 8);
    const label = pickLabel(args);

    const rawLines = getStackLines(80);
    const whereRaw = pickWhereRaw(rawLines);
    const framesCount = rawLines.length;

    const key = makeKey(whereRaw, rawLines);
    const knownWhereSrc = _whereSrcCache.get(key);

    const start = Date.now();
    const prefix = `[DB:${type}] #${id} ${label} @${stamp()}`;

    console.log(
      `${prefix} start where=${whereRaw} frames=${framesCount}${
        knownWhereSrc ? ` whereSrc=${knownWhereSrc}` : ''
      }`,
    );

    const shouldSym =
      !knownWhereSrc &&
      (whereRaw === 'unknown' ||
        whereRaw.includes('index.ts.bundle') ||
        whereRaw.includes('index.android.bundle') ||
        whereRaw.includes('main.jsbundle') ||
        whereRaw.includes('.bundle'));

    if (shouldSym) {
      maybeKickSymbolicate(key, rawLines, prefix);
    }

    const timer = setTimeout(() => {
      console.warn(
        `[DB:${type}] TIMEOUT #${id} ${label} > ${TIMEOUT_MS}ms (elapsed=${Date.now() - start}ms) where=${whereRaw}`,
      );
    }, TIMEOUT_MS);

    try {
      const out = await original(...args);
      console.log(
        `[DB:${type}] done  #${id} ${label} (ms=${Date.now() - start}) @${stamp()} where=${whereRaw}${
          knownWhereSrc ? ` whereSrc=${knownWhereSrc}` : ''
        }`,
      );
      return out;
    } catch (e) {
      console.error(
        `[DB:${type}] error #${id} ${label} where=${whereRaw}${
          knownWhereSrc ? ` whereSrc=${knownWhereSrc}` : ''
        }`,
        e,
      );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }) as any;

  return wrapped as T;
}

// Patch once
const anyDb = database as any;
if (!anyDb.__RW_PATCHED__) {
  anyDb.__RW_PATCHED__ = true;

  const originalRead = database.read.bind(database);
  const originalWrite = database.write.bind(database);

  anyDb.read = wrapRW('READ', originalRead);
  anyDb.write = wrapRW('WRITE', originalWrite);

  console.log('[DB] global read/write tracer patched');
}

export default database;
