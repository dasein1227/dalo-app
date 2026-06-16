// src/screens/settings/ThemeSettings.tsx

import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Moon, Smartphone, Sun } from 'lucide-react-native';

import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';

import { useAppTheme, type ThemePreference } from '@/theme/useAppTheme';
import { createThemeSettingsTheme, type ThemeSettingsTheme } from './ThemeSettings.theme';

type ThemeOption = ThemePreference;

type ThemeOptionItemProps = {
  mode: ThemeOption;
  title: string;
  desc: string;
  currentTheme: ThemePreference;
  theme: ThemeSettingsTheme;
  onSelect: (mode: ThemeOption) => void;
};

const ThemePreview = React.memo(({ type, theme }: { type: ThemeOption; theme: ThemeSettingsTheme }) => {
  const isDarkPreview = type === 'dark';
  const isSystem = type === 'system';

  const previewBg = isDarkPreview ? theme.darkPreviewBg : theme.lightPreviewBg;
  const previewSurface = isDarkPreview ? theme.darkPreviewSurface : theme.lightPreviewSurface;
  const previewSoft = isDarkPreview ? theme.darkPreviewSoft : theme.lightPreviewSoft;
  const previewLine = isDarkPreview ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  if (isSystem) {
    return (
      <View style={[styles.previewBox, { backgroundColor: theme.systemPreviewBg, borderColor: theme.previewBorder }]}>
        <View style={[styles.halfBg, { left: 0, backgroundColor: theme.lightPreviewBg }]} />
        <View style={[styles.halfBg, { right: 0, backgroundColor: theme.darkPreviewBg }]} />
        <View style={[styles.previewCenterIcon, { backgroundColor: theme.previewIconBg }]}>
          <Smartphone size={22} color={theme.previewIcon} strokeWidth={1.9} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.previewBox, { backgroundColor: previewBg, borderColor: theme.previewBorder }]}>
      <View style={[styles.fakeHeader, { borderColor: previewLine, backgroundColor: previewSurface }]} />
      <View style={styles.fakeContentGap}>
        {[1, 2].map((i) => (
          <View key={i} style={styles.fakeRow}>
            <View style={[styles.fakeAvatar, { backgroundColor: previewSurface, borderColor: previewLine }]} />
            <View style={styles.fakeTextGroup}>
              <View style={[styles.fakeLineLong, { backgroundColor: previewSoft }]} />
              <View style={[styles.fakeLineShort, { backgroundColor: previewSoft }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.previewCenterIcon, { backgroundColor: theme.previewIconBg }]}>
        {type === 'light' ? (
          <Sun size={20} color={theme.previewIcon} strokeWidth={1.9} />
        ) : (
          <Moon size={20} color={theme.previewIcon} strokeWidth={1.9} />
        )}
      </View>
    </View>
  );
});

const ThemeOptionItem = React.memo(
  ({ mode, title, desc, currentTheme, onSelect, theme }: ThemeOptionItemProps) => {
    const isSelected = currentTheme === mode;
    const scaleValue = useRef(new Animated.Value(1)).current;

    const onPressIn = () => {
      Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
    };

    const onPressOut = () => {
      Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    };

    return (
      <Pressable onPress={() => onSelect(mode)} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View
          style={[
            styles.optionCard,
            {
              backgroundColor: isSelected ? theme.cardSelectedBg : theme.cardBg,
              borderColor: isSelected ? theme.cardSelectedBorder : theme.cardBorder,
            },
            { transform: [{ scale: scaleValue }] },
          ]}
        >
          <View style={styles.optionLeft}>
            <ThemePreview type={mode} theme={theme} />
            <View style={styles.textContainer}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>{title}</Text>
              <Text style={[styles.optionDesc, { color: theme.textMuted }]}>{desc}</Text>
            </View>
          </View>
          <View style={styles.radioContainer}>
            {isSelected ? (
              <View style={[styles.radioSelected, { borderColor: theme.radioSelectedBorder }]}>
                <View style={[styles.radioDot, { backgroundColor: theme.radioDot }]} />
              </View>
            ) : (
              <View style={[styles.radioUnselected, { borderColor: theme.radioBorder }]} />
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  },
);

export default function ThemeSettings() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const theme = createThemeSettingsTheme(appTheme);
  const { preference, setThemePreference } = appTheme;

  const handleSelect = (mode: ThemeOption) => {
    setThemePreference(mode);
  };

  return (
    <SafeScreen
      backgroundColor={theme.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: theme.headerBg,
          borderBottomColor: theme.headerBorder,
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={theme.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.themeHeaderTitle, { color: theme.headerText }]}>
              {t('settings:theme.header_title')}
            </Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.sectionText }]}>
          {t('settings:theme.section_style')}
        </Text>

        <View style={styles.optionsContainer}>
          <ThemeOptionItem
            mode="system"
            title={t('settings:theme.mode.system')}
            desc={t('settings:theme.mode.system_desc')}
            currentTheme={preference}
            onSelect={handleSelect}
            theme={theme}
          />
          <ThemeOptionItem
            mode="light"
            title={t('settings:theme.mode.light')}
            desc={t('settings:theme.mode.light_desc')}
            currentTheme={preference}
            onSelect={handleSelect}
            theme={theme}
          />
          <ThemeOptionItem
            mode="dark"
            title={t('settings:theme.mode.dark')}
            desc={t('settings:theme.mode.dark_desc')}
            currentTheme={preference}
            onSelect={handleSelect}
            theme={theme}
          />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  themeHeaderTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: '500', marginBottom: 8, marginLeft: 4, letterSpacing: 0.05 },
  optionsContainer: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  textContainer: { flex: 1, minWidth: 0, paddingRight: 12 },
  optionTitle: { fontSize: 15, lineHeight: 20, fontWeight: '500', marginBottom: 3 },
  optionDesc: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  previewBox: {
    width: 58,
    height: 96,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  halfBg: { position: 'absolute', width: '50%', height: '100%' },
  fakeHeader: { height: 13, width: '100%', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  fakeContentGap: { gap: 7, paddingHorizontal: 8 },
  fakeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fakeAvatar: { width: 22, height: 22, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  fakeTextGroup: { gap: 4 },
  fakeLineLong: { width: 28, height: 5, borderRadius: 3 },
  fakeLineShort: { width: 18, height: 5, borderRadius: 3, opacity: 0.75 },
  previewCenterIcon: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioContainer: { paddingLeft: 8 },
  radioUnselected: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  radioSelected: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
