// src/screens/settings/support/PolicyViewer.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeScreen from '@/components/layout/SafeScreen';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import i18next from 'i18next';

import {
  ChevronLeft,
  ChevronDown,
  Check,
  Download,
  FileText,
} from 'lucide-react-native';

import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { useAppTranslation } from '@/i18n/useAppTranslation';
import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import { createSupportTheme } from './supportTheme';

type PolicyType = 'terms' | 'privacy' | 'marketing';

type PolicyVersion = {
  id: string;
  type: PolicyType;
  locale: string;
  title: string;
  version: string;
  summary: string | null;
  content: string;
  is_active: boolean | null;
  is_bold: boolean | null;
  effective_date: string;
  published_at?: string | null;
  created_at?: string | null;
};

type PolicyAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_POLICY_ALERT: PolicyAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

const normalizePolicyLocale = (locale?: string | null) => {
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
  return raw.slice(0, 2) || 'ko';
};

const getLocaleLabel = (locale: string) => {
  switch (normalizePolicyLocale(locale)) {
    case 'ko':
      return '한국어';
    case 'en':
      return 'English';
    case 'ja':
      return '日本語';
    case 'zh':
      return '中文';
    case 'es':
      return 'Español';
    case 'pt':
      return 'Português';
    case 'fr':
      return 'Français';
    case 'de':
      return 'Deutsch';
    case 'id':
      return 'Bahasa Indonesia';
    case 'hi':
      return 'हिन्दी';
    case 'ru':
      return 'Русский';
    case 'ar':
      return 'العربية';
    case 'vi':
      return 'Tiếng Việt';
    case 'tr':
      return 'Türkçe';
    case 'th':
      return 'ไทย';
    case 'it':
      return 'Italiano';
    default:
      return locale.toUpperCase();
  }
};

const uniqueLocales = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const sanitizeFileName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'coonn_policy';

const AccordionItem = ({ title, content, colors }: any) => {
  const [expanded, setExpanded] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  const toggleAccordion = () => {
    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);
    Animated.timing(animation, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const spin = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[styles.accordionContainer, { borderBottomColor: colors.borderSoft }]}> 
      <Pressable style={styles.accordionHeader} onPress={toggleAccordion}>
        <Text style={[styles.accordionTitle, { color: colors.textMain }]}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <ChevronDown size={20} color={colors.textSub} />
        </Animated.View>
      </Pressable>
      {expanded && (
        <View style={[styles.accordionContent, { backgroundColor: colors.accordionBg }]}> 
          <Text style={[styles.accordionText, { color: colors.textSub }]}> 
            {content.replace(/\\n/g, '\n')}
          </Text>
        </View>
      )}
    </View>
  );
};

export default function PolicyViewer() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createSupportTheme(appTheme);
  const { t } = useAppTranslation('settings');
  const alertTheme = appTheme.isDark ? 'coonn_dark' : 'coonn_light';

  const policyType: PolicyType = route.params?.type || 'terms';
  const appLocale = normalizePolicyLocale(i18next.resolvedLanguage || i18next.language || 'ko');

  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PolicyVersion | null>(null);
  const [resolvedLocale, setResolvedLocale] = useState(appLocale);
  const [alertState, setAlertState] = useState<PolicyAlertState>(EMPTY_POLICY_ALERT);
  const [modalVisible, setModalVisible] = useState(false);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  const showAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
    });
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;

    if (resolvedLocale !== 'ko') {
      const month = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    }

    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }, [resolvedLocale]);

  const buildPolicyDownloadText = useCallback((policy: PolicyVersion) => {
    const normalizedContent = policy.content.replace(/\\n/g, '\n');
    const normalizedSummary = policy.summary?.trim();
    const lines = [
      policy.title,
      `${t('settings:support.policy.version', { defaultValue: '버전' })}: ${policy.version}`,
      `${t('settings:support.policy.effectiveDate')}: ${formatDate(policy.effective_date)}`,
      `${t('settings:support.policy.language', { defaultValue: '언어' })}: ${getLocaleLabel(policy.locale)}`,
      '',
    ];

    if (normalizedSummary) {
      lines.push(t('settings:support.policy.summary'), normalizedSummary, '');
    }

    lines.push(normalizedContent);
    return lines.join('\n');
  }, [formatDate, t]);

  useEffect(() => {
    let cancelled = false;

    const normalizeRows = (rows: any[]) =>
      rows.map((item) => ({
        ...item,
        type: item.type || policyType,
        locale: normalizePolicyLocale(item.locale),
        summary: item.summary ?? null,
        is_active: item.is_active ?? false,
        is_bold: item.is_bold ?? false,
      })) as PolicyVersion[];

    const pickLocale = (rows: PolicyVersion[], candidates: string[]) => {
      for (const locale of candidates) {
        if (rows.some((item) => item.locale === locale)) return locale;
      }
      return rows[0]?.locale || appLocale;
    };

    const fetchPolicyData = async () => {
      const preferredCandidates = uniqueLocales([appLocale, 'en', 'ko']);

      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('policies')
          .select('id, type, locale, title, version, summary, content, is_active, is_bold, effective_date, published_at, created_at')
          .eq('type', policyType)
          .in('locale', preferredCandidates)
          .order('is_active', { ascending: false })
          .order('effective_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;

        let rows = normalizeRows(data ?? []);

        if (rows.length === 0) {
          const fallback = await supabase
            .from('policies')
            .select('id, type, locale, title, version, summary, content, is_active, is_bold, effective_date, published_at, created_at')
            .eq('type', policyType)
            .order('is_active', { ascending: false })
            .order('effective_date', { ascending: false })
            .order('created_at', { ascending: false });

          if (fallback.error) throw fallback.error;
          rows = normalizeRows(fallback.data ?? []);
        }

        if (cancelled) return;

        const nextLocale = pickLocale(rows, preferredCandidates);
        const nextVersions = rows.filter((item) => item.locale === nextLocale);

        setResolvedLocale(nextLocale);
        setVersions(nextVersions);
        setSelectedVersion(nextVersions[0] ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error('정책 문서 로딩 실패:', error);
          setVersions([]);
          setSelectedVersion(null);
          showAlert(
            t('settings:support.alert.error', { defaultValue: '오류' }),
            t('settings:support.policy.loadFail', { defaultValue: '정책 문서를 불러오지 못했습니다.' }),
            'danger',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPolicyData();

    return () => {
      cancelled = true;
    };
  }, [appLocale, policyType, showAlert, t]);

  const handleSummary = useCallback(() => {
    if (!selectedVersion) return;

    showAlert(
      t('settings:support.policy.summary'),
      selectedVersion.summary?.trim() || t('settings:support.policy.summaryEmpty', { defaultValue: '등록된 요약이 없습니다.' }),
    );
  }, [selectedVersion, showAlert, t]);

  const handleDownload = useCallback(async () => {
    if (!selectedVersion) return;

    const fileName = `${sanitizeFileName(`${selectedVersion.title}_${selectedVersion.locale}_${selectedVersion.version}`)}.txt`;
    const fileText = `\uFEFF${buildPolicyDownloadText(selectedVersion)}`;

    try {
      if (
        Platform.OS === 'android' &&
        FileSystem.StorageAccessFramework?.requestDirectoryPermissionsAsync &&
        FileSystem.StorageAccessFramework?.createFileAsync
      ) {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted || !permission.directoryUri) {
          showAlert(
            t('settings:support.policy.downloadCancelledTitle', { defaultValue: '다운로드 취소' }),
            t('settings:support.policy.downloadCancelled', { defaultValue: '저장 위치를 선택하지 않았습니다.' }),
          );
          return;
        }

        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          'text/plain',
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, fileText, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        if (!FileSystem.documentDirectory) throw new Error('documentDirectory is unavailable');
        const uri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, fileText, { encoding: FileSystem.EncodingType.UTF8 });
      }

      showAlert(
        t('settings:support.policy.downloadSuccessTitle', { defaultValue: '다운로드 완료' }),
        t('settings:support.policy.downloadSuccess', { defaultValue: '정책 문서를 저장했습니다.' }),
      );
    } catch (error) {
      console.error('정책 문서 다운로드 실패:', error);
      showAlert(
        t('settings:support.policy.downloadFailTitle', { defaultValue: '다운로드 실패' }),
        t('settings:support.policy.downloadFail', { defaultValue: '정책 문서를 저장하지 못했습니다.' }),
        'danger',
      );
    }
  }, [buildPolicyDownloadText, selectedVersion, showAlert, t]);

  return (
    <SafeScreen
      backgroundColor={colors.bg}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: colors.bg, borderBottomColor: colors.borderSoft }]}> 
        <View style={styles.headerInner}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIcon}>
            <ChevronLeft size={22} color={colors.textMain} strokeWidth={2.1} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textMain }]} numberOfLines={1}>
            {selectedVersion ? selectedVersion.title : t('settings:support.policy.title')}
          </Text>
          <View style={styles.headerIcon} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMain} />
        </View>
      ) : selectedVersion ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.controlSection, { backgroundColor: colors.sectionBg, borderBottomColor: colors.divider }]}> 
            <Pressable
              style={[styles.versionSelector, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setModalVisible(true)}
            >
              <View style={styles.versionSelectorTextBox}>
                <Text style={[styles.versionTitle, { color: colors.textMain }]} numberOfLines={1}>
                  {selectedVersion.title} ({selectedVersion.version})
                </Text>
                <Text style={[styles.versionDate, { color: colors.textSub }]}> 
                  {t('settings:support.policy.effectiveDate')}: {formatDate(selectedVersion.effective_date)} · {getLocaleLabel(resolvedLocale)}
                </Text>
              </View>
              <ChevronDown size={20} color={colors.textMain} />
            </Pressable>


            <View style={styles.utilRow}>
              <Pressable style={[styles.utilBtn, { borderColor: colors.border }]} onPress={handleSummary}>
                <FileText size={16} color={colors.textMain} style={{ marginRight: 6 }} />
                <Text style={[styles.utilBtnText, { color: colors.textMain }]}>{t('settings:support.policy.summary')}</Text>
              </Pressable>

              <Pressable style={[styles.utilBtn, { borderColor: colors.border }]} onPress={handleDownload}>
                <Text style={[styles.utilBtnText, { color: colors.textMain, marginRight: 6 }]}>{t('settings:support.policy.download')}</Text>
                <Download size={16} color={colors.textMain} />
              </Pressable>
            </View>
          </View>

          <View style={styles.contentSection}>
            {selectedVersion.content.includes('#ACCORDION#') ? (
              <>
                <Text style={[styles.policyText, { color: colors.textMain, marginBottom: 20 }]}> 
                  {selectedVersion.content.replace(/\\n/g, '\n').split('#ACCORDION#')[0]}
                </Text>
                <AccordionItem
                  title={t('settings:support.policy.behaviorInfoTitle')}
                  content={t('settings:support.policy.behaviorInfoDesc')}
                  colors={colors}
                />
                <AccordionItem
                  title={t('settings:support.policy.userControlTitle')}
                  content={t('settings:support.policy.userControlDesc')}
                  colors={colors}
                />
              </>
            ) : (
              <Text style={[styles.policyText, { color: colors.textMain }]}> 
                {selectedVersion.content.replace(/\\n/g, '\n')}
              </Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={{ color: colors.textSub }}>{t('settings:support.policy.empty')}</Text>
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.modalBackdrop }]} onPress={() => setModalVisible(false)}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.bottomSheet,
                {
                  backgroundColor: colors.modalBg,
                  paddingBottom: Math.max(insets.bottom + 24, 40),
                },
              ]}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.textMain }]}>{t('settings:support.policy.versions')}</Text>

              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {versions.map((v) => {
                  const isActive = selectedVersion?.id === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.versionItem,
                        isActive && { backgroundColor: colors.pressShadow },
                      ]}
                      onPress={() => {
                        setSelectedVersion(v);
                        setModalVisible(false);
                      }}
                    >
                      <View style={styles.versionItemTextBox}>
                        <Text
                          style={[
                            styles.versionItemTitle,
                            { color: isActive ? colors.textMain : colors.textSub },
                            isActive && { fontWeight: '600' },
                          ]}
                          numberOfLines={1}
                        >
                          {v.title} ({v.version})
                        </Text>
                        <Text style={[styles.versionItemDate, { color: colors.textSub }]}> 
                          {t('settings:support.policy.effectiveDate')}: {formatDate(v.effective_date)}
                        </Text>
                      </View>
                      {isActive && <Check size={20} color={colors.textMain} strokeWidth={3} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </Modal>

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={t('common:ok', { defaultValue: '확인' })}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerInner: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headerIcon: { width: 40, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.25 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 60 },

  controlSection: { padding: 20, borderBottomWidth: 8 },
  versionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    marginBottom: 14,
  },
  versionSelectorTextBox: { flex: 1, paddingRight: 10 },
  versionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4, letterSpacing: -0.15 },
  versionDate: { fontSize: 13, fontWeight: '500' },

  utilRow: { flexDirection: 'row', justifyContent: 'space-between' },
  utilBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  utilBtnText: { fontSize: 13, fontWeight: '500' },

  contentSection: { paddingHorizontal: 20, paddingVertical: 24 },
  policyText: { fontSize: 15, lineHeight: 27, letterSpacing: -0.12 },

  accordionContainer: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 16 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accordionTitle: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 16, lineHeight: 22 },
  accordionContent: { marginTop: 16, padding: 16, borderRadius: 16 },
  accordionText: { fontSize: 14, lineHeight: 24 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingBottom: 40, paddingHorizontal: 20 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 17, fontWeight: '600', marginBottom: 18 },
  versionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8 },
  versionItemTextBox: { flex: 1, paddingRight: 12 },
  versionItemTitle: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  versionItemDate: { fontSize: 13 },
});
