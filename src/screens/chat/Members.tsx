// src/screens/chat/Members.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeScreen } from '../../components/layout';
import { useRoute } from '@react-navigation/native';
import DetailHeader from '@/components/header/DetailHeader';
import { supabase } from '@/lib/supabase';

type Member = {
  id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  role?: 'owner' | 'member' | 'guest';
};

export default function Members() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const roomId = route.params?.roomId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // 🧩 추후 실제 테이블에 맞게 조정: room_members / beacon_participants 등
      const { data, error } = await supabase
        .from('room_members')
        .select('id,user_id,role,profiles(nickname,avatar_url)')
        .eq('room_id', roomId);
      if (error) throw error;

      const parsed = (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        nickname: r.profiles?.nickname ?? t('chat:membersScreen.noName'),
        avatar_url: r.profiles?.avatar_url ?? null,
        role: r.role ?? 'member',
      }));
      setMembers(parsed);
    } catch (e: any) {
      Alert.alert(t('chat:membersScreen.loadFail'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeScreen
      backgroundColor="#fff"
      includeTopInset={false}
      includeBottomInset
      style={styles.screen}
      contentStyle={styles.safeContent}
    >
      <DetailHeader title={t('chat:membersScreen.title')} showBack />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadingTxt}>{t('chat:membersScreen.loading')}</Text>
          </View>
        ) : members.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTxt}>{t('chat:membersScreen.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.avatarBox}>
                  {item.avatar_url ? (
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        backgroundColor: '#e5e7eb',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={item.avatar_url}
                        alt="avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </View>
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarTxt}>
                        {item.nickname?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nickname}</Text>
                  <Text style={styles.sub}>{item.role === 'owner' ? t('chat:membersScreen.owner') : t('chat:membersScreen.participant')}</Text>
                </View>

                {item.role !== 'owner' && (
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => Alert.alert(t('chat:membersScreen.removeTitle'), t('chat:membersScreen.removeMessage', { name: item.nickname }))}
                  >
                    <Text style={styles.removeTxt}>{t('chat:membersScreen.remove')}</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  safeContent: { flex: 1 },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#6b7280', marginTop: 8 },
  emptyTxt: { color: '#9ca3af' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f3f4f6',
  },
  avatarBox: { marginRight: 12 },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  name: { fontWeight: '700', fontSize: 15, color: '#111827' },
  sub: { color: '#6b7280', fontSize: 13 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  removeTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
