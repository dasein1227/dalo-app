// src/screens/report/Guide.tsx
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
import { ArrowLeft } from 'lucide-react-native';

import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { createReportTheme, type ReportTheme } from './Report.theme';
import { fetchReportGuide, resolveReportLang } from './api/report.read';
import type { ReportGuide, ReportGuideParams } from './types';

export default function ReportGuideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createReportTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(C), [C]);
  const params = (route.params ?? {}) as ReportGuideParams;
  const { t } = useAppTranslation(['report', 'common']);

  const [loading, setLoading] = useState(true);
  const [guide, setGuide] = useState<ReportGuide | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const lang = await resolveReportLang(params.lang);
      const data = await fetchReportGuide(params.guideKey, lang);
      setGuide(data);
    } catch (e: any) {
      Alert.alert(t('report:alert.loadFail'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [params.guideKey, params.lang, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pageTitle = guide?.title ?? params.fallbackTitle ?? t('report:guide.title');

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

        <Text style={styles.headerTitle}>{t('report:guide.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.text} />
        </View>
      ) : !guide ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.emptyText}>{t('report:guide.empty')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>{pageTitle}</Text>

          {!!guide.intro_text && <Text style={styles.intro}>{guide.intro_text}</Text>}

          <View style={styles.bulletCard}>
            {guide.bullet_items.map((item, index) => (
              <View
                key={`${guide.guide_key}-${index}`}
                style={[
                  styles.bulletRow,
                  index === guide.bullet_items.length - 1 && styles.bulletRowLast,
                ]}
              >
                <Text style={styles.bulletMark}>·</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          {!!guide.footer_text && <Text style={styles.footer}>{guide.footer_text}</Text>}
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
  emptyText: {
    fontSize: 15,
    color: C.textSecondary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 42,
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: C.text,
    lineHeight: 33,
    letterSpacing: -0.45,
    marginBottom: 16,
  },
  intro: {
    fontSize: 14.5,
    lineHeight: 23,
    color: C.textSecondary,
    marginBottom: 18,
    letterSpacing: -0.1,
  },
  bulletCard: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: C.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
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
  footer: {
    fontSize: 14,
    lineHeight: 23,
    color: C.textMuted,
    letterSpacing: -0.06,
  },
});
