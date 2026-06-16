// src/screens/report/Done.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { createReportTheme, type ReportTheme } from './Report.theme';
import { fetchReportUiTexts, resolveReportLang } from './api/report.read';
import type { ReportDoneParams, ReportUiTexts } from './types';

export default function ReportDoneScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createReportTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(C), [C]);
  const params = (route.params ?? {}) as ReportDoneParams;
  const { t } = useAppTranslation(['report', 'common']);

  const [loading, setLoading] = useState(true);
  const [uiTexts, setUiTexts] = useState<ReportUiTexts>({});

  const title = useMemo(
    () => uiTexts['report.done.title'] ?? t('report:done.title'),
    [t, uiTexts],
  );

  const body = useMemo(
    () =>
      uiTexts['report.done.body'] ?? t('report:done.body'),
    [t, uiTexts],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const lang = await resolveReportLang(params.lang);
      const texts = await fetchReportUiTexts(lang);
      setUiTexts(texts);
    } catch (e: any) {
      Alert.alert(t('report:alert.loadFail'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [params.lang, t]);

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

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.text} />
        </View>
      ) : (
        <View style={[styles.content, { paddingTop: insets.top + 78 }]}> 
          <View style={styles.messageWrap}>
            <View style={styles.iconWrap}>
              <Check size={38} color={C.success} strokeWidth={3} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => navigation.popToTop()}
          >
            <Text style={styles.buttonText}>{t('common:ok')}</Text>
          </Pressable>
        </View>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  messageWrap: {
    flex: 1,
    alignItems: 'center',
  },
  iconWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: C.successSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.45,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 18,
    letterSpacing: -0.1,
  },
  button: {
    height: 56,
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onPrimary,
    letterSpacing: -0.12,
  },
});
