// src/screens/Privacy.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Switch, Pressable, ActivityIndicator, Alert, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '@/components/AppHeader';
import { supabase } from '../../lib/supabase';

type PrivacyRow = {
  user_id: string;
  profile_visible: boolean;
  searchable: boolean;
  friend_request_policy: 'allow_all' | 'friends_only' | 'reject_all';
  location_visible: boolean;
  last_seen_visible: boolean;
  updated_at?: string | null;
};

const HAIRLINE = '#ECEFF4';
const ACCENT = '#111827';

export default function Privacy() {
  const [me, setMe] = useState<string>('');
  const [row, setRow] = useState<PrivacyRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profileVisible, setProfileVisible] = useState(true);
  const [searchable, setSearchable] = useState(true);
  const [friendPolicy, setFriendPolicy] = useState<'allow_all'|'friends_only'|'reject_all'>('allow_all');
  const [locationVisible, setLocationVisible] = useState(true);
  const [lastSeenVisible, setLastSeenVisible] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');
      setMe(user.id);

      const { data, error } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error && error.code !== '42P01') throw error;

      const initial: PrivacyRow = data ?? {
        user_id: user.id,
        profile_visible: true,
        searchable: true,
        friend_request_policy: 'allow_all',
        location_visible: true,
        last_seen_visible: true,
      };

      setRow(initial);
      setProfileVisible(initial.profile_visible);
      setSearchable(initial.searchable);
      setFriendPolicy(initial.friend_request_policy);
      setLocationVisible(initial.location_visible);
      setLastSeenVisible(initial.last_seen_visible);
    } catch (e: any) {
      if (e?.code === '42P01') {
        Alert.alert('설정 테이블 없음', 'SQL Editor에서 user_privacy_settings를 먼저 생성해주세요.');
      } else {
        Alert.alert('불러오기 실패', e?.message ?? String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!me) return;
    try {
      setSaving(true);
      const payload: Omit<PrivacyRow, 'user_id'> = {
        profile_visible: profileVisible,
        searchable,
        friend_request_policy: friendPolicy,
        location_visible: locationVisible,
        last_seen_visible: lastSeenVisible,
      };
      const { error } = await supabase
        .from('user_privacy_settings')
        .upsert({ user_id: me, ...payload }, { onConflict: 'user_id' });
      if (error) throw error;
      Alert.alert('저장됨', '개인정보 설정이 저장되었습니다.');
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [me, profileVisible, searchable, friendPolicy, locationVisible, lastSeenVisible]);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <AppHeader title="Privacy" showBack />
        <View style={s.center}>
          <ActivityIndicator />
          <Text style={s.loadingTxt}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="Privacy" showBack />
      <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
        {/* 프로필 공개 범위 */}
        <Section title="프로필 및 검색">
          <Row title="내 프로필 공개" caption="다른 사용자가 내 프로필을 볼 수 있음" right={<Switch value={profileVisible} onValueChange={setProfileVisible} />} />
          <Row title="검색 허용" caption="닉네임/핸들로 나를 검색할 수 있음" last right={<Switch value={searchable} onValueChange={setSearchable} />} />
        </Section>

        {/* 친구 요청 정책 */}
        <Section title="친구 요청 정책">
          <Pressable onPress={() => setFriendPolicy('allow_all')}>
            <Row title="모두 허용" caption="누구나 친구 요청 가능" right={<Radio checked={friendPolicy === 'allow_all'} />} />
          </Pressable>
          <Pressable onPress={() => setFriendPolicy('friends_only')}>
            <Row title="친구의 친구만" caption="내 친구와 연결된 사람만 요청 가능" right={<Radio checked={friendPolicy === 'friends_only'} />} />
          </Pressable>
          <Pressable onPress={() => setFriendPolicy('reject_all')}>
            <Row title="모두 차단" caption="모든 친구 요청 거절" last right={<Radio checked={friendPolicy === 'reject_all'} />} />
          </Pressable>
        </Section>

        {/* 위치/활동 */}
        <Section title="활동 정보">
          <Row title="위치 표시" caption="내 활동 비콘에서 위치를 노출" right={<Switch value={locationVisible} onValueChange={setLocationVisible} />} />
          <Row title="마지막 활동 시간" caption="프로필에 최근 접속 시간 표시" last right={<Switch value={lastSeenVisible} onValueChange={setLastSeenVisible} />} />
        </Section>

        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Pressable style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>저장</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ───────── Components ───────── */
function Row({ title, caption, right, last }: { title: string; caption?: string; right?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rowDivider]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!caption && <Text style={s.rowCaption}>{caption}</Text>}
      </View>
      {right}
    </View>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <View style={[s.radioOuter, checked && s.radioOuterActive]}>
      {checked && <View style={s.radioInner} />}
    </View>
  );
}

/* ───────── Styles ───────── */
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { marginTop: 8, color: '#6b7280' },

  section: { paddingTop: 12 },
  sectionTitle: { paddingHorizontal: 16, paddingVertical: 8, color: '#9AA1AB', fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },

  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowCaption: { marginTop: 2, color: '#6b7280' },

  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: ACCENT },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },

  btn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
});
