// src/screens/auth/Login.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { FontAwesome5 } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { ensurePushTokenRegistered } from '@/lib/push/registerPushToken';

const { width, height } = Dimensions.get('window');

const AUTH_SCHEME = 'coonn';
const AUTH_PATH = 'auth/callback';

const extra: any =
  (Constants as any)?.expoConfig?.extra ||
  (Constants as any)?.manifest?.extra ||
  {};

const PHONE_VERIFICATION_REQUIRED =
  String(extra.EXPO_PUBLIC_PHONE_VERIFICATION_REQUIRED ?? 'false').toLowerCase() === 'true';

WebBrowser.maybeCompleteAuthSession?.();

function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

function resetToNested(navigation: any, path: string[]) {
  const build = (names: string[], i = 0): any =>
    i === names.length - 1
      ? { index: 0, routes: [{ name: names[i] }] }
      : { index: 0, routes: [{ name: names[i], state: build(names, i + 1) }] };

  navigation.dispatch(CommonActions.reset(build(path)));
}

async function ensureProfiles(uid: string) {
  const { error } = await supabase
    .from('profiles_private')
    .upsert([{ user_id: uid }], { onConflict: 'user_id' });

  if (error && (error as any).code !== '23505') {
    console.warn('[Login] profiles_private ensure failed:', error);
  }
}

function compactAppleFullName(fullName?: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) return '';
  return [fullName.givenName, fullName.middleName, fullName.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return typeof value === 'string' ? value : '';
}

const AuroraBackground = () => {
  const translate1 = useRef(new Animated.Value(0)).current;
  const translate2 = useRef(new Animated.Value(0)).current;
  const breathing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createMoveLoop = (animValue: Animated.Value, duration: number, toValue: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    createMoveLoop(translate1, 12000, -width * 0.4);
    createMoveLoop(translate2, 15000, -height * 0.3);
  }, [breathing, translate1, translate2]);

  const opacityInterp = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const scaleInterp = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const animatedLayerStyle = {
    position: 'absolute',
    width: width * 2,
    height: height * 2,
    top: -height * 0.4,
    left: -width * 0.5,
  } as const;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0F0524' }]}> 
      <LinearGradient
        colors={['#0F0524', '#240b36', '#1a0b2e'] as const}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          animatedLayerStyle,
          {
            transform: [{ translateX: translate1 }, { translateY: translate2 }, { scale: scaleInterp }],
            opacity: 0.6,
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', '#3a0ca3', '#7209b7', 'transparent'] as const}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          animatedLayerStyle,
          {
            transform: [
              { translateX: Animated.multiply(translate2, -0.5) },
              { translateY: Animated.multiply(translate1, 0.5) },
            ],
            opacity: opacityInterp,
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', '#4cc9f0', '#f72585', 'transparent'] as const}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
    </View>
  );
};

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation('auth');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clickingRef = useRef(false);
  const routingRef = useRef(false);
  const handledOAuthCodesRef = useRef<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        NativeStatusBar.setBarStyle('light-content');
        if (Platform.OS === 'android') {
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor('transparent');
        }
      }, 100);

      return () => clearTimeout(timer);
    }, [])
  );

  const goHome = useCallback(async () => {
    if (routingRef.current) return;
    routingRef.current = true;

    const root = getRootNavigation(navigation);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const uid = data?.session?.user?.id;
      if (!uid) {
        routingRef.current = false;
        return;
      }

      await ensureProfiles(uid);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('terms_accepted, terms_accepted_at, phone_verified_at')
        .eq('user_id', uid)
        .maybeSingle();

      if (profileError) throw profileError;

      const hasAcceptedTerms = Boolean(profile?.terms_accepted_at) || profile?.terms_accepted === true;

      if (!hasAcceptedTerms) {
        resetToNested(root, ['TermsConsent']);
        return;
      }

      try {
        await ensurePushTokenRegistered({ reason: 'login_go_home' });
      } catch (e) {
        console.warn('[Login] ensurePushTokenRegistered failed:', e);
      }

      if (PHONE_VERIFICATION_REQUIRED && !profile?.phone_verified_at) {
        resetToNested(root, ['PhoneVerification']);
        return;
      }

      resetToNested(root, ['MainTabs', 'Map', 'Main']);
    } catch (e) {
      console.warn('[Login] routing check error:', e);
      resetToNested(root, ['TermsConsent']);
    }
  }, [navigation]);

  const handleOAuthReturnUrl = useCallback(
    async (url: string) => {
      const parsed = Linking.parse(url);
      const qp = parsed.queryParams ?? {};
      const code = firstQueryValue(qp.code);
      const errorDesc = firstQueryValue(qp.error_description) || firstQueryValue(qp.error);

      if (errorDesc) {
        setErr(decodeURIComponent(errorDesc));
        return;
      }

      if (!code) return;

      if (handledOAuthCodesRef.current.has(code)) {
        return;
      }

      handledOAuthCodesRef.current.add(code);
      setLoading(true);

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          const { data: sessionData } = await supabase.auth.getSession();
          const message = String((error as any)?.message ?? '');

          if (sessionData?.session && message.includes('code verifier')) {
            await goHome();
            return;
          }

          throw error;
        }

        await goHome();
      } finally {
        setLoading(false);
      }
    },
    [goHome]
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void goHome();
      }
    });

    return () => sub.subscription?.unsubscribe();
  }, [goHome]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleOAuthReturnUrl(url).catch((e: any) => {
          console.warn('[Login] initial URL error:', e);
          setErr(e?.message ?? t('error_login'));
          setLoading(false);
        });
      }
    });

    const sub = Linking.addEventListener('url', (ev) => {
      if (!ev?.url) return;
      void handleOAuthReturnUrl(ev.url).catch((e: any) => {
        console.warn('[Login] URL listener error:', e);
        setErr(e?.message ?? t('error_login'));
        setLoading(false);
      });
    });

    return () => sub.remove();
  }, [handleOAuthReturnUrl, t]);

  const makeRedirectUri = useCallback(() => {
    return AuthSession.makeRedirectUri({
      scheme: AUTH_SCHEME,
      path: AUTH_PATH,
    } as any);
  }, []);

  const signInWithOAuthProvider = useCallback(
    async (provider: 'google' | 'apple') => {
      if (clickingRef.current) return;
      clickingRef.current = true;
      setErr(null);
      setLoading(true);

      try {
        const redirectTo = makeRedirectUri();

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        } as any);

        if (error) throw error;
        if (!data?.url) throw new Error(t('oauth_url_missing'));

        await WebBrowser.warmUpAsync?.();
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        await WebBrowser.coolDownAsync?.();

        if (result.type === 'success' && result.url) {
          await handleOAuthReturnUrl(result.url);
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          await goHome();
        }
      } catch (e: any) {
        console.warn('[Login] OAuth sign in error:', e);
        setErr(e?.message ?? t('error_login'));
      } finally {
        setLoading(false);
        clickingRef.current = false;
      }
    },
    [goHome, handleOAuthReturnUrl, makeRedirectUri, t]
  );

  const signInWithGoogle = useCallback(() => {
    void signInWithOAuthProvider('google');
  }, [signInWithOAuthProvider]);

  const signInWithAppleNative = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error(t('apple_identity_token_missing'));
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    } as any);

    if (error) throw error;

    const displayName = compactAppleFullName(credential.fullName);
    if (displayName) {
      const currentName = data?.user?.user_metadata?.full_name || data?.user?.user_metadata?.name;
      if (!currentName) {
        await supabase.auth.updateUser({
          data: {
            full_name: displayName,
            name: displayName,
          },
        });
      }
    }

    await goHome();
  }, [goHome, t]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      void signInWithOAuthProvider('apple');
      return;
    }

    if (clickingRef.current) return;
    clickingRef.current = true;
    setErr(null);
    setLoading(true);

    let shouldFallbackToOAuth = false;

    try {
      const available = await AppleAuthentication.isAvailableAsync();

      if (available) {
        await signInWithAppleNative();
        return;
      }

      shouldFallbackToOAuth = true;
    } catch (e: any) {
      const code = String(e?.code ?? '');
      if (code !== 'ERR_REQUEST_CANCELED' && code !== 'ERR_CANCELED') {
        console.warn('[Login] Apple sign in error:', e);
        setErr(e?.message ?? t('error_login'));
      }
    } finally {
      setLoading(false);
      clickingRef.current = false;
    }

    if (shouldFallbackToOAuth) {
      void signInWithOAuthProvider('apple');
    }
  }, [signInWithAppleNative, signInWithOAuthProvider, t]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AuroraBackground />

      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoSection}>
            <Image source={require('../../../assets/co-onn.png')} style={styles.logoImage} />
          </View>

          <View style={styles.buttonSection}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              onPress={signInWithGoogle}
              disabled={loading}
            >
              <Image
                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png' }}
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>{t('continue_google')}</Text>
            </Pressable>

            {Platform.OS === 'ios' ? (
              <View style={styles.appleNativeWrap}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={27}
                  style={styles.appleNativeButton}
                  onPress={signInWithApple}
                />
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, styles.appleButton, pressed && styles.buttonPressed]}
                onPress={signInWithApple}
                disabled={loading}
              >
                <FontAwesome5 name="apple" size={23} color="#fff" style={styles.appleIcon} />
                <Text style={styles.appleButtonText}>{t('continue_apple')}</Text>
              </Pressable>
            )}

            <Text style={styles.termsText}>{t('login_terms_note')}</Text>

            {!!err && <Text style={styles.errorText}>{err}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0524',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  logoSection: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: width * 0.55,
    height: width * 0.55,
    resizeMode: 'contain',
    shadowColor: '#A91079',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
  },
  buttonSection: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    marginBottom: Math.max(58, height * 0.085),
  },
  primaryButton: {
    width: '100%',
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  appleButton: {
    backgroundColor: '#050708',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  buttonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.992 }],
  },
  googleIcon: {
    width: 22,
    height: 22,
    marginRight: 12,
  },
  appleIcon: {
    marginRight: 11,
  },
  googleButtonText: {
    color: '#050505',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  appleNativeWrap: {
    width: '100%',
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  appleNativeButton: {
    width: '100%',
    height: 54,
  },
  termsText: {
    marginTop: 8,
    paddingHorizontal: 8,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.15,
  },
  errorText: {
    marginTop: 8,
    color: '#FF8A8A',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
});
