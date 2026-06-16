// src/screens/settings/PersonalityType.tsx

import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import { useAppTheme } from '@/theme/useAppTheme';
import {
  createPersonalityTypeTheme,
  type PersonalityTypeTheme,
} from './PersonalityType.theme';

type PersonalityAxis = {
  key: 'EI' | 'NS' | 'TF' | 'JP';
  leftLabel: string;
  rightLabel: string;
  leftPercent: number;
  rightPercent: number;
};

const SAMPLE_TYPE_CODE = 'ENTJ';

const SAMPLE_AXES: PersonalityAxis[] = [
  { key: 'EI', leftLabel: 'E', rightLabel: 'I', leftPercent: 80, rightPercent: 20 },
  { key: 'NS', leftLabel: 'N', rightLabel: 'S', leftPercent: 80, rightPercent: 20 },
  { key: 'TF', leftLabel: 'T', rightLabel: 'F', leftPercent: 65, rightPercent: 35 },
  { key: 'JP', leftLabel: 'J', rightLabel: 'P', leftPercent: 55, rightPercent: 45 },
];

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function PersonalityAxisBar({ axis, ui }: { axis: PersonalityAxis; ui: PersonalityTypeTheme }) {
  const leftPercent = clampPercent(axis.leftPercent);
  const rightPercent = clampPercent(axis.rightPercent);

  // Bar 좌측이 leftLabel, 우측이 rightLabel이므로
  // leftPercent가 높을수록 marker는 좌측에 가까워져야 한다.
  const markerLeft = clampPercent(100 - leftPercent);

  return (
    <View style={styles.axisBlock}>
      <View style={styles.axisTopRow}>
        <Text style={[styles.axisPole, { color: ui.colors.textPrimary }]}>{axis.leftLabel}</Text>
        <View
          style={[
            styles.axisTrack,
            {
              backgroundColor: ui.colors.barTrack,
              borderColor: ui.colors.barTrackBorder,
              borderWidth: ui.borderWidth.hairline,
            },
          ]}
        >
          <View
            style={[
              styles.axisMarker,
              {
                left: `${markerLeft}%` as DimensionValue,
                backgroundColor: ui.colors.barMarker,
                borderColor: ui.colors.barMarkerBorder,
                borderWidth: ui.borderWidth.hairline,
              },
            ]}
          />
        </View>
        <Text style={[styles.axisPole, styles.axisPoleRight, { color: ui.colors.textPrimary }]}>{axis.rightLabel}</Text>
      </View>

      <View style={styles.axisBottomRow}>
        <Text style={[styles.axisPercent, { color: ui.colors.textSecondary }]}>
          {axis.leftLabel} {leftPercent}%
        </Text>
        <Text style={[styles.axisPercent, { color: ui.colors.textSecondary }]}>
          {axis.rightLabel} {rightPercent}%
        </Text>
      </View>
    </View>
  );
}

export default function PersonalityType() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createPersonalityTypeTheme(appTheme), [appTheme]);
  const { t } = useTranslation(['settings', 'common']);

  const settingsText = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      String(t(`settings:${key}`, { defaultValue, ...(options ?? {}) })),
    [t],
  );

  const handleStartTest = useCallback(() => {
    // TODO: PersonalityTest 화면이 만들어지면 navigation.navigate('PersonalityTest')로 연결한다.
  }, []);

  return (
    <SafeScreen
      backgroundColor={ui.colors.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: ui.colors.headerBg,
          borderBottomColor: ui.colors.headerBorder,
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={ui.colors.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: ui.colors.headerText }]}>
              {settingsText('personality.title', 'Personality Type')}
            </Text>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 12) + 28 },
        ]}
      >
        <View
          style={[
            styles.resultCard,
            {
              backgroundColor: ui.colors.surface,
              borderColor: ui.colors.border,
              borderWidth: ui.borderWidth.hairline,
              ...ui.shadow.card,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: ui.colors.textSecondary }]}>
            {settingsText('personality.result_label', 'Your type')}
          </Text>

          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: ui.colors.typeBadgeBg,
                borderColor: ui.colors.typeBadgeBorder,
                borderWidth: ui.borderWidth.hairline,
              },
            ]}
          >
            <Text style={[styles.typeCode, { color: ui.colors.textPrimary }]}>
              {SAMPLE_TYPE_CODE}
            </Text>
          </View>

          <View style={styles.axisList}>
            {SAMPLE_AXES.map((axis) => (
              <PersonalityAxisBar key={axis.key} axis={axis} ui={ui} />
            ))}
          </View>
        </View>

        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: ui.colors.noticeBg,
              borderColor: ui.colors.noticeBorder,
              borderWidth: ui.borderWidth.hairline,
            },
          ]}
        >
          <Text style={[styles.noticeText, { color: ui.colors.textSecondary }]}>
            {settingsText(
              'personality.recommendation_notice',
              '이 정보는 더 잘 맞는 모임과 장소를 추천하는 데 활용됩니다.',
            )}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleStartTest}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: ui.colors.ctaBg,
              borderColor: ui.colors.ctaBorder,
              borderWidth: ui.borderWidth.hairline,
              opacity: pressed ? ui.opacity.pressed : 1,
            },
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: ui.colors.ctaText }]}>
            {settingsText('personality.action.retest', '다시 테스트하기')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  headerTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600',
    letterSpacing: -0.35,
    marginLeft: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  resultCard: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 20,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.05,
    textAlign: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    alignSelf: 'center',
    minWidth: 112,
    minHeight: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    marginBottom: 22,
  },
  typeCode: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  axisList: {
    gap: 18,
  },
  axisBlock: {
    gap: 7,
  },
  axisTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  axisPole: {
    width: 20,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.15,
    textAlign: 'left',
  },
  axisPoleRight: {
    textAlign: 'right',
  },
  axisTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    marginHorizontal: 10,
    justifyContent: 'center',
  },
  axisMarker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 999,
    marginLeft: -8,
    top: -5,
  },
  axisBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  axisPercent: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  noticeCard: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginTop: 14,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  primaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
