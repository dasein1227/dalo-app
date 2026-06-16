import type { CachedGroupRecord } from './groups.mapper';
import { normalizeForSearch } from './groups.mapper';

export function filterGroupsLocally(groups: CachedGroupRecord[], query: string) {
  const q = normalizeForSearch(query);
  if (!q) return groups;

  return groups.filter((group) => {
    const name = normalizeForSearch(group.name);
    const searchText = normalizeForSearch(group.search_text);
    return name.includes(q) || searchText.includes(q);
  });
}

export function buildGroupSections(groups: CachedGroupRecord[], collapsed: Record<string, boolean>) {
  const favorites = groups.filter((group) => !!group.is_favorite);

  return [
    {
      key: 'group_favorites',
      title: `즐겨찾는 그룹 ${favorites.length}`,
      data: collapsed.group_favorites ? [] : favorites,
    },
    {
      key: 'groups',
      title: `그룹 ${groups.length}`,
      data: collapsed.groups ? [] : groups,
    },
  ];
}
