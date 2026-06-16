// src/screens/settings/Labs.tsx
import React, { useCallback, useMemo } from 'react';
import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FlaskConical } from 'lucide-react-native';

import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import { useAppTheme } from '@/theme/useAppTheme';
import { createSettingsLabsTheme } from './Labs.theme';

export default function SettingsLabs() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const appTheme = useAppTheme();
  const { isDark } = appTheme;
  const C = useMemo(() => createSettingsLabsTheme(appTheme), [appTheme]);

  const applyStatusBar = useCallback(() => {
    try {
      navigation.setOptions?.({
        headerShown: false,
        statusBarColor: 'transparent',
        statusBarStyle: isDark ? 'light' : 'dark',
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS === 'android') {
      try {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent', true);
        StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      } catch {}
    } else {
      try {
        StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      } catch {}
    }
  }, [isDark, navigation]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}
      timer = setTimeout(() => applyStatusBar(), 0);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [applyStatusBar]),
  );

  return (
    <SafeScreen backgroundColor={C.bg} includeTopInset={false} includeBottomInset>
      <GlobalHeader
        style={{ backgroundColor: C.headerBg, borderBottomColor: C.headerBorder }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={C.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: C.headerTitle }]}>
              {t('settings:labs.title')}
            </Text>
          </View>
        }
      />

      <View style={styles.content}>
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: C.cardBg, borderColor: C.cardBorder },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: C.iconBg, borderColor: C.iconBorder },
            ]}
          >
            <FlaskConical size={26} color={C.icon} strokeWidth={1.9} />
          </View>

          <Text style={[styles.emptyTitle, { color: C.title }]}>
            {t('settings:labs.empty_title')}
          </Text>
          <Text style={[styles.emptyBody, { color: C.body }]}>
            {t('settings:labs.empty_desc')}
          </Text>
        </View>

        <Text style={[styles.note, { color: C.note }]}>
          {t('settings:labs.note')}
        </Text>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', marginLeft: 4 },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
    textAlign: 'center',
  },
  note: {
    marginTop: 18,
    paddingHorizontal: 6,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    textAlign: 'center',
  },
});
