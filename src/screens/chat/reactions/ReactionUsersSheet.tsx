import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '@/lib/chatDB/database';
import {
  CHAT_REACTION_ORDER,
  normalizeChatReactionKey,
  type ChatReactionKey,
} from '@/lib/chatInteractions/messageState';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import ReactionIcon from './ReactionIcon';

type ReactionUser = {
  userId: string;
  reactionKey: ChatReactionKey;
  displayName: string;
  avatarUrl: string | null;
  isMe: boolean;
};

type KnownMember = {
  id?: string | null;
  user_id?: string | null;
  userId?: string | null;
  nickname?: string | null;
  name?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  profile_image_url?: string | null;
  is_me?: boolean | null;
};

type Props = {
  visible: boolean;
  roomId: number | string | null | undefined;
  messageUid: string | null;
  initialReactionKey?: ChatReactionKey | null;
  meId?: string | null;
  knownMembers?: KnownMember[];
  theme: ChatTheme;
  onClose: () => void;
};

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function withAlpha(hexOrRgba: string | undefined, alpha: number) {
  if (!hexOrRgba) return `rgba(0,0,0,${alpha})`;
  if (!hexOrRgba.startsWith('#')) return hexOrRgba;
  const h = hexOrRgba.replace('#', '');
  if (h.length !== 6) return hexOrRgba;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function pickProfileName(profile: any, fallback: string) {
  const raw = profile?._raw ?? {};
  const candidates = [
    profile?.displayName,
    profile?.display_name,
    profile?.nickname,
    profile?.nickName,
    profile?.nick_name,
    profile?.name,
    profile?.username,
    raw?.display_name,
    raw?.nickname,
    raw?.nick_name,
    raw?.name,
    raw?.username,
  ];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return fallback;
}

function pickProfileAvatar(profile: any) {
  const raw = profile?._raw ?? {};
  const candidates = [
    profile?.avatarUrl,
    profile?.avatar_url,
    profile?.avatarUri,
    profile?.avatar_uri,
    profile?.profileImageUrl,
    profile?.profile_image_url,
    raw?.avatar_url,
    raw?.avatar_uri,
    raw?.profile_image_url,
  ];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return null;
}

function pickKnownMemberName(member: KnownMember | null | undefined) {
  const candidates = [
    member?.nickname,
    member?.name,
    member?.displayName,
    member?.display_name,
  ];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return '';
}

function pickKnownMemberAvatar(member: KnownMember | null | undefined) {
  const candidates = [member?.avatarUrl, member?.avatar_url, member?.profile_image_url];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text;
  }
  return null;
}

function compactUserId(userId: string) {
  if (!userId) return '알 수 없음';
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

async function fetchProfileByUserId(userId: string): Promise<any | null> {
  const candidates = ['profiles', 'users'];
  for (const collectionName of candidates) {
    try {
      const collection = database.get<any>(collectionName);
      const rows = await collection.query(Q.where('id', userId), Q.take(1)).fetch();
      if (rows[0]) return rows[0];
    } catch {}
    try {
      const collection = database.get<any>(collectionName);
      const rows = await collection.query(Q.where('user_id', userId), Q.take(1)).fetch();
      if (rows[0]) return rows[0];
    } catch {}
  }
  return null;
}

export default function ReactionUsersSheet({
  visible,
  roomId,
  messageUid,
  initialReactionKey = null,
  meId = null,
  knownMembers = [],
  theme,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ReactionUser[]>([]);
  const [selectedKey, setSelectedKey] = useState<ChatReactionKey | 'all'>('all');

  const baseText = (theme as any)?.headerText ?? theme.text ?? '#111111';
  const subtleText = (theme as any)?.subText ?? withAlpha(baseText, 0.58);
  const sheetBg = (theme as any)?.headerBg ?? theme.background ?? '#FFFFFF';
  const hairline = withAlpha((theme as any)?.dateTimeLine ?? baseText, 0.14);
  const chipBg = withAlpha(baseText, 0.06);
  const selectedChipBg = withAlpha(baseText, 0.1);
  const selectedChipBorder = withAlpha(baseText, 0.22);
  const avatarFallbackBg = withAlpha(baseText, 0.08);
  const meBadgeBg = withAlpha(baseText, 0.08);

  const knownMemberById = useMemo(() => {
    const map = new Map<string, KnownMember>();
    for (const member of knownMembers ?? []) {
      const id = asText(member?.user_id ?? member?.userId ?? member?.id);
      if (id) map.set(id, member);
    }
    return map;
  }, [knownMembers]);

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeChatReactionKey(initialReactionKey);
    setSelectedKey(normalized ?? 'all');
  }, [initialReactionKey, visible]);

  const loadUsers = useCallback(async () => {
    const rid = Number(roomId ?? NaN);
    const uid = asText(messageUid);
    if (!visible || !Number.isFinite(rid) || rid <= 0 || !uid) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await database
        .get<any>('message_reactions')
        .query(Q.where('room_id', Math.trunc(rid)), Q.where('message_uid', uid))
        .fetch();

      const activeRows = rows.filter((row: any) => {
        const raw = row?._raw ?? {};
        return raw?.deleted_at == null || Number(raw.deleted_at) <= 0;
      });

      const profilesById = new Map<string, any | null>();
      const next: ReactionUser[] = [];

      for (const row of activeRows) {
        const raw = row?._raw ?? {};
        const userId = asText(raw.user_id ?? row.userId);
        const reactionKey = normalizeChatReactionKey(raw.reaction_key ?? row.reactionKey);
        if (!userId || !reactionKey) continue;

        const member = knownMemberById.get(userId);
        const knownName = pickKnownMemberName(member);
        const knownAvatar = pickKnownMemberAvatar(member);

        if ((!knownName || !knownAvatar) && !profilesById.has(userId)) {
          profilesById.set(userId, await fetchProfileByUserId(userId));
        }
        const profile = profilesById.get(userId);
        const isMe = !!meId && String(userId) === String(meId);
        const fallback = isMe ? '나' : compactUserId(userId);

        next.push({
          userId,
          reactionKey,
          displayName: knownName || pickProfileName(profile, fallback),
          avatarUrl: knownAvatar || pickProfileAvatar(profile),
          isMe,
        });
      }

      next.sort((a, b) => {
        if (a.isMe && !b.isMe) return -1;
        if (!a.isMe && b.isMe) return 1;
        return a.displayName.localeCompare(b.displayName, 'ko');
      });
      setUsers(next);
    } finally {
      setLoading(false);
    }
  }, [knownMemberById, meId, messageUid, roomId, visible]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const countsByKey = useMemo(() => {
    const counts: Partial<Record<ChatReactionKey, number>> = {};
    for (const user of users) {
      counts[user.reactionKey] = (counts[user.reactionKey] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (selectedKey === 'all') return users;
    return users.filter((user) => user.reactionKey === selectedKey);
  }, [selectedKey, users]);

  const totalCount = users.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={[styles.title, { color: baseText }]}>리액션</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            style={[styles.tabs, { borderBottomColor: hairline }]}
          >
            <Pressable
              onPress={() => setSelectedKey('all')}
              style={[
                styles.tabChip,
                {
                  backgroundColor: selectedKey === 'all' ? selectedChipBg : chipBg,
                  borderColor: selectedKey === 'all' ? selectedChipBorder : 'transparent',
                },
              ]}
            >
              <Text style={[styles.tabText, { color: baseText }]}>전체</Text>
              <Text style={[styles.tabCountText, { color: subtleText }]}>{totalCount}</Text>
            </Pressable>
            {CHAT_REACTION_ORDER.map((key) => {
              const count = countsByKey[key] ?? 0;
              if (count <= 0) return null;
              const selected = selectedKey === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedKey(key)}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: selected ? selectedChipBg : chipBg,
                      borderColor: selected ? selectedChipBorder : 'transparent',
                    },
                  ]}
                >
                  <ReactionIcon reactionKey={key} size={19} theme={theme} muted={!selected} />
                  <Text style={[styles.tabCountText, { color: baseText }]}>{count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.body}>
            {loading ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator />
              </View>
            ) : filteredUsers.length <= 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: subtleText }]}>아직 표시할 리액션이 없어요</Text>
              </View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={(user) => `${user.userId}:${user.reactionKey}`}
                numColumns={2}
                showsVerticalScrollIndicator={false}
                columnWrapperStyle={styles.userGridRow}
                contentContainerStyle={styles.userGridContent}
                renderItem={({ item: user }) => {
                  const showMeBadge = user.isMe && user.displayName !== '나';
                  return (
                    <View style={styles.userCard}>
                      {user.avatarUrl ? (
                        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: avatarFallbackBg }]}>
                          <Text style={[styles.avatarInitial, { color: baseText }]}>
                            {user.displayName.slice(0, 1) || '?'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.nameArea}>
                        <View style={styles.nameLine}>
                          <Text style={[styles.name, { color: baseText }]} numberOfLines={1}>
                            {user.displayName}
                          </Text>
                          {showMeBadge ? (
                            <View style={[styles.meBadge, { backgroundColor: meBadgeBg }]}>
                              <Text style={[styles.meBadgeText, { color: subtleText }]}>나</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    minHeight: 360,
    maxHeight: '74%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.24)',
    marginTop: 10,
    marginBottom: 18,
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 13,
  },
  tabs: {
    height: 44,
    maxHeight: 44,
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsContent: {
    paddingHorizontal: 20,
    paddingBottom: 9,
    alignItems: 'center',
    gap: 6,
  },
  tabChip: {
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  tabCountText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  body: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 18,
  },
  emptyBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  userGridContent: {
    paddingBottom: 10,
  },
  userGridRow: {
    gap: 8,
  },
  userCard: {
    flex: 1,
    minHeight: 54,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingRight: 6,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '600',
  },
  nameArea: {
    flex: 1,
    minWidth: 0,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.12,
  },
  meBadge: {
    height: 18,
    minWidth: 22,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});
