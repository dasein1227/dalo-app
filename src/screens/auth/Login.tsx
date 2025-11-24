// src/screens/auth/Login.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Image, Alert,
  Platform, TextInput, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import SocialLoginButtons from '../../components/SocialLoginButtons';

WebBrowser.maybeCompleteAuthSession?.();

/** 네비게이션 루트 핸들 */
function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

/** 중첩 네비게이션으로 reset (['MainTabs','Map','Main'] 예시) */
function resetToNested(navigation: any, path: string[]) {
  const build = (names: string[], i = 0): any =>
    i === names.length - 1
      ? { index: 0, routes: [{ name: names[i] }] }
      : { index: 0, routes: [{ name: names[i], state: build(names, i + 1) }] };

  navigation.dispatch(CommonActions.reset(build(path)));
}

/** 세션 사용자용 프로필 보장: RLS 상 클라이언트 upsert 필요 */
async function ensureProfiles(uid: string) {
  // public
  const { error: e1 } = await supabase
    .from('profiles_public')
    .upsert([{ user_id: uid }], { onConflict: 'user_id' });
  if (e1 && (e1 as any).code !== '23505') throw e1;

  // private
  const { error: e2 } = await supabase
    .from('profiles_private')
    .upsert([{ user_id: uid }], { onConflict: 'user_id' });
  if (e2 && (e2 as any).code !== '23505') throw e2;
}

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clickingRef = useRef(false);

  // 이메일/전화 폼 상태
  const [authMode, setAuthMode] = useState<'none' | 'email' | 'phone'>('none');
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(''); // 휴대폰 최초 인증용

  /** 홈 이동 (프로필 보장 포함) */
  const goHome = async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (uid) {
      try { await ensureProfiles(uid); } catch {}
    }
    const root = getRootNavigation(navigation);
    // ⬇️ 마지막 두 단계는 실제 네비 이름으로 조정
    resetToNested(root, ['MainTabs', 'Map', 'Main']);
  };

  /** 세션 생기면 자동 이동(백업 안전망) */
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) goHome();
    });
    return () => sub.subscription?.unsubscribe();
  }, []);

  /** Prod 딥링크(dalo://auth?code=...) 수신 → 코드 교환 */
  useEffect(() => {
    const onUrl = async ({ url }: { url: string }) => {
      try {
        const parsed = Linking.parse(url);
        const qp = parsed.queryParams ?? {};
        const code = (qp.code as string) || '';
        const errorDesc = qp.error_description as string | undefined;
        if (errorDesc) { setErr(decodeURIComponent(errorDesc)); return; }
        if (!code) return;

        setLoading(true);
        try {
          // 신규 SDK 시그니처
          const { error } = await (supabase.auth as any).exchangeCodeForSession({ auth_code: code });
          if (error) throw error;
        } catch {
          // 예전 시그니처 폴백
          const { error } = await (supabase.auth as any).exchangeCodeForSession(code);
          if (error) throw error;
        }
        await goHome();
      } catch (e: any) {
        setErr(e?.message ?? t('auth.error_during_login'));
      } finally {
        setLoading(false);
      }
    };

    Linking.getInitialURL().then((url) => { if (url) onUrl({ url }); });
    const sub = Linking.addEventListener('url', (ev) => { if (ev?.url) onUrl({ url: ev.url }); });
    return () => sub.remove();
  }, []);

  /** Dev(Expo) ↔ Prod 자동 전환용 redirect */
  const makeRedirectUri = () => {
    const isStandalone = (Constants as any).appOwnership === 'standalone';
    return AuthSession.makeRedirectUri({
      scheme: 'dalo',
      path: 'auth',
      useProxy: !isStandalone, // Dev는 프록시 사용, Prod는 딥링크
      projectNameForProxy: '@youngjin1/dalo',
    } as any);
  };

  /** Dev(프록시)에서 세션 폴링 (앱 복귀 후 세션 확정 확인 용도) */
  const pollSession = async (tries = 12, delay = 300) => {
    for (let i = 0; i < tries; i++) {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delay));
    }
    return null;
  };

  /** 공통 OAuth 핸들러 */
  const signInWithProvider = async (
    provider: 'google' | 'apple' | 'kakao' | 'facebook' | 'oidc',
    conf?: any
  ) => {
    if (clickingRef.current) return;
    clickingRef.current = true;

    setErr(null);
    setLoading(true);
    try {
      const redirectTo = makeRedirectUri();
      const useProxy = redirectTo.startsWith('https://auth.expo.io/');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true, ...conf },
      } as any);
      if (error) throw error;
      if (!data?.url) throw new Error(t('auth.oauth_url_missing'));

      await WebBrowser.warmUpAsync?.();
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      await WebBrowser.coolDownAsync?.();

      if (res.type === 'cancel') { setErr(t('auth.error_during_login')); return; }

      if (useProxy) {
        const s = await pollSession();
        if (!s) throw new Error(t('auth.oauth_redirect_missing'));
        try { await ensureProfiles(s.user.id); } catch {}
        await goHome();
      } // Prod(딥링크): 교환은 onUrl에서 처리되고 goHome에서 ensureProfiles 실행
    } catch (e: any) {
      const m = (e?.message || '').toLowerCase();
      if (m.includes('invalid client') || m.includes('client id')) {
        setErr(t('auth.oauth_invalid_client'));
      } else if (m.includes('redirect')) {
        setErr(t('auth.oauth_redirect_missing'));
      } else {
        setErr(e?.message ?? t('auth.error_during_login'));
      }
    } finally {
      setLoading(false);
      clickingRef.current = false;
    }
  };

  /** 소셜 개별 핸들러 */
  const signInWithGoogle   = () => signInWithProvider('google');
  const signInWithApple    = () => {
    if (Platform.OS !== 'ios') return Alert.alert('Apple', t('auth.apple_only_ios'));
    return signInWithProvider('apple');
  };
  const signInWithKakao    = () => signInWithProvider('kakao' as any);
  const signInWithFacebook = () => signInWithProvider('facebook' as any);

  /** 이메일/전화 폼 열기 */
  const openEmailForm = () => { setAuthMode('email'); setIsSignUp(true); };
  const openPhoneForm = () => { setAuthMode('phone'); setIsSignUp(true); };

  /** 이메일: 가입/로그인 (비밀번호 기반) */
  const handleEmailSubmit = async () => {
    try {
      setLoading(true); setErr(null);
      if (isSignUp) {
        // 이메일 인증 클릭 시 앱으로 복귀(딥링크/프록시)하도록 redirect 지정
        const redirectTo = makeRedirectUri();
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        Alert.alert(t('auth.signup_done_title'), t('auth.signup_done_desc'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // 로그인 성공 → 세션 존재 → 프로필 보장 후 홈
        await goHome();
      }
    } catch (e:any) {
      setErr(e?.message ?? t('auth.error_during_login'));
    } finally { setLoading(false); }
  };

  /** 휴대폰: 가입/로그인 (비밀번호 기반) + 최초 1회 SMS 인증 */
  const handlePhoneSubmit = async () => {
    try {
      setLoading(true); setErr(null);
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ phone, password });
        if (error) throw error;
        Alert.alert(t('auth.signup_done_title'), t('auth.signup_send_code'));
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
        if (error) throw error;
        // 로그인 성공 → 프로필 보장 후 홈
        if (data?.user?.id) { try { await ensureProfiles(data.user.id); } catch {} }
        await goHome();
      }
    } catch (e:any) {
      setErr(e?.message ?? t('auth.error_during_login'));
    } finally { setLoading(false); }
  };

  const verifyPhoneOnce = async () => {
    try {
      setLoading(true); setErr(null);
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
      if (error) throw error;
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (uid) { try { await ensureProfiles(uid); } catch {} }
      Alert.alert(t('auth.signup_done_title'), t('auth.verify_code'));
    } catch (e:any) {
      setErr(e?.message ?? t('auth.error_during_login'));
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.wrap}>
        <Image
          source={require('../../../assets/co-onn.png')}
          style={{ width: 260, height: 280, resizeMode: 'contain', marginBottom: 26 }}
        />
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

        {/* 소셜 버튼 모음 */}
        <SocialLoginButtons
          loading={loading}
          onApple={Platform.OS === 'ios' ? signInWithApple : undefined}
          onGoogle={signInWithGoogle}
          onFacebook={signInWithFacebook}
          onKakao={signInWithKakao}
          onPhone={openPhoneForm}
          onEmail={openEmailForm}
        />

        {/* 이메일 폼 */}
        {authMode === 'email' && (
          <View style={styles.formWrap}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {t('auth.with_email_title', { mode: t(isSignUp ? 'auth.mode_signup' : 'auth.mode_login') })}
              </Text>
              <Pressable onPress={() => setIsSignUp(v => !v)}>
                <Text style={styles.formSwitch}>
                  {isSignUp ? t('auth.have_account') : t('auth.new_here')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.inputBox}>
                <TextInput
                  placeholder={t('auth.email_placeholder')}
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                />
              </View>
              <View style={styles.inputBox}>
                <TextInput
                  placeholder={t('auth.password_placeholder')}
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoCorrect={false}
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                />
              </View>
              <Pressable
                onPress={handleEmailSubmit}
                disabled={loading || !email || !password}
                style={[
                  styles.cta,
                  (!email || !password || loading) && styles.ctaDisabled,
                ]}
              >
                <Text style={styles.ctaText}>{t(isSignUp ? 'auth.signup' : 'auth.login')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* 휴대폰 폼 */}
        {authMode === 'phone' && (
          <View style={styles.formWrap}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {t('auth.with_phone_title', { mode: t(isSignUp ? 'auth.mode_signup' : 'auth.mode_login') })}
              </Text>
              <Pressable onPress={() => setIsSignUp(v => !v)}>
                <Text style={styles.formSwitch}>
                  {isSignUp ? t('auth.have_account') : t('auth.new_here')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={{ color:'#666', marginBottom:6 }}>{t('auth.phone_hint')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  placeholder={t('auth.phone_placeholder')}
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                />
              </View>
              <View style={styles.inputBox}>
                <TextInput
                  placeholder={t('auth.password_placeholder')}
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoCorrect={false}
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                />
              </View>

              {isSignUp && (
                <View style={styles.inputBox}>
                  <TextInput
                    placeholder={t('auth.otp_placeholder')}
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    autoCorrect={false}
                    value={otp}
                    onChangeText={setOtp}
                    style={styles.input}
                  />
                </View>
              )}

              <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
                <Pressable
                  onPress={handlePhoneSubmit}
                  disabled={loading || !phone || !password}
                  style={[
                    styles.ctaHalf, { backgroundColor:'#6B7280' },
                    (!phone || !password || loading) && styles.ctaDisabled,
                  ]}
                >
                  <Text style={styles.ctaText}>
                    {isSignUp ? t('auth.signup_send_code') : t('auth.login')}
                  </Text>
                </Pressable>

                {isSignUp && (
                  <Pressable
                    onPress={verifyPhoneOnce}
                    disabled={loading || !phone || !otp}
                    style={[
                      styles.ctaHalf,
                      (!phone || !otp || loading) && styles.ctaDisabled,
                    ]}
                  >
                    <Text style={styles.ctaText}>{t('auth.verify_code')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 8 }} />
        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />}

        {!!err && <Text style={styles.err}>{err}</Text>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  subtitle: { color: '#fff', opacity: 0.9, marginBottom: 18 },
  err: { color: '#ffe4e6', textAlign: 'center', marginTop: 16 },

  formWrap: { width:'86%', marginTop: 14 },
  formHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  formTitle: { color:'#fff', fontSize:16 },
  formSwitch: { color:'#ffd' },

  card: { backgroundColor:'#fff', borderRadius:12, padding:12 },
  inputBox: { backgroundColor:'#f5f5f5', borderRadius:8, paddingHorizontal:10, marginBottom:10 },
  input: { height: 46, color:'#000' },

  cta: { backgroundColor:'#2F80ED', borderRadius:10, height:46, alignItems:'center', justifyContent:'center' },
  ctaHalf: { flex:1, backgroundColor:'#2F80ED', borderRadius:10, height:46, alignItems:'center', justifyContent:'center' },
  ctaText: { color:'#fff', fontWeight:'600' },
  ctaDisabled: { opacity: 0.6 },
});