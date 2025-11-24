// src/screens/auth/Signup.tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '@/components/AppHeader';
import { supabase } from '../../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

const HAIRLINE = '#ECEFF4';
const ACCENT = '#111827';

export default function Signup() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [nickname, setNickname] = useState('');
  const [handle, setHandle] = useState('');
  const [agree, setAgree] = useState(false);

  const [loading, setLoading] = useState(false);

  const validate = useCallback(async () => {
    const e = email.trim();
    if (!e || !e.includes('@')) {
      throw new Error(t('auth.invalidEmail', '유효한 이메일을 입력해주세요.'));
    }
    if (pw.length < 8) {
      throw new Error(t('auth.weakPassword', '비밀번호는 8자 이상이어야 합니다.'));
    }
    if (pw !== pw2) {
      throw new Error(t('auth.passwordNotMatch', '비밀번호가 서로 다릅니다.'));
    }
    if (!agree) {
      throw new Error(t('auth.agreeRequired', '약관 및 개인정보 처리방침에 동의해주세요.'));
    }
    if (handle.trim()) {
      const ok = /^[a-z0-9_]{3,20}$/.test(handle.trim());
      if (!ok) {
        throw new Error(
          t('auth.handleRule', '핸들은 영문 소문자/숫자/밑줄로 3~20자여야 합니다.')
        );
      }
      // 중복 확인 (profiles.handle 기준)
      const { data: h } = await supabase
        .from('profiles')
        .select('id')
        .ilike('handle', handle.trim())
        .limit(1)
        .maybeSingle();
      if (h?.id) throw new Error(t('auth.handleTaken', '이미 사용 중인 핸들이에요.'));
    }
  }, [email, pw, pw2, agree, handle, t]);

  const onSubmit = useCallback(async () => {
    try {
      await validate();
      setLoading(true);

      const emailRedirectTo =
        `${process.env.EXPO_PUBLIC_APP_URL ?? 'https://example.com'}/auth/reset-callback`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pw,
        options: {
          emailRedirectTo,
          data: {
            // NOTE: DB 트리거로 profiles를 생성/싱크한다면 이 metadata가 활용됨
            nickname: nickname.trim() || null,
            handle: handle.trim() || null,
          },
        },
      });
      if (error) throw error;

      // 이메일 확인을 요구하지 않는 프로젝트에서는 session이 바로 생김
      if (data.session?.user?.id) {
        try {
          await supabase
            .from('profiles')
            .upsert(
              {
                id: data.session.user.id,
                email: email.trim(),
                nickname: nickname.trim() || null,
                handle: handle.trim() || null,
              },
              { onConflict: 'id' }
            );
        } catch {
          // 트리거가 이미 만드는 구조면 무시해도 괜찮음
        }
        Alert.alert(
          t('auth.signupDone', '가입 완료'),
          t('auth.signupDoneDesc', '바로 로그인되었습니다.')
        );
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        return;
      }

      // 이메일 확인이 필요한 프로젝트
      Alert.alert(
        t('auth.verifyEmailTitle', '이메일 확인'),
        t(
          'auth.verifyEmailDesc',
          '입력하신 주소로 인증 메일을 보냈어요. 메일의 링크를 눌러 회원가입을 완료해 주세요.'
        )
      );
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(t('errors.common', '오류'), err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [email, pw, nickname, handle, navigation, t, validate]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <AppHeader title={t('auth.signup', '회원가입')} showBack />

      <View style={styles.body}>
        <Text style={styles.caption}>
          {t('auth.signupCaption', '이메일과 비밀번호로 간편하게 시작하세요.')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.emailPlaceholder', '이메일')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.passwordPlaceholder', '비밀번호 (8자 이상)')}
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.passwordConfirm', '비밀번호 확인')}
          value={pw2}
          onChangeText={setPw2}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.nicknamePlaceholder', '닉네임 (선택)')}
          value={nickname}
          onChangeText={setNickname}
        />
        <TextInput
          style={styles.input}
            // 보여줄 땐 @ 없이, 저장은 소문자/밑줄/숫자만 허용
          placeholder={t('auth.handlePlaceholder', '핸들 @id (선택)')}
          value={handle}
          onChangeText={(v) => setHandle(v.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
          autoCapitalize="none"
        />

        {/* 약관 동의 */}
        <View style={styles.agreeRow}>
          <Switch
            value={agree}
            onValueChange={setAgree}
            trackColor={{ false: '#E5E7EB', true: ACCENT }}
            thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            ios_backgroundColor="#E5E7EB"
          />
          <Text style={styles.agreeTxt}>
            {t('auth.agree', '이용약관 및 개인정보 처리방침에 동의합니다.')}
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate('TermsPrivacy')}>
          <Text style={styles.link}>{t('auth.viewTerms', '약관 보기')}</Text>
        </Pressable>

        {/* 제출 버튼 */}
        <Pressable
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnTxt}>{t('auth.signup', '회원가입')}</Text>
          )}
        </Pressable>

        {/* 로그인으로 이동 */}
        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 14 }}>
          <Text style={styles.subLink}>
            {t('auth.goLogin', '이미 계정이 있으신가요? 로그인')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, padding: 16 },
  caption: { color: '#6b7280', marginBottom: 12 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 4 },
  agreeTxt: { color: '#111827', fontWeight: '700', flex: 1 },
  link: { color: '#6b7280', textDecorationLine: 'underline', marginTop: 2 },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  subLink: { color: '#111827', fontWeight: '700' },
});
