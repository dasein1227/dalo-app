// src/screens/report/ReasonDetail.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertCircle } from 'lucide-react-native';

import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { createReportTheme, type ReportTheme } from './Report.theme';
import {
  fetchReportReasonDetail,
  fetchReportUiTexts,
  resolveReportLang,
} from './api/report.read';
import { submitReport } from './api/report.write';
import type {
  ReportReasonDetail,
  ReportReasonDetailParams,
  ReportUiTexts,
} from './types';

export default function ReportReasonDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createReportTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(C), [C]);
  const params = (route.params ?? {}) as ReportReasonDetailParams;
  const { t } = useAppTranslation(['report', 'common']);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [uiTexts, setUiTexts] = useState<ReportUiTexts>({});
  const [detail, setDetail] = useState<ReportReasonDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const resolvedLang = await resolveReportLang(params.lang);
      const [texts, detailData] = await Promise.all([
        fetchReportUiTexts(resolvedLang),
        fetchReportReasonDetail(
          params.targetType,
          params.reasonKey,
          resolvedLang,
        ),
      ]);

      setLang(resolvedLang);
      setUiTexts(texts);
      setDetail(detailData);
    } catch (e: any) {
      Alert.alert(t('report:alert.loadFail'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [params.lang, params.reasonKey, params.targetType, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submitLabel = useMemo(
    () => detail?.submit_button_label ?? t('report:reasonDetail.submit'),
    [detail?.submit_button_label, t],
  );

  const handleOpenGuide = useCallback(async () => {
    if (!detail) return;

    const externalUrl = detail.guide_link_url?.trim();

    if (externalUrl) {
      try {
        await Linking.openURL(externalUrl);
        return;
      } catch {
        Alert.alert(t('report:alert.info'), t('report:alert.linkOpenFail'));
        return;
      }
    }

    if (detail.guide_key) {
      navigation.navigate('ReportGuide', {
        guideKey: detail.guide_key,
        lang,
        fallbackTitle: detail.guide_link_label,
      });
    }
  }, [detail, lang, navigation, t]);

  const handleSubmit = useCallback(async () => {
    if (!detail || submitting) return;

    try {
      setSubmitting(true);

      await submitReport({
        targetType: params.targetType,
        targetId: params.targetId,
        reasonKey: params.reasonKey,
        lang,
        reportedUserId: params.reportedUserId ?? null,
        roomId: params.roomId ?? null,
        postId: params.postId ?? null,
        messageUids: params.messageUids ?? [],
        detailText: null,
      });

      navigation.replace('ReportDone', { lang });
    } catch (e: any) {
      Alert.alert(t('report:alert.submitFail'), e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }, [detail, lang, navigation, params, submitting, t]);

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset={false}
      includeBottomInset
      style={styles.container}
      contentStyle={styles.safeContent}
    >
      <RNStatusBar
        backgroundColor="transparent"
        barStyle={C.statusBarStyle}
        translucent={true}
      />

      <View style={[styles.header, { paddingTop: insets.top }]}> 
        <Pressable
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          hitSlop={10}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={23} color={C.icon} strokeWidth={2.3} />
        </Pressable>

        <Text style={styles.headerTitle}>
          {uiTexts['report.common.title'] ?? t('report:common.title')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.text} />
        </View>
      ) : !detail ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.emptyText}>{t('report:reasonDetail.empty')}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleArea}>
              <Text style={styles.pageTitle}>{detail.title}</Text>
              {!!detail.intro_text && (
                <Text style={styles.intro}>{detail.intro_text}</Text>
              )}
            </View>

            {detail.bullet_items.length > 0 && (
              <View style={styles.sectionCard}>
                {detail.bullet_items.map((item, index) => (
                  <View
                    key={`${detail.reason_key}-bullet-${index}`}
                    style={[
                      styles.bulletRow,
                      index === detail.bullet_items.length - 1 && styles.bulletRowLast,
                    ]}
                  >
                    <Text style={styles.bulletMark}>·</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {(detail.guide_key || detail.guide_link_url) && (
              <Pressable
                style={({ pressed }) => [styles.guideLink, pressed && styles.guideLinkPressed]}
                onPress={handleOpenGuide}
              >
                <Text style={styles.guideLinkText}>
                  {detail.guide_link_label ?? t('report:reasonDetail.more')}
                </Text>
              </Pressable>
            )}

            {detail.notice_boxes.length > 0 && (
              <View style={styles.noticeList}>
                {detail.notice_boxes.map((item, index) => (
                  <View
                    key={`${detail.reason_key}-notice-${index}`}
                    style={styles.noticeBox}
                  >
                    <Text style={styles.noticeBoxText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {(detail.warning_title || detail.warning_body) && (
              <View style={styles.warningWrap}>
                <View style={styles.warningTitleRow}>
                  <AlertCircle size={16} color={C.warning} strokeWidth={2.4} />
                  {!!detail.warning_title && (
                    <Text style={styles.warningTitle}>
                      {detail.warning_title}
                    </Text>
                  )}
                </View>

                {!!detail.warning_body && (
                  <Text style={styles.warningBody}>{detail.warning_body}</Text>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && !submitting && styles.submitBtnPressed,
                submitting && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.onPrimary} />
              ) : (
                <Text style={styles.submitBtnText}>{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeScreen>
  );
}

const createStyles = (C: ReportTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  safeContent: {
    flex: 1,
  },
  header: {
    backgroundColor: C.header,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: C.pressed,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
    marginLeft: 2,
    letterSpacing: -0.2,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: C.textSecondary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 28,
  },
  titleArea: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: C.text,
    marginBottom: 10,
    letterSpacing: -0.45,
    lineHeight: 32,
  },
  intro: {
    fontSize: 14.5,
    color: C.textSecondary,
    lineHeight: 23,
    letterSpacing: -0.08,
  },
  sectionCard: {
    marginBottom: 18,
    backgroundColor: C.surface,
    borderRadius: C.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    overflow: 'hidden',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairlineSoft,
  },
  bulletRowLast: {
    borderBottomWidth: 0,
  },
  bulletMark: {
    width: 16,
    fontSize: 18,
    lineHeight: 23,
    color: C.text,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 23,
    color: C.textSecondary,
    letterSpacing: -0.08,
  },
  guideLink: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    paddingVertical: 7,
  },
  guideLinkPressed: {
    opacity: 0.68,
  },
  guideLinkText: {
    fontSize: 14,
    color: C.link,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationColor: C.link,
  },
  noticeList: {
    marginBottom: 12,
  },
  noticeBox: {
    marginBottom: 10,
    backgroundColor: C.softSurface,
    borderRadius: C.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineSoft,
    padding: 15,
  },
  noticeBoxText: {
    fontSize: 13.5,
    lineHeight: 21,
    color: C.textSecondary,
    letterSpacing: -0.06,
  },
  warningWrap: {
    marginBottom: 24,
    backgroundColor: C.warningSurface,
    borderRadius: C.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.isDark ? 'rgba(255,138,101,0.26)' : 'rgba(224,98,67,0.18)',
    padding: 15,
  },
  warningTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.warning,
    marginLeft: 6,
    letterSpacing: -0.08,
  },
  warningBody: {
    fontSize: 13.5,
    lineHeight: 21,
    color: C.textSecondary,
    letterSpacing: -0.06,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: C.bottomBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairline,
  },
  submitBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnPressed: {
    opacity: 0.84,
  },
  submitBtnDisabled: {
    backgroundColor: C.primaryDisabled,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onPrimary,
    letterSpacing: -0.12,
  },
});
