// src/screens/auth/PhoneVerification.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { PHONE_COUNTRIES, type PhoneCountry } from '@/constants/phoneCountries';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

const { width, height } = Dimensions.get('window');

type Step = 'phone' | 'code';
type PhoneValidation = 'empty' | 'short' | 'long' | null;

type PhoneOtpResponse = {
  ok?: boolean;
  error?: string;
  expiresInSeconds?: number;
  phoneLast4?: string;
  phoneVerifiedAt?: string;
};

function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

function resetRoot(navigation: any, routeName: string) {
  getRootNavigation(navigation).dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: routeName }],
    }),
  );
}

function sanitizeDigits(value: string) {
  return String(value ?? '').replace(/\D/g, '');
}

function sanitizeOtp(value: string) {
  return sanitizeDigits(value).slice(0, 6);
}

function toE164(localPhone: string, countryDialCode: string) {
  const digits = sanitizeDigits(localPhone);
  if (!digits) return '';
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+${countryDialCode}${local}`;
}

function validatePhone(localPhone: string): PhoneValidation {
  const digits = sanitizeDigits(localPhone);
  if (!digits) return 'empty';
  if (digits.length < 6) return 'short';
  if (digits.length > 15) return 'long';
  return null;
}

function isFunctionUnavailable(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('not found') || message.includes('404') || message.includes('function');
}

function mapServerError(code: unknown, fallback: string) {
  switch (String(code ?? '').trim()) {
    case 'unauthorized':
      return '로그인이 필요합니다.';
    case 'invalid_phone':
      return '전화번호 형식이 올바르지 않습니다.';
    case 'too_many_requests':
      return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'too_many_attempts':
      return '인증 시도 횟수를 초과했습니다. 새 인증번호를 받아 주세요.';
    case 'invalid_code':
      return '인증번호가 올바르지 않습니다.';
    case 'code_expired':
      return '인증번호가 만료되었습니다. 다시 받아 주세요.';
    case 'verification_failed':
      return '인증번호를 확인하지 못했습니다.';
    default:
      return fallback;
  }
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
        ]),
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
      ]),
    ).start();

    createMoveLoop(translate1, 12000, -width * 0.4);
    createMoveLoop(translate2, 15000, -height * 0.3);
  }, [breathing, translate1, translate2]);

  const opacity = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const scale = breathing.interpolate({
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
        colors={['#0F0524', '#240B36', '#1A0B2E'] as const}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          animatedLayerStyle,
          {
            opacity: 0.58,
            transform: [{ translateX: translate1 }, { translateY: translate2 }, { scale }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', '#3A0CA3', '#7209B7', 'transparent'] as const}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          animatedLayerStyle,
          {
            opacity,
            transform: [
              { translateX: Animated.multiply(translate2, -0.5) },
              { translateY: Animated.multiply(translate1, 0.5) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', '#4CC9F0', '#F72585', 'transparent'] as const}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
    </View>
  );
};

export default function PhoneVerification() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>('phone');
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(PHONE_COUNTRIES[0]);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const tx = useCallback(
    (key: string, fallback: string) => t(`phone.${key}`, { defaultValue: fallback }) as string,
    [t],
  );

  const entry = String(route.params?.entry ?? route.params?.source ?? 'onboarding');
  const fromSettings = entry === 'settings';

  const e164 = useMemo(() => toE164(phone, selectedCountry.dialCode), [phone, selectedCountry.dialCode]);
  const validation = useMemo(() => validatePhone(phone), [phone]);
  const phoneDigits = useMemo(() => sanitizeDigits(phone), [phone]);
  const codeReady = otp.length === 6;
  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) return PHONE_COUNTRIES;

    return PHONE_COUNTRIES.filter((country) => {
      const haystack = `${country.name} ${country.code} +${country.dialCode}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [countryQuery]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        NativeStatusBar.setBarStyle('light-content');
        if (Platform.OS === 'android') {
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor('transparent');
        }
      }, 80);

      return () => clearTimeout(timer);
    }, []),
  );

  const handleBack = useCallback(() => {
    if (fromSettings && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    BackHandler.exitApp();
  }, [fromSettings, navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => sub.remove();
  }, [handleBack]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          resetRoot(navigation, 'AuthStack');
          return;
        }

        const { data } = await supabase
          .from('profiles')
          .select('phone_verified_at, phone_country_code, phone_last4')
          .eq('id', user.id)
          .maybeSingle();

        if (!alive) return;

        if ((data as any)?.phone_verified_at && !fromSettings) {
          resetRoot(navigation, 'MainTabs');
          return;
        }
      } catch {
        // Gate 준비 단계에서는 화면 자체를 유지한다.
      } finally {
        if (alive) setBooting(false);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [fromSettings, navigation]);

  const show = useCallback(
    (message: string, tone: 'default' | 'success' | 'danger' = 'default') => {
      showToast({ message, tone, showMark: tone !== 'default' });
    },
    [showToast],
  );

  const getValidationMessage = useCallback(() => {
    if (validation === 'empty') return tx('phone_helper_empty', '전화번호를 입력해 주세요.');
    if (validation === 'short') return tx('phone_helper_invalid_short', '전화번호가 너무 짧습니다.');
    if (validation === 'long') return tx('phone_helper_invalid_long', '전화번호가 너무 깁니다.');
    return null;
  }, [tx, validation]);



  const handleChangePhone = useCallback((text: string) => {
    setPhone(sanitizeDigits(text).slice(0, 15));
    setPhoneError(null);
    setOtp('');
    setStep('phone');
  }, []);

  const handleSelectCountry = useCallback((country: PhoneCountry) => {
    setSelectedCountry(country);
    setCountryQuery('');
    setCountryModalOpen(false);
    setPhoneError(null);
    setOtp('');
    setStep('phone');
  }, []);

  const handleSendCode = useCallback(async () => {
    const message = getValidationMessage();
    if (message) {
      setPhoneError(message);
      show(message, 'danger');
      return;
    }

    try {
      setBusy(true);
      setPhoneError(null);

      const { data, error } = await supabase.functions.invoke<PhoneOtpResponse>('phone-otp-start', {
        body: {
          phone: e164,
          countryCode: selectedCountry.code,
          dialCode: selectedCountry.dialCode,
        },
      });

      if (error) {
        if (isFunctionUnavailable(error)) {
          show(tx('service_not_ready', '전화번호 인증은 아직 준비 중입니다.'), 'default');
          return;
        }
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setSentTo(e164);
      setOtp('');
      setStep('code');
      show(tx('send_code_success', '인증번호를 보냈습니다.'), 'success');
    } catch (error: any) {
      show(mapServerError(error?.message, tx('send_code_failed', '인증번호를 보내지 못했습니다.')), 'danger');
    } finally {
      setBusy(false);
    }
  }, [e164, getValidationMessage, selectedCountry.code, selectedCountry.dialCode, show, tx]);

  const handleVerifyCode = useCallback(async () => {
    if (!codeReady) {
      show(tx('verify_code_required', '6자리 인증번호를 입력해 주세요.'), 'danger');
      return;
    }

    try {
      setBusy(true);

      const { data, error } = await supabase.functions.invoke<PhoneOtpResponse>('phone-otp-check', {
        body: {
          phone: sentTo || e164,
          countryCode: selectedCountry.code,
          token: otp,
        },
      });

      if (error) {
        if (isFunctionUnavailable(error)) {
          show(tx('service_not_ready', '전화번호 인증은 아직 준비 중입니다.'), 'default');
          return;
        }
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      show(tx('verify_success', '전화번호 인증이 완료되었습니다.'), 'success');

      if (fromSettings && navigation.canGoBack()) {
        navigation.goBack();
        return;
      }

      resetRoot(navigation, 'MainTabs');
    } catch (error: any) {
      show(mapServerError(error?.message, tx('verify_failed', '인증번호를 확인하지 못했습니다.')), 'danger');
    } finally {
      setBusy(false);
    }
  }, [codeReady, e164, fromSettings, navigation, otp, selectedCountry.code, sentTo, show, tx]);

  const primaryDisabled = busy || !phoneDigits;
  const codeDisabled = busy || !codeReady;

  if (booting) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <AuroraBackground />
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.loadingText}>{tx('loading', '준비 중입니다.')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AuroraBackground />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboard}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.topRow}>
              <Pressable
                onPress={handleBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={fromSettings ? tx('back', '뒤로가기') : tx('exit', '나가기')}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <ChevronLeft size={22} color="rgba(255,255,255,0.88)" strokeWidth={2.05} />
              </Pressable>
            </View>

            <View style={styles.logoStage}>
              <Image source={require('../../../assets/co-onn.png')} style={styles.logo} />
            </View>

            <View style={styles.authCard}>
              <Text style={styles.title}>{tx('title', '전화번호 인증')}</Text>
              <Text style={styles.subtitle}>{tx('subtitle_short', '안전한 이용을 위해 전화번호를 인증해 주세요.')}</Text>

              <Pressable
                style={({ pressed }) => [styles.countrySelector, pressed && styles.softPressed]}
                onPress={() => {
                  setCountryQuery('');
                  setCountryModalOpen(true);
                }}
              >
                <Text style={styles.countrySelectorText} numberOfLines={1}>
                  {selectedCountry.name}  +{selectedCountry.dialCode}
                </Text>
                <ChevronDown
                  size={18}
                  color="rgba(255,255,255,0.58)"
                  strokeWidth={1.9}
                  style={styles.chevronIcon}
                />
              </Pressable>

              <TextInput
                value={phone}
                onChangeText={handleChangePhone}
                style={[styles.input, phoneError && styles.inputError]}
                placeholder={tx('phone_placeholder', '전화번호를 입력해 주세요')}
                placeholderTextColor="rgba(255,255,255,0.46)"
                keyboardType="phone-pad"
                maxLength={15}
                returnKeyType="done"
              />

              {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  primaryDisabled && styles.primaryButtonDisabled,
                  pressed && !primaryDisabled && styles.primaryPressed,
                ]}
                onPress={handleSendCode}
                disabled={primaryDisabled}
              >
                {busy && step === 'phone' ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.primaryButtonText}>{tx('send_code', '인증번호 받기')}</Text>
                )}
              </Pressable>

              <Text style={styles.privacyNote}>{tx('privacy_note', '번호는 공개되지 않으며 인증과 보안 목적으로만 사용됩니다.')}</Text>

              {step === 'code' ? (
                <View style={styles.codeSection}>
                  <Text style={styles.codeCaption}>{tx('code_caption', '문자로 받은 6자리 인증번호를 입력해 주세요.')}</Text>
                  <TextInput
                    value={otp}
                    onChangeText={(text) => setOtp(sanitizeOtp(text))}
                    style={styles.input}
                    placeholder={tx('code_placeholder', '6자리 숫자')}
                    placeholderTextColor="rgba(255,255,255,0.46)"
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                  />
                  <View style={styles.codeButtonRow}>
                    <Pressable
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.softPressed]}
                      onPress={handleSendCode}
                      disabled={busy}
                    >
                      <Text style={styles.secondaryButtonText}>{tx('resend_code', '다시 받기')}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.verifyButton,
                        codeDisabled && styles.primaryButtonDisabled,
                        pressed && !codeDisabled && styles.primaryPressed,
                      ]}
                      onPress={handleVerifyCode}
                      disabled={codeDisabled}
                    >
                      {busy && step === 'code' ? (
                        <ActivityIndicator color="#0F172A" />
                      ) : (
                        <Text style={styles.verifyButtonText}>{tx('verify_code', '인증하기')}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={countryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCountryModalOpen(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{tx('country_select_title', '국가 선택')}</Text>
          <TextInput
            value={countryQuery}
            onChangeText={setCountryQuery}
            style={styles.countrySearchInput}
            placeholder={tx('country_search_placeholder', '국가 또는 번호 검색')}
            placeholderTextColor="rgba(17,24,39,0.36)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalListContent}>
            {filteredCountries.length === 0 ? (
              <Text style={styles.countryEmptyText}>{tx('country_search_empty', '검색 결과가 없습니다.')}</Text>
            ) : null}
            {filteredCountries.map((country, index) => {
              const selected = country.code === selectedCountry.code;
              const isLast = index === filteredCountries.length - 1;

              return (
                <Pressable
                  key={`${country.code}-${country.dialCode}`}
                  style={({ pressed }) => [
                    styles.countryRow,
                    !isLast && styles.countryRowDivider,
                    pressed && styles.softPressed,
                  ]}
                  onPress={() => handleSelectCountry(country)}
                >
                  <Text style={[styles.countryName, selected && styles.countryNameSelected]} numberOfLines={1}>
                    {country.name}  +{country.dialCode}
                  </Text>
                  {selected ? <View style={styles.selectedDot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Platform.OS === 'ios' ? 34 : 26}
        onHidden={hideToast}
      />
    </View>
  );
}

const CARD_RADIUS = 20;
const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0524',
  },
  safe: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 34 : 28,
  },
  topRow: {
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.095)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  logoStage: {
    minHeight: Math.min(360, Math.max(270, height * 0.43)),
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 34,
  },
  logo: {
    width: Math.min(width * 0.58, 246),
    height: Math.min(width * 0.58, 246),
    resizeMode: 'contain',
  },
  authCard: {
    width: '100%',
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.105)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '500',
    letterSpacing: -0.45,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 19,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  countrySelector: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15,23,42,0.32)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  countrySelectorText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.25,
  },
  chevronIcon: {
    marginLeft: 10,
  },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 15,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.25,
    backgroundColor: 'rgba(15,23,42,0.34)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  inputError: {
    borderColor: 'rgba(239,68,68,0.62)',
  },
  errorText: {
    marginTop: 7,
    color: '#FCA5A5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  primaryButton: {
    height: 54,
    marginTop: 14,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  primaryButtonDisabled: {
    opacity: 0.42,
  },
  primaryPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.997 }],
  },
  primaryButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  privacyNote: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '400',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  codeSection: {
    marginTop: 17,
    paddingTop: 16,
    borderTopWidth: HAIRLINE,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  codeCaption: {
    marginBottom: 10,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  codeButtonRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    height: 48,
    paddingHorizontal: 17,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.105)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  secondaryButtonText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  verifyButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  verifyButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  softPressed: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.72,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '400',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  modalCard: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: '20%',
    maxHeight: '58%',
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(17,24,39,0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 12,
  },
  modalTitle: {
    marginBottom: 10,
    paddingHorizontal: 4,
    color: '#111827',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  countrySearchInput: {
    height: 46,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 10,
    color: '#111827',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
    backgroundColor: '#F8F9FA',
    borderWidth: HAIRLINE,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  countryEmptyText: {
    paddingVertical: 18,
    textAlign: 'center',
    color: 'rgba(17,24,39,0.48)',
    fontSize: 14,
    fontWeight: '400',
  },
  modalListContent: {
    paddingBottom: 4,
  },
  countryRow: {
    minHeight: 50,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryRowDivider: {
    borderBottomWidth: HAIRLINE,
    borderBottomColor: 'rgba(17,24,39,0.07)',
  },
  countryName: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  countryNameSelected: {
    fontWeight: '600',
  },
  selectedDot: {
    width: 7,
    height: 7,
    marginLeft: 12,
    borderRadius: 3.5,
    backgroundColor: '#111827',
  },
});
