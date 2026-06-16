import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import GroupListRow from './GroupListRow';
import { filterGroupsLocally } from '../../../lib/friends/groupSearch';
import { buildGroupSearchText, type CachedGroupRecord } from '../../../lib/friends/groups.mapper';

export type FriendDraftGroup = {
  id: number;
  name: string;
  in_group: boolean;
};

type Props = {
  friendName: string;
  groups: FriendDraftGroup[];
  onToggleGroup: (groupId: number) => void;
};

export default function FriendGroupManager({
  friendName,
  groups,
  onToggleGroup,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const selectedCount = useMemo(
    () => groups.filter((g) => g.in_group).length,
    [groups],
  );

  const cachedLikeGroups = useMemo<CachedGroupRecord[]>(
    () =>
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        member_count: 0,
        is_favorite: false,
        preview_members: [],
        search_text: buildGroupSearchText({ name: group.name, preview_members: [] }),
        updated_at: 0,
      })),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    const filtered = filterGroupsLocally(cachedLikeGroups, query);
    return filtered.map((row) => groups.find((g) => g.id === row.id)).filter(Boolean) as FriendDraftGroup[];
  }, [cachedLikeGroups, groups, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle}>{friendName}</Text>
        <Text style={styles.headerSub}>{t('friends:edit.groups.subtitle')}</Text>
        <Text style={styles.headerCount}>{t('friends:edit.groups.selectedCount', { count: selectedCount })}</Text>
      </View>

      <View style={styles.searchOuter}>
        <View style={styles.searchBox}>
          <Search size={18} color="#6B7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('friends:search.groupNamePlaceholder')}
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        {filteredGroups.map((group) => (
          <GroupListRow
            key={group.id}
            name={group.name}
            memberCount={0}
            previewMembers={[]}
            selected={group.in_group}
            subtitle={
              group.in_group
                ? t('friends:edit.groups.inGroup')
                : t('friends:edit.groups.addHint')
            }
            onPress={() => onToggleGroup(group.id)}
          />
        ))}

        {!filteredGroups.length && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('friends:search.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('friends:edit.groups.emptySearch')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerInfo: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  headerSub: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  headerCount: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  searchOuter: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchBox: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    paddingVertical: 0,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 72,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
