export type GroupPreviewMember = {
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
};

export type ServerGroupRecord = {
  id: number;
  name: string;
  member_count: number;
  is_favorite?: boolean | null;
  preview_members?: GroupPreviewMember[] | null;
  search_text?: string | null;
};

export type CachedGroupRecord = {
  id: number;
  name: string;
  member_count: number;
  is_favorite: boolean;
  preview_members: GroupPreviewMember[];
  search_text: string;
  updated_at: number;
};

export function normalizeForSearch(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildGroupSearchText(group: {
  name?: string | null;
  search_text?: string | null;
  preview_members?: GroupPreviewMember[] | null;
}) {
  const parts = [
    group.name ?? '',
    group.search_text ?? '',
    ...(group.preview_members ?? []).flatMap((member) => [
      member.nickname ?? '',
    ]),
  ];

  return normalizeForSearch(parts.filter(Boolean).join(' '));
}

export function mapServerGroupToCache(row: ServerGroupRecord): CachedGroupRecord {
  return {
    id: row.id,
    name: row.name,
    member_count: row.member_count ?? 0,
    is_favorite: !!row.is_favorite,
    preview_members: Array.isArray(row.preview_members) ? row.preview_members : [],
    search_text: buildGroupSearchText(row),
    updated_at: Date.now(),
  };
}

export function mapServerGroupsToCache(rows: ServerGroupRecord[] | null | undefined): CachedGroupRecord[] {
  return (rows ?? []).map(mapServerGroupToCache);
}

export function mapCachedGroupsToUi(rows: CachedGroupRecord[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    member_count: row.member_count,
    is_favorite: row.is_favorite,
    preview_members: row.preview_members,
    search_text: row.search_text,
    updated_at: row.updated_at,
  }));
}
