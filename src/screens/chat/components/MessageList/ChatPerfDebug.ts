// src/screens/chat/components/MessageList/ChatPerfDebug.ts
// Development-only lightweight counters for chat scroll performance.
// Disabled by default because scroll/viewability profiling itself can add JS work
// and Metro console pressure during chat scroll testing.
// Enable temporarily with: globalThis.__COONN_CHAT_PERF_ENABLED__ = true

type CounterBucket = Record<string, number>;

declare const __DEV__: boolean;

const ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  Boolean((globalThis as any).__COONN_CHAT_PERF_ENABLED__);

const counters: CounterBucket = Object.create(null);
const maxes: CounterBucket = Object.create(null);
const sums: CounterBucket = Object.create(null);
const samples: CounterBucket = Object.create(null);

let timer: ReturnType<typeof setInterval> | null = null;
let lastFlushAt = Date.now();

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ensureTimer() {
  if (!ENABLED || timer) return;
  timer = setInterval(() => {
    flushChatPerfCounters();
  }, 1000);
}

export function chatPerfHit(name: string, count = 1) {
  if (!ENABLED) return;
  const key = String(name || '').trim();
  if (!key) return;
  counters[key] = (counters[key] ?? 0) + count;
  ensureTimer();
}

export function chatPerfMax(name: string, value: unknown) {
  if (!ENABLED) return;
  const key = String(name || '').trim();
  if (!key) return;
  const n = safeNumber(value);
  maxes[key] = Math.max(maxes[key] ?? 0, n);
  ensureTimer();
}

export function chatPerfSample(name: string, value: unknown) {
  if (!ENABLED) return;
  const key = String(name || '').trim();
  if (!key) return;
  const n = safeNumber(value);
  sums[key] = (sums[key] ?? 0) + n;
  samples[key] = (samples[key] ?? 0) + 1;
  maxes[`${key}.max`] = Math.max(maxes[`${key}.max`] ?? 0, n);
  ensureTimer();
}

export function chatPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function flushChatPerfCounters() {
  if (!ENABLED) return;

  const keys = Object.keys(counters);
  const maxKeys = Object.keys(maxes);
  const sampleKeys = Object.keys(samples);
  if (!keys.length && !maxKeys.length && !sampleKeys.length) return;

  const now = Date.now();
  const elapsed = Math.max(1, now - lastFlushAt);
  lastFlushAt = now;

  const parts: string[] = [`${elapsed}ms`];

  for (const key of keys.sort()) {
    const value = counters[key];
    if (value) parts.push(`${key}=${value}`);
    delete counters[key];
  }

  for (const key of sampleKeys.sort()) {
    const count = samples[key] || 0;
    const sum = sums[key] || 0;
    if (count > 0) parts.push(`${key}.avg=${(sum / count).toFixed(2)}`);
    delete samples[key];
    delete sums[key];
  }

  for (const key of maxKeys.sort()) {
    const value = maxes[key];
    if (value) parts.push(`${key}=${Number(value).toFixed(1)}`);
    delete maxes[key];
  }

  // Keep a single compact line so Metro log remains readable.
  console.log(`[chat-perf] ${parts.join(' | ')}`);
}

export function clearChatPerfCounters() {
  for (const key of Object.keys(counters)) delete counters[key];
  for (const key of Object.keys(maxes)) delete maxes[key];
  for (const key of Object.keys(sums)) delete sums[key];
  for (const key of Object.keys(samples)) delete samples[key];
}
