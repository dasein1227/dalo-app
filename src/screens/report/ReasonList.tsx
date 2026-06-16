// src/screens/report/ReasonList.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';

import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { createReportTheme, type ReportTheme } from './Report.theme';
import {
  fetchReportReasons,
  fetchReportUiTexts,
  resolveReportLang,
} from './api/report.read';
import type {
  ReportReasonItem,
  ReportReasonListParams,
  ReportUiTexts,
} from './types';

export default function ReportReasonListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createReportTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(C), [C]);
  const params = (route.params ?? {}) as ReportReasonListParams;
  const { t } = useAppTranslation(['report', 'common']);

  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [uiTexts, setUiTexts] = useState<ReportUiTexts>({});
  const [reasons, setReasons] = useState<ReportReasonItem[]>([]);

  const title = useMemo(
    () => uiTexts['report.reason_list.title'] ?? t('report:reasonList.title'),
    [t, uiTexts],
  );

  const guideLabel = useMemo(
    () => uiTexts['report.reason_list.guide_link_label'] ?? t('report:reasonList.guide'),
    [t, uiTexts],
  );

  const noticeText = useMemo(
    () => uiTexts['report.reason_list.notice'] ?? '',
    [uiTexts],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const resolvedLang = await resolveReportLang(params.lang);
      const [texts, reasonRows] = await Promise.all([
        fetchReportUiTexts(resolvedLang),
        fetchReportReasons(params.targetType, resolvedLang),
      ]);

      setLang(resolvedLang);
      setUiTexts(texts);
      setReasons(reasonRows ?? []);
    } catch (e: any) {
      Alert.alert(t('report:alert.loadFail'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [params.lang, params.targetType, t]);

  useEffect(() => {
    load();
  }, [load]);

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
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleArea}>
            <Text style={styles.pageTitle}>{title}</Text>
          </View>

          <View style={styles.listCard}>
            {reasons.map((item, index) => (
              <Pressable
                key={item.reason_key}
                style={({ pressed }) => [
                  styles.reasonRow,
                  pressed && styles.reasonRowPressed,
                  index === reasons.length - 1 && styles.reasonRowLast,
                ]}
                onPress={() =>
                  navigation.navigate('ReportReasonDetail', {
                    ...params,
                    lang,
                    reasonKey: item.reason_key,
                  })
                }
              >
                <Text style={styles.reasonTitle}>{item.title}</Text>
                <ChevronRight size={19} color={C.chevron} strokeWidth={2.2} />
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.guideLink, pressed && styles.guideLinkPressed]}
            onPress={() =>
              navigation.navigate('ReportGuide', {
                guideKey: 'community_guidelines',
                lang,
                fallbackTitle: guideLabel,
              })
            }
          >
            <Text style={styles.guideLinkText}>{guideLabel}</Text>
          </Pressable>

          {!!noticeText && <Text style={styles.notice}>{noticeText}</Text>}
        </ScrollView>
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
  content: {
    paddingTop: 26,
    paddingBottom: 46,
  },
  titleArea: {
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: C.text,
    lineHeight: 32,
    letterSpacing: -0.45,
  },
  listCard: {
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: C.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    overflow: 'hidden',
    shadowColor: C.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
  },
  reasonRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 17,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairlineSoft,
    backgroundColor: C.surface,
  },
  reasonRowPressed: {
    backgroundColor: C.pressed,
  },
  reasonRowLast: {
    borderBottomWidth: 0,
  },
  reasonTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '500',
    color: C.text,
    paddingRight: 12,
    letterSpacing: -0.18,
  },
  guideLink: {
    alignSelf: 'flex-start',
    marginTop: 22,
    marginHorizontal: 20,
    paddingVertical: 8,
    paddingHorizontal: 2,
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
  notice: {
    marginTop: 12,
    paddingHorizontal: 20,
    fontSize: 12,
    lineHeight: 18,
    color: C.textMuted,
  },
});
