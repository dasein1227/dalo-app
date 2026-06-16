export const INLINE_SEARCH_BAR_HEIGHT = 52;
export const OLDER_CURSOR_RETRY_COOLDOWN_MS = 8000;
// 초기 head는 30을 유지하고, 과거 스크롤 서버 보강은 더 크게 당겨 천장 도달 전 로컬 여유분을 만든다.
export const OLDER_SERVER_PREFETCH_LIMIT = 60;
export const OLDER_PREFETCH_INTENT_EVENT = "chat:olderPrefetchIntent";
export const OLDER_PREFETCH_MIN_INTERVAL_MS = 1200;
export const OLDER_PREFETCH_CURSOR_RETRY_COOLDOWN_MS = 8000;
export const OLDER_PREFETCH_LOCAL_REMAINING_LOW = 120;
export const OLDER_PREFETCH_CACHE_PAD = 160;
