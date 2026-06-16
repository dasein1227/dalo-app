import { supabase } from '../supabase';
import {
  CURRENT_GROUP_CACHE_VERSION,
  getCachedGroups,
  getGroupCacheMeta,
  setCachedGroups,
  setGroupCacheMeta,
} from './groupCache';
import { mapServerGroupsToCache, type CachedGroupRecord, type ServerGroupRecord } from './groups.mapper';

export const DEFAULT_GROUP_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function shouldRefreshGroupCache(
  lastSyncedAt: number | null,
  maxAgeMs: number = DEFAULT_GROUP_CACHE_MAX_AGE_MS,
) {
  if (!lastSyncedAt) return true;
  return Date.now() - lastSyncedAt >= maxAgeMs;
}

function hasSearchableCache(groups: CachedGroupRecord[]) {
  if (!groups.length) return false;
  return groups.every((group) => typeof group.search_text === 'string' && group.search_text.trim().length > 0);
}

export async function fetchFriendGroupsRemote(): Promise<CachedGroupRecord[]> {
  const { data, error } = await supabase.rpc('list_friend_groups_v1');
  if (error) throw error;
  return mapServerGroupsToCache((data ?? []) as ServerGroupRecord[]);
}

export async function syncGroupCache(options?: {
  force?: boolean;
  maxAgeMs?: number;
}) {
  const force = !!options?.force;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_GROUP_CACHE_MAX_AGE_MS;

  const meta = await getGroupCacheMeta();
  const cached = await getCachedGroups();
  const stale = shouldRefreshGroupCache(meta.lastSyncedAt, maxAgeMs);
  const cacheMissingSearchText = !hasSearchableCache(cached);
  const versionMismatch = meta.version !== CURRENT_GROUP_CACHE_VERSION;

  if (!force && cached.length > 0 && !stale && !cacheMissingSearchText && !versionMismatch) {
    return cached;
  }

  const remote = await fetchFriendGroupsRemote();
  await setCachedGroups(remote);
  await setGroupCacheMeta({
    version: CURRENT_GROUP_CACHE_VERSION,
    lastSyncedAt: Date.now(),
  });

  return remote;
}

export async function getGroupsLocalFirst(options?: {
  maxAgeMs?: number;
  backgroundRefresh?: boolean;
}) {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_GROUP_CACHE_MAX_AGE_MS;
  const backgroundRefresh = options?.backgroundRefresh ?? true;

  const cached = await getCachedGroups();
  const meta = await getGroupCacheMeta();
  const stale = shouldRefreshGroupCache(meta.lastSyncedAt, maxAgeMs);
  const cacheMissingSearchText = !hasSearchableCache(cached);
  const versionMismatch = meta.version !== CURRENT_GROUP_CACHE_VERSION;

  if (cached.length > 0) {
    if (backgroundRefresh && (stale || cacheMissingSearchText || versionMismatch)) {
      void syncGroupCache({ force: true, maxAgeMs }).catch(() => {});
    }
    return cached;
  }

  return syncGroupCache({ force: true, maxAgeMs });
}

export async function forceRefreshGroups() {
  return syncGroupCache({ force: true, maxAgeMs: 0 });
}
