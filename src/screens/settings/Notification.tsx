// src/screens/Notification.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Switch, Pressable, TextInput,
  ActivityIndicator, Alert, Platform, ScrollView, Linking
} from 'react-native';
import AppHeader from '@/components/AppHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type NotiRow = {
  user_id: string;
  push_enabled: boolean | null;
  preview_enabled: boolean | null;
  sound_enabled: boolean | null;
  vibrate_enabled: boolean | null;
  chat_enabled: boolean | null;
  friend_request_enabled: boolean | null;
  system_enabled: boolean | null;
  marketing_enabled: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  device_token?: string | null;
};

const HAIRLINE = '#ECEFF4';
const ACCENT = '#111827';
const hhmmRe = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function Notification() {
  const [me, setMe] = useState<string>('');
  const [row, setRow] = useState<NotiRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [pushOn, setPushOn] = useState(true);
  const [previewOn, setPreviewOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [vibrateOn, setVibrateOn] = useState(true);

  const [chatOn, setChatOn] = useState(true);
  const [friendReqOn, setFriendReqOn] = useState(true);
  const [systemOn, setSystemOn] = useState(true);
  const [marketingOn, setMarketingOn] = useState(false);

  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');
      setMe(user.id);

      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error && error.code !== '42P01') throw error;

      const initial: NotiRow = data ?? {
        user_id: user.id,
        push_enabled: true,
        preview_enabled: true,
        sound_enabled: true,
        vibrate_enabled: true,
        chat_enabled: true,
        friend_request_enabled: true,
        system_enabled: true,
        marketing_enabled: false,
        quiet_start: '22:00',
        quiet_end: '08:00',
        device_token: null,
      };

      setRow(initial);
      setPushOn(!!initial.push_enabled);
      setPreviewOn(!!initial.preview_enabled);
      setSoundOn(!!initial.sound_enabled);
      setVibrateOn(!!initial.vibrate_enabled);
      setChatOn(!!initial.chat_enabled);
      setFriendReqOn(!!initial.friend_request_enabled);
      setSystemOn(!!initial.system_enabled);
      setMarketingOn(!!initial.marketing_enabled);
      setQuietStart(initial.quiet_start || '22:00');
      setQuietEnd(initial.quiet_end || '08:00');
    } catch (e: any) {
      if (e?.code === '42P01') {
        Alert.alert('알림 설정 테이블 없음', 'Supabase SQL Editor에서 user_notification_settings를 먼저 생성해주세요.');
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
    if (!hhmmRe.test(quietStart) || !hhmmRe.test(quietEnd)) {
      Alert.alert('시간 형식 확인', '조용한 시간은 HH:MM 형식으로 입력해주세요. 예) 22:00');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        push_enabled: pushOn,
        preview_enabled: previewOn,
        sound_enabled: soundOn,
        vibrate_enabled: vibrateOn,
        chat_enabled: chatOn,
        friend_request_enabled: friendReqOn,
        system_enabled: systemOn,
        marketing_enabled: marketingOn,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        device_token: row?.device_token ?? null,
      };
      const { error } = await supabase
        .from('user_notification_settings')
        .upsert({ user_id: me, ...payload }, { onConflict: 'user_id' });
      if (error) throw error;
      Alert.alert('저장됨', '알림 설정이 저장되었습니다.');
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [me, pushOn, previewOn, soundOn, vibrateOn, chatOn, friendReqOn, systemOn, marketingOn, quietStart, quietEnd, row]);

  /** ✅ 시스템 알림 설정 열기 (iOS / Android 분기) */
  const openSystemSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('App-Prefs:NOTIFICATIONS_ID');
      } else {
        await Linking.openSettings();
      }
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '시스템 설정을 열 수 없습니다.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <AppHeader title="Notification" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="Notification" showBack />
      <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
        <Section title="기본">
          <Row title="푸시 알림 사용" caption="앱의 모든 알림 허용/차단" right={<Switch value={pushOn} onValueChange={setPushOn} />} />
          <Row title="미리보기 표시" caption="잠금화면/배너에 내용 표시" right={<Switch value={previewOn} onValueChange={setPreviewOn} />} />
          <Row title="소리" right={<Switch value={soundOn} onValueChange={setSoundOn} />} />
          <Row title="진동" last right={<Switch value={vibrateOn} onValueChange={setVibrateOn} />} />
        </Section>

        <Section title="카테고리별">
          <Row title="채팅" right={<Switch value={chatOn} onValueChange={setChatOn} />} />
          <Row title="친구 요청" right={<Switch value={friendReqOn} onValueChange={setFriendReqOn} />} />
          <Row title="시스템/공지" right={<Switch value={systemOn} onValueChange={setSystemOn} />} />
          <Row title="마케팅/프로모션" last right={<Switch value={marketingOn} onValueChange={setMarketingOn} />} />
        </Section>

        <Section title="조용한 시간">
          <Row title="시작" caption="예) 22:00" right={<Input value={quietStart} onChangeText={setQuietStart} />} />
          <Row title="종료" caption="예) 08:00" last right={<Input value={quietEnd} onChangeText={setQuietEnd} />} />
        </Section>

        <View style={{ padding: 16, gap: 10 }}>
          <Pressable style={[s.btn, s.btnPrimary]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>저장</Text>}
          </Pressable>

          <Pressable style={[s.btn, s.btnGhost]} onPress={openSystemSettings}>
            <Text style={s.btnGhostTxt}>
              시스템 알림 설정 열기
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ───────── 공용 컴포넌트 ───────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}
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
function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} placeholder="HH:MM" maxLength={5} style={s.input} />;
}

/* ───────── 스타일 ───────── */
const s = StyleSheet.create({
  section: { paddingTop: 12 },
  sectionTitle: { paddingHorizontal: 16, paddingVertical: 8, color: '#9AA1AB', fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowCaption: { marginTop: 2, color: '#6b7280' },
  input: { width: 90, height: 38, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, textAlign: 'center' },
  btn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnGhostTxt: { color: ACCENT, fontWeight: '800' },
});
