import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DetailHeader from '@/components/header/DetailHeader';
import { supabase } from '@/lib/supabase';

type OtpType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change';

export default function VerifyEmail() {
  const [email, setEmail] = useState<string>('');
  const [checking, setChecking] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const mounted = useRef(true);

  // 내 계정 이메일 & 확인 상태
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  const statusText = useMemo(() => {
    if (verifying || checking) return '확인 중…';
    if (confirmedAt) return '인증 완료';
    return '인증 대기';
  }, [verifying, checking, confirmedAt]);

  const refreshUser = useCallback(async () => {
    try {
      setChecking(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? '');
        setConfirmedAt((user as any).email_confirmed_at ?? null);
      }
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);


  const handleUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    try {
      const u = new URL(url);
      const tokenHash = u.searchParams.get('token_hash');
      const type = (u.searchParams.get('type') as OtpType | null) ?? null;
      if (!tokenHash || !type) return;

      setVerifying(true);
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;


      if (data?.user || data?.session) {
        await refreshUser();
        Alert.alert('완료', '이메일 인증이 완료되었습니다.');
      } else {
        await refreshUser();
      }
    } catch (e: any) {
      Alert.alert('인증 실패', e?.message ?? '링크 검증 중 오류가 발생했어요.');
    } finally {
      if (mounted.current) setVerifying(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    mounted.current = true;

    refreshUser();


    Linking.getInitialURL().then(handleUrl).catch(() => {});


    const sub = Linking.addEventListener('url', (ev) => handleUrl(ev.url));

    return () => {
      mounted.current = false;
      sub?.remove?.();
    };
  }, [handleUrl, refreshUser]);

  // ---- 재발송 ----
  const resend = useCallback(async () => {
    if (!email) {
      Alert.alert('안내', '로그인 상태를 확인해 주세요.');
      return;
    }
    try {
      setResending(true);
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      Alert.alert('발송됨', '인증 메일을 다시 보냈어요. 메일함을 확인해 주세요.');
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '메일 재발송에 실패했어요.');
    } finally {
      setResending(false);
    }
  }, [email]);

  // ---- 메일앱 열기 (가능한 경우) ----
  const openMailApp = useCallback(async () => {
    // 완벽한 “받은편지함 열기”는 플랫폼별 제약이 있어요.
    // 기본 메일 작성 화면이라도 열어 사용자가 앱 전환하도록 유도.
    try {
      await Linking.openURL('mailto:');
    } catch {
      Alert.alert('안내', '메일 앱을 열 수 없어요. 직접 메일함을 확인해 주세요.');
    }
  }, []);

  const done = !!confirmedAt;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <DetailHeader title="이메일 인증" showBack />
      <View style={s.body}>
        <View style={s.badgeWrap}>
          <Text style={[s.badge, done ? s.badgeOk : s.badgePending]}>
            {statusText}
          </Text>
          {(checking || verifying) && <ActivityIndicator style={{ marginTop: 8 }} />}
        </View>

        <Text style={s.title}>가입 인증 메일을 확인해 주세요</Text>
        <Text style={s.sub}>
          {email ? `보낸 주소: ${email}` : '로그인 상태에서 진행해 주세요.'}
        </Text>

        {!done && (
          <View style={{ gap: 10, marginTop: 16 }}>
            <Pressable
              style={[s.btn, s.primary, (checking || verifying || resending) && { opacity: 0.6 }]}
              onPress={resend}
              disabled={checking || verifying || resending}
            >
              <Text style={s.primaryTxt}>{resending ? '재발송 중…' : '인증 메일 다시 받기'}</Text>
            </Pressable>

            <Pressable style={[s.btn, s.ghost]} onPress={openMailApp}>
              <Text style={s.ghostTxt}>메일함 열기</Text>
            </Pressable>
          </View>
        )}

        {done && (
          <View style={{ gap: 10, marginTop: 16 }}>
            <Text style={{ color: '#6b7280' }}>
              이메일 인증이 완료되었어요. 계속 진행해 주세요.
            </Text>
            <Pressable style={[s.btn, s.primary]} onPress={() => { /* 인증 후 메인으로 */ Linking.openURL('app://MainTabs'); }}>
              <Text style={s.primaryTxt}>메인으로 가기</Text>
            </Pressable>
          </View>
        )}

        <View style={s.help}>
          <Text style={s.helpTitle}>메일이 안 오나요?</Text>
          <Text style={s.helpTxt}>• 스팸함을 확인해 보세요.</Text>
          <Text style={s.helpTxt}>• 네트워크가 불안정하면 몇 분 걸릴 수 있어요.</Text>
          <Text style={s.helpTxt}>• 주소가 틀렸다면 설정에서 이메일을 수정해 주세요.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, padding: 16 },
  badgeWrap: { alignItems: 'center', marginTop: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, fontWeight: '800' },
  badgeOk: { backgroundColor: '#10b98120', color: '#065f46' },
  badgePending: { backgroundColor: '#f59e0b20', color: '#92400e' },
  title: { marginTop: 14, fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { marginTop: 6, color: '#6b7280' },

  btn: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#111827' },
  primaryTxt: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  ghostTxt: { color: '#111827', fontWeight: '800' },

  help: { marginTop: 26, paddingTop: 12, borderTopWidth: 1, borderColor: '#F3F4F6' },
  helpTitle: { fontWeight: '800', color: '#111827', marginBottom: 6 },
  helpTxt: { color: '#6b7280', marginTop: 2 },
});
