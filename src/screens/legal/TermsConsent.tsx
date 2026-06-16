// src/screens/legal/TermsConsent.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';

import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { useAppTheme } from '@/theme/useAppTheme';
import { resetSupabaseAuthStorage, supabase } from '@/lib/supabase';
import { createTermsConsentTheme } from './TermsConsent.theme';

type PolicyType = 'terms' | 'privacy' | 'marketing';

type PolicyDocument = {
  id: string;
  type: PolicyType;
  locale: string;
  title: string;
  version: string;
  summary: string | null;
  effective_date: string;
};

type PolicyMap = Record<PolicyType, PolicyDocument | null>;

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  singleButton: boolean;
  confirmText: string;
  cancelText: string;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_ALERT: AlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  confirmText: '확인',
  cancelText: '취소',
  onConfirm: undefined,
};

const POLICY_TYPES: PolicyType[] = ['terms', 'privacy', 'marketing'];

const EMPTY_POLICIES: PolicyMap = {
  terms: null,
  privacy: null,
  marketing: null,
};

function normalizePolicyLocale(locale?: string | null) {
  const raw = String(locale || 'ko').trim().toLowerCase().replace('_', '-');
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('id')) return 'id';
  if (raw.startsWith('hi')) return 'hi';
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('ar')) return 'ar';
  if (raw.startsWith('vi')) return 'vi';
  if (raw.startsWith('tr')) return 'tr';
  if (raw.startsWith('th')) return 'th';
  if (raw.startsWith('it')) return 'it';
  return raw.split('-')[0] || 'ko';
}

function i18nToProfileLang(i18nLang?: string | null) {
  const base = normalizePolicyLocale(i18nLang);
  if (base === 'ko') return 'KO';
  if (base === 'en') return 'EN';
  if (base === 'ja') return 'JA';
  if (base === 'zh') return 'ZH';
  if (base === 'es') return 'ES';
  if (base === 'pt') return 'PT';
  if (base === 'fr') return 'FR';
  if (base === 'de') return 'DE';
  if (base === 'id') return 'ID';
  if (base === 'hi') return 'HI';
  if (base === 'ru') return 'RU';
  if (base === 'ar') return 'AR';
  if (base === 'vi') return 'VI';
  if (base === 'tr') return 'TR';
  if (base === 'th') return 'TH';
  if (base === 'it') return 'IT';
  return 'KO';
}

function pickPolicyForType(
  rows: PolicyDocument[],
  type: PolicyType,
  appLocale: string,
): PolicyDocument | null {
  const candidates = rows.filter((row) => row.type === type);
  if (candidates.length === 0) return null;

  return (
    candidates.find((row) => normalizePolicyLocale(row.locale) === appLocale) ||
    candidates.find((row) => normalizePolicyLocale(row.locale) === 'en') ||
    candidates.find((row) => normalizePolicyLocale(row.locale) === 'ko') ||
    candidates[0] ||
    null
  );
}

function formatDate(dateString?: string | null, locale = 'ko') {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  if (locale !== 'ko') {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getLatestEffectiveDate(policies: PolicyMap) {
  const dates = POLICY_TYPES
    .map((type) => policies[type]?.effective_date)
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => Number.isFinite(value));

  if (dates.length === 0) return null;
  return new Date(Math.max(...dates)).toISOString();
}

export default function TermsConsent() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation(['legal', 'common']);

  const appTheme = useAppTheme();
  const colors = useMemo(() => createTermsConsentTheme(appTheme), [appTheme]);
  const alertTheme = appTheme.isDark ? 'coonn_dark' : 'coonn_light';

  const appLocale = useMemo(
    () => normalizePolicyLocale((i18n as any)?.resolvedLanguage || (i18n as any)?.language || 'ko'),
    [i18n],
  );

  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<PolicyMap>(EMPTY_POLICIES);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);

  const requiredReady = Boolean(policies.terms?.id && policies.privacy?.id);
  const agreeAll = agreeTerms && agreePrivacy && agreeMarketing;
  const canSubmit = agreeTerms && agreePrivacy && requiredReady && !busy;
  const latestEffectiveAt = getLatestEffectiveDate(policies);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  }, []);

  const showAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      singleButton: true,
      confirmText: t('common:ok', { defaultValue: '확인' }),
      cancelText: t('common:cancel', { defaultValue: '취소' }),
      onConfirm: closeAlert,
    });
  }, [closeAlert, t]);

  const showConfirmAlert = useCallback((params: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: CoonnAlertVariant;
    onConfirm: () => void | Promise<void>;
  }) => {
    setAlertState({
      visible: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? 'default',
      singleButton: false,
      confirmText: params.confirmText ?? t('common:ok', { defaultValue: '확인' }),
      cancelText: params.cancelText ?? t('common:cancel', { defaultValue: '취소' }),
      onConfirm: params.onConfirm,
    });
  }, [t]);

  const handleAlertConfirm = useCallback(async () => {
    const action = alertState.onConfirm;
    closeAlert();
    await action?.();
  }, [alertState.onConfirm, closeAlert]);

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setBarStyle('dark-content');
      if (Platform.OS === 'android') {
        RNStatusBar.setTranslucent(false);
        RNStatusBar.setBackgroundColor(colors.headerBg);
      }
    }, [colors.headerBg]),
  );

  const loadPolicies = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('policies')
        .select('id, type, locale, title, version, summary, effective_date')
        .in('type', POLICY_TYPES)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = ((data || []) as PolicyDocument[]).filter((row) =>
        POLICY_TYPES.includes(row.type),
      );

      setPolicies({
        terms: pickPolicyForType(rows, 'terms', appLocale),
        privacy: pickPolicyForType(rows, 'privacy', appLocale),
        marketing: pickPolicyForType(rows, 'marketing', appLocale),
      });
    } catch (error) {
      console.warn('[TermsConsent] load policies failed:', error);
      setPolicies(EMPTY_POLICIES);
      showAlert(
        t('legal:consent.loadFailTitle', { defaultValue: '약관 불러오기 실패' }),
        t('legal:consent.loadFailMessage', { defaultValue: '약관 정보를 불러오지 못했습니다.' }),
        'danger',
      );
    } finally {
      setLoading(false);
    }
  }, [appLocale, showAlert, t]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const resetToLogin = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await resetSupabaseAuthStorage();
    } catch (error) {
      console.warn('[TermsConsent] decline cleanup failed:', error);
    } finally {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }
  }, [navigation]);

  const handleDecline = useCallback(() => {
    if (busy) return;

    showConfirmAlert({
      title: t('legal:consent.declineTitle', { defaultValue: '서비스 이용 불가' }),
      message: t('legal:consent.declineMessage', { defaultValue: '필수 약관에 동의해야 CO·ONN을 이용할 수 있습니다.' }),
      confirmText: t('legal:consent.declineConfirm', { defaultValue: '나가기' }),
      cancelText: t('legal:consent.declineCancel', { defaultValue: '돌아가기' }),
      variant: 'danger',
      onConfirm: resetToLogin,
    });
  }, [busy, resetToLogin, showConfirmAlert, t]);

  const handleClose = useCallback(() => {
    handleDecline();
  }, [handleDecline]);

  const openPolicyViewer = useCallback(
    (type: PolicyType) => {
      navigation.navigate('PolicyViewer', { type });
    },
    [navigation],
  );

  const toggleAll = useCallback(() => {
    const next = !agreeAll;
    setAgreeTerms(next);
    setAgreePrivacy(next);
    setAgreeMarketing(next);
  }, [agreeAll]);

  const persistProfileTermsAccepted = useCallback(
    async (userId: string, acceptedAt: string) => {
      const { data: updatedRows, error: updateError } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: acceptedAt,
        })
        .eq('user_id', userId)
        .select('user_id');

      if (updateError) throw updateError;

      if (updatedRows && updatedRows.length > 0) return;

      const resolved = (i18n as any)?.resolvedLanguage || (i18n as any)?.language || 'ko';
      const preferredLangDefault = i18nToProfileLang(resolved);

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          preferred_lang: preferredLangDefault,
          terms_accepted: true,
          terms_accepted_at: acceptedAt,
        });

      if (insertError) throw insertError;
    },
    [i18n],
  );

  const persistPolicyConsents = useCallback(
    async (userId: string, acceptedAt: string) => {
      const selectedPolicies = [
        policies.terms,
        policies.privacy,
        agreeMarketing ? policies.marketing : null,
      ].filter(Boolean) as PolicyDocument[];

      const rows = selectedPolicies.map((policy) => ({
        user_id: userId,
        policy_id: policy.id,
        policy_type: policy.type,
        locale: policy.locale,
        version: policy.version,
        accepted: true,
        accepted_at: acceptedAt,
        consent_source: 'app',
        device_locale: appLocale,
        metadata: {
          screen: 'TermsConsent',
          required: policy.type === 'terms' || policy.type === 'privacy',
        },
      }));

      if (rows.length === 0) return;

      const { error } = await supabase
        .from('user_policy_consents')
        .upsert(rows, { onConflict: 'user_id,policy_id' });

      if (error) throw error;
    },
    [agreeMarketing, appLocale, policies.marketing, policies.privacy, policies.terms],
  );

  const handleAgree = useCallback(async () => {
    if (busy) return;

    if (!requiredReady) {
      showAlert(
        t('legal:consent.requiredDocsMissingTitle', { defaultValue: '약관 확인 필요' }),
        t('legal:consent.requiredDocsMissingMessage', { defaultValue: '필수 약관 정보를 불러온 뒤 다시 시도해 주세요.' }),
        'danger',
      );
      return;
    }

    if (!agreeTerms || !agreePrivacy) {
      showAlert(
        t('legal:consent.requiredAgreeTitle', { defaultValue: '필수 동의 필요' }),
        t('legal:consent.requiredAgreeMessage', { defaultValue: '필수 항목에 동의해 주세요.' }),
      );
      return;
    }

    setBusy(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const userId = userData?.user?.id;
      if (!userId) {
        showAlert(
          t('common:error', { defaultValue: '오류' }),
          t('legal:consent.noUser', { defaultValue: '로그인 정보가 없습니다.' }),
          'danger',
        );
        return;
      }

      const acceptedAt = new Date().toISOString();

      await persistPolicyConsents(userId, acceptedAt);
      await persistProfileTermsAccepted(userId, acceptedAt);

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error) {
      console.warn('[TermsConsent] save failed:', error);
      showAlert(
        t('legal:consent.saveFailTitle', { defaultValue: '저장 실패' }),
        t('legal:consent.saveFailMessage', { defaultValue: '동의 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }),
        'danger',
      );
    } finally {
      setBusy(false);
    }
  }, [agreePrivacy, agreeTerms, busy, navigation, persistPolicyConsents, persistProfileTermsAccepted, requiredReady, showAlert, t]);

  const renderPolicyRow = ({
    type,
    required,
    checked,
    onToggle,
    title,
    desc,
  }: {
    type: PolicyType;
    required: boolean;
    checked: boolean;
    onToggle: () => void;
    title: string;
    desc: string;
  }) => {
    const policy = policies[type];

    return (
      <View style={[styles.policyRow, { borderBottomColor: colors.divider }]}> 
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={onToggle}
          hitSlop={12}
          style={styles.checkPressable}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: checked ? colors.controlSelected : colors.controlBorder,
                backgroundColor: checked ? colors.controlSelected : colors.controlBg,
              },
            ]}
          >
            {checked ? <Check size={13} color={colors.controlSelectedText} strokeWidth={2.6} /> : null}
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => openPolicyViewer(type)}
          style={({ pressed }) => [
            styles.policyContent,
            { backgroundColor: pressed ? colors.rowPressed : 'transparent' },
          ]}
        >
          <View style={styles.policyTextCol}>
            <View style={styles.policyTitleRow}>
              <Text style={[styles.policyTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {policy?.title || title}
              </Text>
              <View
                style={[
                  styles.policyKindBadge,
                  {
                    borderColor: required ? colors.requiredBorder : colors.optionalBorder,
                    backgroundColor: required ? colors.requiredBg : colors.optionalBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.policyKindBadgeText,
                    { color: required ? colors.requiredBadgeText : colors.optionalBadgeText },
                  ]}
                >
                  {required
                    ? t('legal:consent.required', { defaultValue: '필수' })
                    : t('legal:consent.optional', { defaultValue: '선택' })}
                </Text>
              </View>
            </View>
            <Text style={[styles.policyDesc, { color: colors.textSecondary }]} numberOfLines={1}>
              {desc}
            </Text>
          </View>
          <ChevronRight size={17} color={colors.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeScreen
      backgroundColor={colors.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{ backgroundColor: colors.headerBg, borderBottomColor: colors.headerBorder }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={handleClose}>
              <ChevronLeft size={22} color={colors.headerIcon} strokeWidth={2.1} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: colors.headerText }]}> 
              {t('legal:consent.headerTitle', { defaultValue: '서비스 약관' })}
            </Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(122, insets.bottom + 112) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}> 
            {t('legal:consent.eyebrow', { defaultValue: 'CO·ONN' })}
          </Text>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}> 
            {t('legal:consent.title', { defaultValue: '약관 확인' })}
          </Text>
          <Text style={[styles.heroDesc, { color: colors.textSecondary }]}> 
            {t('legal:consent.description', { defaultValue: '필수 항목만 동의하면 바로 시작할 수 있습니다.' })}
          </Text>
          {latestEffectiveAt ? (
            <Text style={[styles.heroMeta, { color: colors.textTertiary }]}> 
              {t('legal:consent.effectiveDate', { defaultValue: '시행일' })} {formatDate(latestEffectiveAt, appLocale)}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}> 
              {t('legal:consent.loading', { defaultValue: '불러오는 중…' })}
            </Text>
          </View>
        ) : (
          <View style={[styles.consentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            {!requiredReady ? (
              <View style={[styles.warningRow, { borderBottomColor: colors.divider }]}> 
                <Text style={[styles.warningText, { color: colors.warningText }]}> 
                  {t('legal:consent.requiredDocsMissingInline', { defaultValue: '필수 약관 문서가 준비되지 않았습니다.' })}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreeAll }}
              onPress={toggleAll}
              style={({ pressed }) => [
                styles.allRow,
                {
                  backgroundColor: pressed ? colors.rowPressed : 'transparent',
                  borderBottomColor: colors.divider,
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: agreeAll ? colors.controlSelected : colors.controlBorder,
                    backgroundColor: agreeAll ? colors.controlSelected : colors.controlBg,
                  },
                ]}
              >
                {agreeAll ? <Check size={13} color={colors.controlSelectedText} strokeWidth={2.6} /> : null}
              </View>
              <View style={styles.allTextCol}>
                <Text style={[styles.allTitle, { color: colors.textPrimary }]}> 
                  {t('legal:consent.allAgree', { defaultValue: '전체 동의' })}
                </Text>
                <Text style={[styles.allDesc, { color: colors.textSecondary }]}> 
                  {t('legal:consent.allAgreeDesc', { defaultValue: '필수와 선택 항목을 모두 동의합니다.' })}
                </Text>
              </View>
            </Pressable>

            {renderPolicyRow({
              type: 'terms',
              required: true,
              checked: agreeTerms,
              onToggle: () => setAgreeTerms((prev) => !prev),
              title: t('legal:consent.termsTitle', { defaultValue: 'CO·ONN 이용약관' }),
              desc: t('legal:consent.termsDesc', { defaultValue: '서비스 이용 기준' }),
            })}

            {renderPolicyRow({
              type: 'privacy',
              required: true,
              checked: agreePrivacy,
              onToggle: () => setAgreePrivacy((prev) => !prev),
              title: t('legal:consent.privacyTitle', { defaultValue: '개인정보 처리방침' }),
              desc: t('legal:consent.privacyDesc', { defaultValue: '개인정보 처리 기준' }),
            })}

            <View style={styles.lastRowWrapper}>
              {renderPolicyRow({
                type: 'marketing',
                required: false,
                checked: agreeMarketing,
                onToggle: () => setAgreeMarketing((prev) => !prev),
                title: t('legal:consent.marketingTitle', { defaultValue: '마케팅 수신' }),
                desc: t('legal:consent.marketingDesc', { defaultValue: '혜택과 소식' }),
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(12, insets.bottom + 8),
            backgroundColor: colors.background,
            borderTopColor: colors.headerBorder,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handleDecline}
          style={({ pressed }) => [
            styles.bottomButton,
            styles.rejectButton,
            {
              borderColor: colors.borderStrong,
              backgroundColor: pressed ? colors.rowPressed : colors.surface,
              opacity: busy ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[styles.rejectText, { color: colors.textSecondary }]}> 
            {t('legal:consent.declineButton', { defaultValue: '거부' })}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={handleAgree}
          style={({ pressed }) => [
            styles.bottomButton,
            styles.agreeButton,
            {
              backgroundColor: canSubmit ? colors.primaryBg : colors.primaryBgDisabled,
              opacity: pressed && canSubmit ? colors.pressedOpacity : 1,
            },
          ]}
        >
          {busy ? <ActivityIndicator color={colors.primaryText} /> : null}
          <Text style={[styles.agreeText, { color: canSubmit ? colors.primaryText : colors.primaryTextDisabled }]}> 
            {busy
              ? t('legal:consent.processing', { defaultValue: '처리 중…' })
              : t('legal:consent.agreeButton', { defaultValue: '동의' })}
          </Text>
        </Pressable>
      </View>

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.singleButton}
        dismissOnBackButton={alertState.singleButton}
        onConfirm={handleAlertConfirm}
        onCancel={closeAlert}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.35,
    marginLeft: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroSection: {
    paddingBottom: 18,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 9,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.55,
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    letterSpacing: -0.18,
  },
  heroMeta: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.08,
  },
  loadingCard: {
    minHeight: 118,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  consentCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  warningRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  allRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 8,
    borderWidth: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allTextCol: {
    flex: 1,
    marginLeft: 13,
  },
  allTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.25,
  },
  allDesc: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  policyRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRowWrapper: {
    marginBottom: -StyleSheet.hairlineWidth,
  },
  checkPressable: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 15,
    paddingVertical: 12,
    borderRadius: 0,
  },
  policyTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 20,
  },
  policyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 8,
  },
  policyTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  policyKindBadge: {
    height: 21,
    minWidth: 37,
    paddingHorizontal: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyKindBadgeText: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  policyDesc: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.08,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  bottomButton: {
    flex: 1,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  rejectButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  agreeButton: {},
  rejectText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.12,
  },
  agreeText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.12,
    marginLeft: 4,
  },
});
