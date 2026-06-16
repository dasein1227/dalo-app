import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedGroupRecord } from './groups.mapper';

const GROUPS_KEY = 'friends.group_cache.v1.groups';
const META_KEY = 'friends.group_cache.v1.meta';
export const CURRENT_GROUP_CACHE_VERSION = 2;

export type GroupCacheMeta = {
  lastSyncedAt: number | null;
  version: number;
};

const DEFAULT_META: GroupCacheMeta = {
  lastSyncedAt: null,
  version: CURRENT_GROUP_CACHE_VERSION,
};

export async function getCachedGroups(): Promise<CachedGroupRecord[]> {
  const raw = await AsyncStorage.getItem(GROUPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setCachedGroups(groups: CachedGroupRecord[]) {
  await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export async function upsertCachedGroup(group: CachedGroupRecord) {
  const prev = await getCachedGroups();
  const next = [...prev.filter((item) => item.id !== group.id), group].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  );
  await setCachedGroups(next);
}

export async function removeCachedGroup(groupId: number) {
  const prev = await getCachedGroups();
  const next = prev.filter((item) => item.id !== groupId);
  await setCachedGroups(next);
}

export async function clearCachedGroups() {
  await AsyncStorage.multiRemove([GROUPS_KEY, META_KEY]);
}

export async function getGroupCacheMeta(): Promise<GroupCacheMeta> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return DEFAULT_META;
  try {
    const parsed = JSON.parse(raw);
    return {
      lastSyncedAt: typeof parsed?.lastSyncedAt === 'number' ? parsed.lastSyncedAt : null,
      version: typeof parsed?.version === 'number' ? parsed.version : CURRENT_GROUP_CACHE_VERSION,
    };
  } catch {
    return DEFAULT_META;
  }
}

export async function setGroupCacheMeta(meta: GroupCacheMeta) {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}
