// src/screens/auth/PhoneVerification.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';
const HAIRLINE = '#E5E7EB';
const ACCENT = '#111827';

type ProfileRow = {
  id: string;
  phone_number?: string | null;
  phone_verified?: boolean | null;
};

type Country = {
  code: string;
  name: string;
  dialCode: string; // 숫자만 (예: "82", "1")
};

// 기본 국가 리스트 (필요하면 이후 확장)
const COUNTRIES: Country[] = [
  { code: 'KR', name: 'South Korea', dialCode: '82' },
  { code: 'US', name: 'United States', dialCode: '1' },
  { code: 'JP', name: 'Japan', dialCode: '81' },
  { code: 'CN', name: 'China', dialCode: '86' },
  { code: 'GB', name: 'United Kingdom', dialCode: '44' },
  { code: 'DE', name: 'Germany', dialCode: '49' },
  { code: 'FR', name: 'France', dialCode: '33' },
];

type PhoneErrorCode = 'empty' | 'short' | 'long';

// 국가번호 + 로컬번호 → E.164-ish
function toE164(phone: string, countryDial: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+${countryDial}${local}`;
}

// 에러 코드를 리턴 (실제 문구는 i18n 으로)
function getPhoneErrorCode(phone: string): PhoneErrorCode | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return 'empty';
  if (digits.length < 6) return 'short';
  if (digits.length > 15) return 'long';
  return null;
}

export default function PhoneVerification() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const [meId, setMeId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [countryModalOpen, setCountryModalOpen] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const mapPhoneError = (code: PhoneErrorCode | null): string | null => {
    if (!code) return null;
    if (code === 'empty') return t('phone.phone_helper_empty');
    if (code === 'short') return t('phone.phone_helper_invalid_short');
    return t('phone.phone_helper_invalid_long');
  };

  // ───────────────── 초기 로드: 유저 + 프로필 상태 확인 ─────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // 로그인 안 되어 있으면 AuthStack 으로
        Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
        navigation.reset({
          index: 0,
          routes: [{ name: 'AuthStack' as never }],
        });
        return;
      }

      setMeId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone_number, phone_verified')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? null) as ProfileRow | null;

      const savedPhone = row?.phone_number ?? '';
      const verified = !!row?.phone_verified;

      // 이미 인증된 유저면 바로 메인으로
      if (verified) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' as never }],
        });
        return;
      }

      setPhone(savedPhone);
      setPhoneVerified(false);
      setPhoneError(null);
      setOtp('');
      setOtpSent(false);
    } catch (e: any) {
      Alert.alert(
        t('errors.common'),
        e?.message ?? t('errors.unknown'),
      );
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);

  useEffect(() => {
    load();
  }, [load]);

  // ───────────────── 안드로이드 하드웨어 뒤로가기 → 앱 종료 ─────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleCancel = () => {
    BackHandler.exitApp();
  };

  // ───────────────── 입력 핸들러 ─────────────────
  const handleChangePhone = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setPhone(digits);
    setPhoneError(null);
    setPhoneVerified(false);
    setOtp('');
    setOtpSent(false);
  };

  const handleSelectCountry = (c: Country) => {
    setSelectedCountry(c);
    setCountryModalOpen(false);
  };

  // ───────────────── 인증번호 보내기 ─────────────────
  const handleSendPhoneOtp = async () => {
    const errCode = getPhoneErrorCode(phone);
    if (errCode) {
      const msg = mapPhoneError(errCode)!;
      setPhoneError(msg);
      Alert.alert(t('errors.common'), msg);
      return;
    }

    if (!meId) {
      Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
      return;
    }

    try {
      setOtpSending(true);
      setPhoneError(null);

      const e164 = toE164(phone, selectedCountry.dialCode);

      const { error } = await supabase.auth.updateUser({
        phone: e164,
      });

      if (error) throw error;

      setOtpSent(true);
      setOtp('');
      Alert.alert(t('common.ok'), t('phone.send_code_success'));
    } catch (e: any) {
      Alert.alert(
        t('errors.common'),
        e?.message ?? t('phone.send_code_failed'),
      );
    } finally {
      setOtpSending(false);
    }
  };

  // ───────────────── 인증번호 확인 ─────────────────
  const handleVerifyPhoneOtp = async () => {
    const errCode = getPhoneErrorCode(phone);
    if (errCode) {
      const msg = mapPhoneError(errCode)!;
      setPhoneError(msg);
      Alert.alert(t('errors.common'), msg);
      return;
    }

    if (!otp.trim()) {
      const msg = t('phone.verify_code_required');
      Alert.alert(t('errors.common'), msg);
      return;
    }

    if (!meId) {
      Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
      return;
    }

    try {
      setOtpVerifying(true);
      const e164 = toE164(phone, selectedCountry.dialCode);

      const { error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp.trim(),
        type: 'phone_change',
      } as any);

      if (error) throw error;

      const digits = phone.replace(/\D/g, '');

      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          phone_number: digits,
          phone_verified: true,
        })
        .eq('id', meId);

      if (upErr) throw upErr;

      setPhoneVerified(true);
      setOtp('');
      setOtpSent(false);

      Alert.alert(t('common.ok'), t('phone.verify_success'), [
        {
          text: t('common.ok'),
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' as never }],
            });
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert(
        t('errors.common'),
        e?.message ?? t('phone.verify_failed'),
      );
    } finally {
      setOtpVerifying(false);
    }
  };

  // ───────────────── 로딩 상태 ─────────────────
  if (loading) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={['#833ab4', '#fd1d1d', '#fcb045']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.overlay} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator color="#fff" />
            <Text style={[styles.loadingText, { color: '#e5e7eb' }]}>
              {t('common.loading')}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* TermsConsent 와 동일한 그라데이션 배경 */}
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.overlay} />
      <StatusBar style="light" />

      <SafeAreaView style={styles.safe}>
        {/* 상단: 닫기 버튼만 */}
        <View style={styles.topRow}>
          <Pressable onPress={handleCancel} hitSlop={12}>
            <Text style={styles.backTxt}>{t('common.close')}</Text>
          </Pressable>
          <View />
        </View>

        {/* 중앙 플로팅 카드 */}
        <View style={styles.cardWrap}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.card}>
              {/* 상단 타이틀 */}
              <Text style={styles.summaryTitle}>{t('phone.title')}</Text>
              <Text style={styles.summaryText}>{t('phone.subtitle')}</Text>
              <Text style={styles.summaryMeta}>
                {t('phone.global_support')}
              </Text>

              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* 국가 선택 */}
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>
                    {t('phone.country_label')}
                  </Text>
                  <Pressable
                    style={styles.countryRow}
                    onPress={() => setCountryModalOpen(true)}
                  >
                    <View>
                      <Text style={styles.countryName}>
                        {selectedCountry.name}
                      </Text>
                      <Text style={styles.countrySub}>
                        +{selectedCountry.dialCode}
                      </Text>
                    </View>
                    <Text style={styles.countryChevron}>⌵</Text>
                  </Pressable>
                </View>

                {/* 전화번호 입력 */}
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>
                    {t('phone.phone_label')}
                  </Text>
                  <View style={styles.phoneInputRow}>
                    <Text style={styles.countryDialPrefix}>
                      +{selectedCountry.dialCode}
                    </Text>
                    <TextInput
                      value={phone}
                      onChangeText={handleChangePhone}
                      style={styles.textInput}
                      placeholder={t('phone.phone_placeholder')}
                      keyboardType="phone-pad"
                      maxLength={15}
                    />
                  </View>

                  <View style={styles.helperRow}>
                    {phoneError && (
                      <Text style={styles.helperError}>{phoneError}</Text>
                    )}
                    {!phoneError && !!phone && !otpSent && !phoneVerified && (
                      <Text style={styles.helperInfo}>
                        {t('phone.phone_helper_hint')}
                      </Text>
                    )}
                    {!phoneError && !!phone && phoneVerified && (
                      <Text style={styles.helperOk}>
                        {t('phone.verify_success')}
                      </Text>
                    )}
                    {!phoneError && !phone && (
                      <Text style={styles.helperInfo}>
                        {t('phone.phone_helper_default')}
                      </Text>
                    )}
                  </View>

                  <View style={styles.rowButtons}>
                    <Pressable
                      style={[
                        styles.smallButton,
                        (!phone || otpSending || phoneVerified) &&
                          styles.smallButtonDisabled,
                      ]}
                      onPress={handleSendPhoneOtp}
                      disabled={!phone || otpSending || phoneVerified}
                    >
                      {otpSending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.smallButtonText}>
                          {t('phone.send_code')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* OTP 입력 */}
                {otpSent && !phoneVerified && (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>
                      {t('phone.code_label')}
                    </Text>
                    <Text style={styles.otpCaption}>
                      {t('phone.code_caption')}
                    </Text>
                    <View style={styles.otpRow}>
                      <TextInput
                        value={otp}
                        onChangeText={setOtp}
                        style={styles.otpInput}
                        placeholder={t('phone.code_placeholder')}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                      <Pressable
                        style={[
                          styles.smallButton,
                          styles.otpButton,
                          (!otp || otpVerifying) &&
                            styles.smallButtonDisabled,
                        ]}
                        onPress={handleVerifyPhoneOtp}
                        disabled={!otp || otpVerifying}
                      >
                        {otpVerifying ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.smallButtonText}>
                            {t('phone.verify_code')}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* 안내 텍스트 */}
                <View style={styles.bottomHintBox}>
                  <Text style={styles.bottomHintTitle}>
                    {t('phone.why_needed_title')}
                  </Text>
                  <Text style={styles.bottomHintText}>
                    {t('phone.why_needed_body')}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>

      {/* 국가 선택 모달 */}
      <Modal
        visible={countryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCountryModalOpen(false)}
        />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {t('phone.country_select_title')}
          </Text>
          <ScrollView
            style={{ maxHeight: 320 }}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {COUNTRIES.map((c) => {
              const on = c.code === selectedCountry.code;
              return (
                <Pressable
                  key={c.code}
                  style={[styles.countryItemRow, on && styles.countryItemOn]}
                  onPress={() => handleSelectCountry(c)}
                >
                  <View>
                    <Text
                      style={[
                        styles.countryItemName,
                        on && { color: '#111827' },
                      ]}
                    >
                      {c.name}
                    </Text>
                    <Text
                      style={[
                        styles.countryItemDial,
                        on && { color: '#4b5563' },
                      ]}
                    >
                      +{c.dialCode}
                    </Text>
                  </View>
                  {on && (
                    <Text style={styles.countryItemCheck}>●</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  safe: {
    flex: 1,
    alignItems: 'center',
  },

  topRow: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backTxt: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '500',
  },

  cardWrap: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxHeight: 560,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,253,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: TEXT_MUTED,
  },

  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 4,
  },
  summaryMeta: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 10,
  },

  listScroll: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 2,
  },

  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 4,
  },

  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#f9fafb',
  },
  countryName: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MAIN,
  },
  countrySub: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  countryChevron: {
    fontSize: 16,
    color: '#9ca3af',
  },

  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    backgroundColor: '#F9FAFB',
  },
  countryDialPrefix: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_MAIN,
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },

  helperRow: {
    marginTop: 6,
    minHeight: 18,
  },
  helperError: {
    fontSize: 12,
    color: '#EF4444',
  },
  helperInfo: {
    fontSize: 12,
    color: '#6B7280',
  },
  helperOk: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },

  rowButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  smallButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  otpCaption: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: 6,
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otpInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    backgroundColor: '#F9FAFB',
    fontSize: 15,
    color: TEXT_MAIN,
  },
  otpButton: {
    paddingHorizontal: 16,
  },

  bottomHintBox: {
    marginTop: 4,
  },
  bottomHintTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 3,
  },
  bottomHintText: {
    fontSize: 11,
    color: TEXT_MUTED,
    lineHeight: 18,
  },

  // 국가선택 모달
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '22%',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 8,
  },
  countryItemRow: {
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  countryItemOn: {
    backgroundColor: '#f3f4ff',
  },
  countryItemName: {
    fontSize: 13,
    color: '#111827',
  },
  countryItemDial: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  countryItemCheck: {
    fontSize: 14,
    color: '#111827',
  },
});
