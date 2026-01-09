// src/screens/settings/ThemeSettings.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Inter_500Medium,
} from '@expo-google-fonts/inter';
import {
  NotoSansKR_500Medium,
} from '@expo-google-fonts/noto-sans-kr';
import { Quicksand_500Medium } from '@expo-google-fonts/quicksand';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { DancingScript_500Medium } from '@expo-google-fonts/dancing-script';
import { Sacramento_400Regular } from '@expo-google-fonts/sacramento';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { NotoSerif_600SemiBold } from '@expo-google-fonts/noto-serif';

type ThemePreset = 'light' | 'dark' | 'coonn' | 'custom';
type FontSizeOption = 'small' | 'medium' | 'large';
type FontFamilyOption =
  | 'system'
  | 'inter'
  | 'notoSansKr'
  | 'quicksand'
  | 'nunito'
  | 'robotoMono'
  | 'jetbrainsMono'
  | 'dancingScript'
  | 'sacramento'
  | 'playfairDisplay'
  | 'notoSerif';

type ThemeState = {
  // 기본 UI
  appBackground: string;
  headerBackground: string;
  headerText: string;
  headerIcon: string;
  headerBorder: string;
  cardBackground: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  alertText: string;
  divider: string;

  // 탭바
  tabBarBackground: string;
  tabBarIconActive: string;
  tabBarIconInactive: string;

  // 버튼
  primaryButtonBg: string;
  primaryButtonText: string;
  primaryButtonBorder: string;
  secondaryButtonBg: string;
  secondaryButtonText: string;
  secondaryButtonBorder: string;

  // 채팅
  chatBackground: string;
  chatHeaderBackground: string;
  chatHeaderText: string;
  chatInputBackground: string;
  chatInputText: string;
  chatMyBubble: string;
  chatMyText: string;
  chatOtherBubble: string;
  chatOtherText: string;
  chatSendButtonBg: string;
  chatSendButtonText: string;
};

// CO·ONN 로그인/약관 화면과 동일한 그라데이션 정보
// 실제 적용은 ThemeProvider에서 이 상수를 사용해서 처리하면 됨.
export const COONN_GRADIENT = {
  colors: ['#833ab4', '#fd1d1d', '#fcb045'] as const,
  overlay: 'rgba(0,0,0,0.16)',
};

const PRESET_THEMES: Record<ThemePreset, ThemeState> = {
  light: {
    // 기본 UI
    appBackground: '#ffffffff',
    headerBackground: '#FFFFFF',
    headerText: '#111827',
    headerIcon: '#111827',
    headerBorder: '#E5E7EB',
    cardBackground: '#FFFFFF',
    cardBorder: '#E5E7EB',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    alertText: '#EF4444',
    divider: '#E5E7EB',

    // 탭바
    tabBarBackground: '#FFFFFF',
    tabBarIconActive: '#111827',
    tabBarIconInactive: '#9CA3AF',

    // 버튼
    primaryButtonBg: '#111827',
    primaryButtonText: '#FFFFFF',
    primaryButtonBorder: '#111827',
    secondaryButtonBg: '#FFFFFF',
    secondaryButtonText: '#111827',
    secondaryButtonBorder: '#E5E7EB',

    // 채팅
    chatBackground: '#F3F4F6',
    chatHeaderBackground: '#FFFFFF',
    chatHeaderText: '#111827',
    chatInputBackground: '#FFFFFF',
    chatInputText: '#111827',
    chatMyBubble: '#111827',
    chatMyText: '#FFFFFF',
    chatOtherBubble: '#FFFFFF',
    chatOtherText: '#111827',
    chatSendButtonBg: '#111827',
    chatSendButtonText: '#FFFFFF',
  },
  dark: {
    // 기본 UI
    appBackground: '#020617',
    headerBackground: '#020617',
    headerText: '#F9FAFB',
    headerIcon: '#F9FAFB',
    headerBorder: '#1F2937',
    cardBackground: '#0F172A',
    cardBorder: '#1F2937',
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    alertText: '#F97373',
    divider: '#1F2937',

    // 탭바
    tabBarBackground: '#020617',
    tabBarIconActive: '#F9FAFB',
    tabBarIconInactive: '#6B7280',

    // 버튼
    primaryButtonBg: '#F9FAFB',
    primaryButtonText: '#020617',
    primaryButtonBorder: '#F9FAFB',
    secondaryButtonBg: '#0F172A',
    secondaryButtonText: '#E5E7EB',
    secondaryButtonBorder: '#374151',

    // 채팅
    chatBackground: '#020617',
    chatHeaderBackground: '#020617',
    chatHeaderText: '#F9FAFB',
    chatInputBackground: '#0F172A',
    chatInputText: '#F9FAFB',
    chatMyBubble: '#4B5563',
    chatMyText: '#F9FAFB',
    chatOtherBubble: '#111827',
    chatOtherText: '#E5E7EB',
    chatSendButtonBg: '#F9FAFB',
    chatSendButtonText: '#020617',
  },
  coonn: {
    // 기본 UI
    // 실제 화면에서는 COONN_GRADIENT를 사용해 배경 그라데이션을 깔고,
    // appBackground는 그 위에 놓이는 카드/컨텐츠 기본 배경 톤으로 사용.
    appBackground: '#FDF7FF',
    headerBackground: '#FDF7FF',
    headerText: '#111827',
    headerIcon: '#111827',
    headerBorder: '#E5E0FF',
    cardBackground: '#FFFFFF',
    cardBorder: '#E5E0FF',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    alertText: '#F97373',
    divider: '#E5E0FF',

    // 탭바
    tabBarBackground: '#FFFFFF',
    tabBarIconActive: '#111827',
    tabBarIconInactive: '#9CA3AF',

    // 버튼
    primaryButtonBg: '#111827',
    primaryButtonText: '#FFFFFF',
    primaryButtonBorder: '#111827',
    secondaryButtonBg: '#FFFFFF',
    secondaryButtonText: '#6B7280',
    secondaryButtonBorder: '#E5E7EB',

    // 채팅
    chatBackground: '#FDF7FF',
    chatHeaderBackground: '#FDF7FF',
    chatHeaderText: '#111827',
    chatInputBackground: '#FFFFFF',
    chatInputText: '#111827',
    chatMyBubble: '#111827',
    chatMyText: '#FFFFFF',
    chatOtherBubble: '#FFFFFF',
    chatOtherText: '#111827',
    chatSendButtonBg: '#111827',
    chatSendButtonText: '#FFFFFF',
  },
  custom: {
    // 기본 UI (초기는 light와 동일)
    appBackground: '#F9FAFB',
    headerBackground: '#FFFFFF',
    headerText: '#111827',
    headerIcon: '#111827',
    headerBorder: '#E5E7EB',
    cardBackground: '#FFFFFF',
    cardBorder: '#E5E7EB',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    alertText: '#EF4444',
    divider: '#E5E7EB',

    // 탭바
    tabBarBackground: '#FFFFFF',
    tabBarIconActive: '#111827',
    tabBarIconInactive: '#9CA3AF',

    // 버튼
    primaryButtonBg: '#111827',
    primaryButtonText: '#FFFFFF',
    primaryButtonBorder: '#111827',
    secondaryButtonBg: '#FFFFFF',
    secondaryButtonText: '#111827',
    secondaryButtonBorder: '#E5E7EB',

    // 채팅
    chatBackground: '#F3F4F6',
    chatHeaderBackground: '#FFFFFF',
    chatHeaderText: '#111827',
    chatInputBackground: '#FFFFFF',
    chatInputText: '#111827',
    chatMyBubble: '#111827',
    chatMyText: '#FFFFFF',
    chatOtherBubble: '#FFFFFF',
    chatOtherText: '#111827',
    chatSendButtonBg: '#111827',
    chatSendButtonText: '#FFFFFF',
  },
};

type ColorKey = keyof ThemeState;

const FONT_FAMILIES: Record<FontFamilyOption, string | undefined> = {
  system: undefined,
  inter: 'Inter_500Medium',
  notoSansKr: 'NotoSansKR_500Medium',
  quicksand: 'Quicksand_500Medium',
  nunito: 'Nunito_600SemiBold',
  robotoMono: 'RobotoMono_500Medium',
  jetbrainsMono: 'JetBrainsMono_500Medium',
  dancingScript: 'DancingScript_500Medium',
  sacramento: 'Sacramento_400Regular',
  playfairDisplay: 'PlayfairDisplay_600SemiBold',
  notoSerif: 'NotoSerif_600SemiBold',
};

const FONT_OPTIONS: {
  key: FontFamilyOption;
  label: string;
  previewFamily?: string;
}[] = [
  { key: 'system', label: '시스템 기본' },
  { key: 'inter', label: 'Inter', previewFamily: 'Inter_500Medium' },
  { key: 'notoSansKr', label: 'Noto Sans KR', previewFamily: 'NotoSansKR_500Medium' },

  { key: 'quicksand', label: 'Quicksand', previewFamily: 'Quicksand_500Medium' },
  { key: 'nunito', label: 'Nunito', previewFamily: 'Nunito_600SemiBold' },

  { key: 'robotoMono', label: 'Roboto Mono', previewFamily: 'RobotoMono_500Medium' },
  { key: 'jetbrainsMono', label: 'JetBrains Mono', previewFamily: 'JetBrainsMono_500Medium' },

  { key: 'dancingScript', label: 'Dancing Script', previewFamily: 'DancingScript_500Medium' },
  { key: 'sacramento', label: 'Sacramento', previewFamily: 'Sacramento_400Regular' },

  { key: 'playfairDisplay', label: 'Playfair Display', previewFamily: 'PlayfairDisplay_600SemiBold' },
  { key: 'notoSerif', label: 'Noto Serif', previewFamily: 'NotoSerif_600SemiBold' },
];

export default function ThemeSettings() {
  const navigation = useNavigation<any>();

  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    NotoSansKR_500Medium,
    Quicksand_500Medium,
    Nunito_600SemiBold,
    RobotoMono_500Medium,
    JetBrainsMono_500Medium,
    DancingScript_500Medium,
    Sacramento_400Regular,
    PlayfairDisplay_600SemiBold,
    NotoSerif_600SemiBold,
  });

  const [preset, setPreset] = useState<ThemePreset>('light');
  const [theme, setTheme] = useState<ThemeState>(PRESET_THEMES.light);

  const [fontSizeOption, setFontSizeOption] =
    useState<FontSizeOption>('medium');
  const [fontFamilyOption, setFontFamilyOption] =
    useState<FontFamilyOption>('system');

  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState<ColorKey | null>(null);
  const [pickerColor, setPickerColor] = useState('#FFFFFF');

  const fontScale = useMemo(() => {
    switch (fontSizeOption) {
      case 'small':
        return 0.9;
      case 'large':
        return 1.15;
      default:
        return 1;
    }
  }, [fontSizeOption]);
  const baseFont = 15;

  const currentFontFamily = useMemo(
    () => FONT_FAMILIES[fontFamilyOption],
    [fontFamilyOption],
  );

  const openPicker = (key: ColorKey) => {
    setPickerKey(key);
    setPickerColor(theme[key]);
    setPickerOpen(true);
  };

  const handlePickerChange = (hex: string) => {
    if (!pickerKey) return;

    setTheme((prev) => {
      const next: ThemeState = {
        ...prev,
        [pickerKey]: hex,
      };
      return next;
    });

    setPickerColor(hex);
    setPreset('custom');
  };

  const resetTheme = () => {
    setPreset('light');
    setTheme(PRESET_THEMES.light);
    setFontSizeOption('medium');
    setFontFamilyOption('system');
  };

  const applyTheme = () => {
    // TODO: 전역 ThemeProvider 연결
    Alert.alert(
      '테마 적용',
      '지금은 미리보기만 동작합니다.\nThemeProvider와 연결되면 앱 전체에 바로 적용됩니다.',
    );
  };

  const usePreset = (key: ThemePreset) => {
    setPreset(key);
    setTheme(PRESET_THEMES[key]);
  };

  if (!fontsLoaded) {
    return null;
  }

  const currentFontLabel =
    FONT_OPTIONS.find((f) => f.key === fontFamilyOption)?.label ?? '시스템 기본';

  const navTabs = [
    { key: 'home', label: '홈' },
    { key: 'map', label: '지도' },
    { key: 'beacon', label: '비콘' },
    { key: 'chat', label: '채팅' },
    { key: 'settings', label: '설정' },
  ];

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.appBackground },
      ]}
    >
      {/* 헤더 */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.headerBackground,
            borderBottomColor: theme.headerBorder,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={{ paddingRight: 8 }}
          >
            <ChevronLeft size={22} color={theme.headerIcon} />
          </Pressable>
          <Text
            style={[
              styles.headerTitle,
              { color: theme.headerText, fontFamily: currentFontFamily },
            ]}
          >
            테마 설정
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 프리셋 선택 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            테마 프리셋
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            기본 테마를 고르거나, 색을 수정하면 자동으로 CUSTOM 모드가 됩니다.
          </Text>
          <View style={styles.pillRow}>
            {renderPresetPill(
              'light',
              'LIGHT',
              preset,
              usePreset,
              currentFontFamily,
              theme,
            )}
            {renderPresetPill(
              'dark',
              'DARK',
              preset,
              usePreset,
              currentFontFamily,
              theme,
            )}
          </View>
          <View style={[styles.pillRow, { marginTop: 8 }]}>
            {renderPresetPill(
              'coonn',
              'CO·ONN',
              preset,
              usePreset,
              currentFontFamily,
              theme,
            )}
            {renderPresetPill(
              'custom',
              'CUSTOM',
              preset,
              () => usePreset('custom'),
              currentFontFamily,
              theme,
            )}
          </View>
        </View>

        {/* 기본 화면 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            기본 화면
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            앱 배경, 카드와 기본 텍스트 색상을 조정합니다.
          </Text>
          <Text
            style={[
              styles.warningText,
              { color: theme.alertText, fontFamily: currentFontFamily },
            ]}
          >
            너무 낮은 대비의 색 조합은 글자가 잘 보이지 않을 수 있어요.
          </Text>

          {/* 첫 줄: 배경 계열 */}
          <View style={styles.colorRow}>
            <ColorSwatch
              label="앱 배경"
              hex={theme.appBackground}
              onPress={() => openPicker('appBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="카드 배경"
              hex={theme.cardBackground}
              onPress={() => openPicker('cardBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="카드 테두리"
              hex={theme.cardBorder}
              onPress={() => openPicker('cardBorder')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 둘째 줄: 텍스트 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="기본 텍스트"
              hex={theme.textPrimary}
              onPress={() => openPicker('textPrimary')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="보조 텍스트"
              hex={theme.textSecondary}
              onPress={() => openPicker('textSecondary')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="알림 텍스트"
              hex={theme.alertText}
              onPress={() => openPicker('alertText')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 셋째 줄: 구분선 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="구분선"
              hex={theme.divider}
              onPress={() => openPicker('divider')}
              fontFamily={currentFontFamily}
            />
          </View>
        </View>

        {/* 헤더 & 하단 탭바 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            헤더 & 하단 탭바
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            상단 헤더와 하단 탭바의 색상을 설정합니다.
          </Text>

          {/* 1줄: 헤더 배경 단독 (풀폭) */}
          <View style={styles.colorRow}>
            <ColorSwatch
              label="헤더 배경"
              hex={theme.headerBackground}
              onPress={() => openPicker('headerBackground')}
              fontFamily={currentFontFamily}
              fullWidth
            />
          </View>

          {/* 2줄: 헤더 글자 / 헤더 아이콘 / 헤더 테두리 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="헤더 글자"
              hex={theme.headerText}
              onPress={() => openPicker('headerText')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="헤더 아이콘"
              hex={theme.headerIcon}
              onPress={() => openPicker('headerIcon')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="헤더 테두리"
              hex={theme.headerBorder}
              onPress={() => openPicker('headerBorder')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 3줄: 탭바 배경 / 아이콘 선택 / 아이콘 기본 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="탭바 배경"
              hex={theme.tabBarBackground}
              onPress={() => openPicker('tabBarBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="탭 아이콘 (선택)"
              hex={theme.tabBarIconActive}
              onPress={() => openPicker('tabBarIconActive')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="탭 아이콘 (기본)"
              hex={theme.tabBarIconInactive}
              onPress={() => openPicker('tabBarIconInactive')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 헤더/탭바 미리보기 카드 */}
          <View
            style={[
              styles.navPreviewCard,
              {
                backgroundColor: theme.appBackground,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            {/* 미니 헤더 */}
            <View
              style={[
                styles.navHeaderPreview,
                {
                  backgroundColor: theme.headerBackground,
                  borderBottomColor: theme.divider,
                },
              ]}
            >
              <View style={styles.navHeaderIconLeft} />
              <Text
                style={{
                  color: theme.headerText,
                  fontWeight: '700',
                  fontSize: 11 * fontScale,
                  fontFamily: currentFontFamily,
                }}
              >
                헤더 & 하단 탭바 미리보기
              </Text>
              <View style={styles.navHeaderIconRight} />
            </View>

            {/* 가운데 빈 영역 */}
            <View style={styles.navPreviewBody} />

            {/* 탭바 */}
            <View
              style={[
                styles.navTabBarPreview,
                {
                  backgroundColor: theme.tabBarBackground,
                  borderTopColor: theme.divider,
                },
              ]}
            >
              {navTabs.map((tab, index) => {
                const active = index === 0;
                const iconColor = active
                  ? theme.tabBarIconActive
                  : theme.tabBarIconInactive;
                const textColor = iconColor;

                return (
                  <View key={tab.key} style={styles.navTabItem}>
                    <View
                      style={[
                        styles.navTabIconDot,
                        { backgroundColor: iconColor },
                      ]}
                    />
                    <Text
                      style={{
                        fontSize: 9,
                        color: textColor,
                        fontFamily: currentFontFamily,
                      }}
                    >
                      {tab.label}
                    </Text>
                    {tab.key === 'beacon' && (
                      <View
                        style={[
                          styles.navBadge,
                          { backgroundColor: theme.alertText },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 7,
                            color: '#FFFFFF',
                            fontWeight: '700',
                            fontFamily: currentFontFamily,
                          }}
                        >
                          NEW
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* 버튼 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            버튼
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            주요 / 서브 버튼의 배경, 텍스트, 테두리 색상입니다.
          </Text>

          <View style={styles.colorRow}>
            <ColorSwatch
              label="주요 버튼"
              hex={theme.primaryButtonBg}
              onPress={() => openPicker('primaryButtonBg')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="주요 텍스트"
              hex={theme.primaryButtonText}
              onPress={() => openPicker('primaryButtonText')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="주요 테두리"
              hex={theme.primaryButtonBorder}
              onPress={() => openPicker('primaryButtonBorder')}
              fontFamily={currentFontFamily}
            />
          </View>

          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="서브 버튼"
              hex={theme.secondaryButtonBg}
              onPress={() => openPicker('secondaryButtonBg')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="서브 텍스트"
              hex={theme.secondaryButtonText}
              onPress={() => openPicker('secondaryButtonText')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="서브 테두리"
              hex={theme.secondaryButtonBorder}
              onPress={() => openPicker('secondaryButtonBorder')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 버튼 미리보기 (카드로 묶음) */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <View style={styles.previewButtonsRow}>
              <Pressable
                style={[
                  styles.buttonPrimary,
                  {
                    backgroundColor: theme.primaryButtonBg,
                    borderColor: theme.primaryButtonBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.primaryButtonText,
                    fontWeight: '800',
                    fontSize: baseFont * fontScale,
                    fontFamily: currentFontFamily,
                  }}
                >
                  저장
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.buttonGhost,
                  {
                    backgroundColor: theme.secondaryButtonBg,
                    borderColor: theme.secondaryButtonBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.secondaryButtonText,
                    fontWeight: '700',
                    fontSize: (baseFont - 1) * fontScale,
                    fontFamily: currentFontFamily,
                  }}
                >
                  취소
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 채팅 색 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            채팅
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            채팅방 배경, 헤더, 입력창과 말풍선 색을 개별로 설정합니다.
          </Text>

          {/* 배경 / 헤더 */}
          <View style={styles.colorRow}>
            <ColorSwatch
              label="채팅 배경"
              hex={theme.chatBackground}
              onPress={() => openPicker('chatBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="채팅 헤더"
              hex={theme.chatHeaderBackground}
              onPress={() => openPicker('chatHeaderBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="헤더 글자"
              hex={theme.chatHeaderText}
              onPress={() => openPicker('chatHeaderText')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 입력창 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="입력창 배경"
              hex={theme.chatInputBackground}
              onPress={() => openPicker('chatInputBackground')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="입력 글자"
              hex={theme.chatInputText}
              onPress={() => openPicker('chatInputText')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 말풍선 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="내 말풍선"
              hex={theme.chatMyBubble}
              onPress={() => openPicker('chatMyBubble')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="내 글자"
              hex={theme.chatMyText}
              onPress={() => openPicker('chatMyText')}
              fontFamily={currentFontFamily}
            />
          </View>

          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="상대 말풍선"
              hex={theme.chatOtherBubble}
              onPress={() => openPicker('chatOtherBubble')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="상대 글자"
              hex={theme.chatOtherText}
              onPress={() => openPicker('chatOtherText')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 보내기 버튼 */}
          <View style={[styles.colorRow, { marginTop: 8 }]}>
            <ColorSwatch
              label="보내기 버튼"
              hex={theme.chatSendButtonBg}
              onPress={() => openPicker('chatSendButtonBg')}
              fontFamily={currentFontFamily}
            />
            <ColorSwatch
              label="보내기 글자"
              hex={theme.chatSendButtonText}
              onPress={() => openPicker('chatSendButtonText')}
              fontFamily={currentFontFamily}
            />
          </View>

          {/* 채팅 미리보기 */}
          <View
            style={[
              styles.chatPreview,
              {
                backgroundColor: theme.chatBackground,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            {/* 채팅 헤더 */}
            <View
              style={[
                styles.chatHeaderPreview,
                {
                  backgroundColor: theme.chatHeaderBackground,
                  borderBottomColor: theme.divider,
                },
              ]}
            >
              <Text
                style={{
                  color: theme.chatHeaderText,
                  fontWeight: '700',
                  fontSize: 13 * fontScale,
                  fontFamily: currentFontFamily,
                }}
              >
                친구와의 채팅
              </Text>
            </View>

            {/* 메시지 영역 */}
            <View style={{ padding: 8 }}>
              <View style={styles.chatRowOther}>
                <View
                  style={[
                    styles.chatBubble,
                    {
                      backgroundColor: theme.chatOtherBubble,
                      alignSelf: 'flex-start',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.chatOtherText,
                      fontSize: baseFont * fontScale,
                      fontFamily: currentFontFamily,
                    }}
                  >
                    안녕! 👋
                  </Text>
                </View>
              </View>
              <View style={styles.chatRowMe}>
                <View
                  style={[
                    styles.chatBubble,
                    {
                      backgroundColor: theme.chatMyBubble,
                      alignSelf: 'flex-end',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.chatMyText,
                      fontSize: baseFont * fontScale,
                      fontFamily: currentFontFamily,
                    }}
                  >
                    CO·ONN으로 연락해!
                  </Text>
                </View>
              </View>
            </View>

            {/* 입력창 */}
            <View
              style={[
                styles.chatInputPreview,
                {
                  backgroundColor: theme.chatInputBackground,
                  borderTopColor: theme.divider,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: theme.chatInputText,
                  fontSize: 12 * fontScale,
                  fontFamily: currentFontFamily,
                }}
              >
                메시지를 입력하세요...
              </Text>
              <View
                style={[
                  styles.chatSendButton,
                  { backgroundColor: theme.chatSendButtonBg },
                ]}
              >
                <Text
                  style={{
                    color: theme.chatSendButtonText,
                    fontSize: 11,
                    fontWeight: '700',
                    fontFamily: currentFontFamily,
                  }}
                >
                  보내기
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 글자 크기 */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            글자 크기
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            앱 전체 기본 폰트 크기를 조정합니다.
          </Text>
          <View style={styles.pillRow}>
            {renderFontPill(
              'small',
              '작게',
              fontSizeOption,
              setFontSizeOption,
              currentFontFamily,
              theme,
            )}
            {renderFontPill(
              'medium',
              '기본',
              fontSizeOption,
              setFontSizeOption,
              currentFontFamily,
              theme,
            )}
            {renderFontPill(
              'large',
              '크게',
              fontSizeOption,
              setFontSizeOption,
              currentFontFamily,
              theme,
            )}
          </View>
        </View>

        {/* 글자 폰트 (드롭다운) */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textPrimary, fontFamily: currentFontFamily },
            ]}
          >
            글자 폰트
          </Text>
          <Text
            style={[
              styles.sectionDesc,
              { color: theme.textSecondary, fontFamily: currentFontFamily },
            ]}
          >
            Expo Google Fonts 기반 추천 폰트들을 선택할 수 있습니다.
          </Text>

          <Pressable
            style={styles.fontDropdown}
            onPress={() => setFontDropdownOpen((v) => !v)}
          >
            <Text
              style={[
                styles.fontDropdownLabel,
                { fontFamily: currentFontFamily, color: theme.textPrimary },
              ]}
            >
              {currentFontLabel}
            </Text>
            {fontDropdownOpen ? (
              <ChevronUp size={16} color="#6B7280" />
            ) : (
              <ChevronDown size={16} color="#6B7280" />
            )}
          </Pressable>

          {fontDropdownOpen && (
            <View style={styles.fontDropdownList}>
              {FONT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.fontDropdownItem,
                    opt.key === fontFamilyOption && styles.fontDropdownItemActive,
                  ]}
                  onPress={() => {
                    setFontFamilyOption(opt.key);
                    setFontDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.fontDropdownItemText,
                      opt.previewFamily && { fontFamily: opt.previewFamily },
                      opt.key === fontFamilyOption && styles.fontDropdownItemTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* 폰트 미리보기 */}
          <View
            style={[
              styles.previewCard,
              {
                marginTop: 10,
                backgroundColor: theme.cardBackground,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 14 * fontScale,
                fontFamily: currentFontFamily,
                color: theme.textPrimary,
              }}
            >
              CO·ONN – 가까운 사람과 가장 가깝게.
            </Text>
          </View>
        </View>

        {/* 하단 버튼 */}
        <View style={styles.footerButtons}>
          <Pressable style={styles.footerGhost} onPress={resetTheme}>
            <Text
              style={[
                styles.footerGhostText,
                { fontFamily: currentFontFamily },
              ]}
            >
              기본으로
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.footerPrimary,
              {
                backgroundColor: theme.primaryButtonBg,
                borderColor: theme.primaryButtonBorder,
              },
            ]}
            onPress={applyTheme}
          >
            <Text
              style={[
                styles.footerPrimaryText,
                { color: theme.primaryButtonText, fontFamily: currentFontFamily },
              ]}
            >
              적용하기
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 컬러 피커 모달 */}
      <ColorPickerModal
        visible={pickerOpen}
        initialColor={pickerColor}
        onClose={() => setPickerOpen(false)}
        onChangeComplete={handlePickerChange}
        fontFamily={currentFontFamily}
      />
    </SafeAreaView>
  );
}

/* ---------- 컬러 스와치 ---------- */

type ColorSwatchProps = {
  label: string;
  hex: string;
  onPress: () => void;
  fontFamily?: string;
  fullWidth?: boolean;
};

function ColorSwatch({
  label,
  hex,
  onPress,
  fontFamily,
  fullWidth,
}: ColorSwatchProps) {
  const safeHex = (hex || '#FFFFFF').toUpperCase();

  return (
    <Pressable
      style={[
        styles.colorSwatch,
        fullWidth && styles.colorSwatchFull,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.colorBox,
          { backgroundColor: hex || '#FFFFFF' },
        ]}
      />
      <Text
        style={[
          styles.colorLabel,
          fontFamily && { fontFamily },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.colorHex,
          fontFamily && { fontFamily },
        ]}
      >
        {safeHex}
      </Text>
    </Pressable>
  );
}

/* ---------- 프리셋 / 폰트 pill ---------- */

function renderPresetPill(
  key: ThemePreset,
  label: string,
  current: ThemePreset,
  setPreset: (k: ThemePreset) => void,
  fontFamily: string | undefined,
  theme: ThemeState,
) {
  const active = current === key;
  return (
    <Pressable
      onPress={() => setPreset(key)}
      style={[
        styles.pill,
        {
          backgroundColor: active
            ? theme.primaryButtonBg
            : theme.secondaryButtonBg,
          borderColor: active
            ? theme.primaryButtonBorder
            : theme.secondaryButtonBorder,
        },
      ]}
      hitSlop={6}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active
              ? theme.primaryButtonText
              : theme.secondaryButtonText,
          },
          fontFamily && { fontFamily },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function renderFontPill(
  key: FontSizeOption,
  label: string,
  current: FontSizeOption,
  setCurrent: (k: FontSizeOption) => void,
  fontFamily: string | undefined,
  theme: ThemeState,
) {
  const active = current === key;
  return (
    <Pressable
      onPress={() => setCurrent(key)}
      style={[
        styles.pill,
        {
          backgroundColor: active
            ? theme.primaryButtonBg
            : theme.secondaryButtonBg,
          borderColor: active
            ? theme.primaryButtonBorder
            : theme.secondaryButtonBorder,
        },
      ]}
      hitSlop={6}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active
              ? theme.primaryButtonText
              : theme.secondaryButtonText,
          },
          fontFamily && { fontFamily },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- HSV 유틸 ---------- */

type HSV = { h: number; s: number; v: number };

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToHsv(hex: string): HSV {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  if (c.length !== 6) {
    return { h: 0, s: 0, v: 1 };
  }
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0,
    g1 = 0,
    b1 = 0;

  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
  } else if (h >= 60 && h < 120) {
    r1 = x;
    g1 = c;
  } else if (h >= 120 && h < 180) {
    g1 = c;
    b1 = x;
  } else if (h >= 180 && h < 240) {
    g1 = x;
    b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x;
    b1 = c;
  } else if (h >= 300 && h < 360) {
    r1 = c;
    b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  const toHex = (n: number) => n.toString(16).padStart(2, '0');

  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/* ---------- 컬러 피커 모달 ---------- */

type ColorPickerModalProps = {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onChangeComplete: (hex: string) => void;
  fontFamily?: string;
};

function ColorPickerModal({
  visible,
  initialColor,
  onClose,
  onChangeComplete,
  fontFamily,
}: ColorPickerModalProps) {
  const [hsv, setHsv] = useState<HSV>(() =>
    hexToHsv(initialColor || '#ffffff'),
  );
  const [hex, setHex] = useState((initialColor || '#ffffff').toUpperCase());

  const [squareSize, setSquareSize] = useState({ width: 220, height: 140 });
  const [barHeight, setBarHeight] = useState(140);

  React.useEffect(() => {
    if (visible) {
      const nextHsv = hexToHsv(initialColor || '#ffffff');
      setHsv(nextHsv);
      setHex((initialColor || '#ffffff').toUpperCase());
    }
  }, [visible, initialColor]);

  const currentHex = useMemo(() => hsvToHex(hsv).toUpperCase(), [hsv]);

  React.useEffect(() => {
    setHex(currentHex);
  }, [currentHex]);

  // 사각형 터치/드래그: 영역 밖으로 나가면 색 업데이트 중단
  const updateSquareFromEvent = (
    e: GestureResponderEvent,
    _g: PanResponderGestureState,
  ) => {
    const { locationX, locationY } = e.nativeEvent;
    const w = squareSize.width || 1;
    const h = squareSize.height || 1;

    if (locationX < 0 || locationX > w || locationY < 0 || locationY > h) {
      // 바깥으로 나가면 마지막 색 유지
      return;
    }

    const s = clamp01(locationX / w);
    const v = clamp01(1 - locationY / h);

    setHsv((prev) => ({
      ...prev,
      s,
      v,
    }));
  };

  const squareResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: updateSquareFromEvent,
      onPanResponderMove: updateSquareFromEvent,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  // 세로 바: 영역 밖으로 나가면 업데이트 중단
  const updateBarFromEvent = (
    e: GestureResponderEvent,
    _g: PanResponderGestureState,
  ) => {
    const { locationY } = e.nativeEvent;
    const h = barHeight || 1;

    if (locationY < 0 || locationY > h) {
      return;
    }

    const ratio = clamp01(locationY / h);
    const newH = ratio * 360;

    setHsv((prev) => ({
      ...prev,
      h: newH,
    }));
  };

  const barResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: updateBarFromEvent,
      onPanResponderMove: updateBarFromEvent,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  const handleBrightness = (v: number) => {
    setHsv((prev) => ({
      ...prev,
      v,
    }));
  };

  const handleHexChange = (value: string) => {
    let clean = value.trim();
    if (!clean.startsWith('#')) {
      clean = '#' + clean;
    }
    setHex(clean.toUpperCase());
    if (/^#([0-9a-fA-F]{6})$/.test(clean)) {
      const h = hexToHsv(clean);
      setHsv(h);
    }
  };

  const handleDone = () => {
    const out = /^#([0-9a-fA-F]{6})$/.test(hex) ? hex.toUpperCase() : currentHex;
    onChangeComplete(out);
    onClose();
  };

  const pureHueHex = hsvToHex({
    h: hsv.h,
    s: 1,
    v: 1,
  });

  // 선택 포인트 좌표 (S/V)
  const squareHandleX = clamp(hsv.s * squareSize.width, 0, squareSize.width);
  const squareHandleY = clamp((1 - hsv.v) * squareSize.height, 0, squareSize.height);

  // H 포인트 좌표
  const barHandleY = clamp((hsv.h / 360) * barHeight, 0, barHeight);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.pickerCard}>
          {/* 상단: 미리보기 + HEX 입력 + 밝기 */}
          <View style={styles.pickerTopRow}>
            <View
              style={[
                styles.pickerPreview,
                { backgroundColor: currentHex },
              ]}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <TextInput
                value={hex.replace('#', '')}
                onChangeText={(v) => handleHexChange('#' + v)}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
                style={[
                  styles.pickerHexInput,
                  fontFamily && { fontFamily },
                ]}
              />
            </View>
          </View>

          <View style={styles.brightnessRow}>
            <Text
              style={[
                styles.sunIcon,
                fontFamily && { fontFamily },
              ]}
            >
              ☀️
            </Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={0}
              maximumValue={1}
              value={hsv.v}
              onValueChange={handleBrightness}
              minimumTrackTintColor={pureHueHex}
              maximumTrackTintColor="#D1D5DB"
            />
          </View>

          {/* 컬러 영역: 사각형 + 무지개 바 */}
          <View style={styles.pickerAreaRow}>
            <View
              style={styles.pickerSquareWrap}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setSquareSize({ width, height });
              }}
              {...squareResponder.panHandlers}
            >
              {/* 좌우: 흰색 → 순색 */}
              <LinearGradient
                colors={['#ffffff', pureHueHex]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              {/* 위아래: 투명 → 검정 */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* 선택 포인트 표시 */}
              <View
                pointerEvents="none"
                style={[
                  styles.pickerSquareHandle,
                  {
                    left: squareHandleX - 9,
                    top: squareHandleY - 9,
                  },
                ]}
              />
            </View>

            <View
              style={styles.pickerBarWrap}
              onLayout={(e) => {
                const { height } = e.nativeEvent.layout;
                setBarHeight(height);
              }}
              {...barResponder.panHandlers}
            >
              <LinearGradient
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                colors={[
                  '#FF0000',
                  '#FFFF00',
                  '#00FF00',
                  '#00FFFF',
                  '#0000FF',
                  '#FF00FF',
                  '#FF0000',
                ]}
              />
              {/* H 포인트 표시 */}
              <View
                pointerEvents="none"
                style={[
                  styles.pickerBarHandle,
                  {
                    top: barHandleY - 8,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.pickerButtonsRow}>
            <Pressable style={styles.footerGhost} onPress={onClose}>
              <Text
                style={[
                  styles.footerGhostText,
                  fontFamily && { fontFamily },
                ]}
              >
                닫기
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.footerPrimary,
                { backgroundColor: '#111827', borderColor: '#111827' },
              ]}
              onPress={handleDone}
            >
              <Text
                style={[
                  styles.footerPrimaryText,
                  fontFamily && { fontFamily },
                ]}
              >
                적용
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- 스타일 ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    height: 54,
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    width: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 10,
  },

  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 11,
    marginBottom: 10,
  },

  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  pillText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    flexBasis: '31%',
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  colorSwatchFull: {
    flexBasis: '100%',
  },
  colorBox: {
    width: '100%',
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    marginBottom: 4,
  },
  colorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  colorHex: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  previewCard: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  previewButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonPrimary: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonGhost: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  /* 헤더/탭바 미리보기 카드 */
  navPreviewCard: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  navHeaderPreview: {
    height: 30,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navHeaderIconLeft: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  navHeaderIconRight: {
    width: 32,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  navPreviewBody: {
    height: 40,
  },
  navTabBarPreview: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  navTabIconDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginBottom: 2,
  },
  navBadge: {
    position: 'absolute',
    top: 2,
    right: 18,
    minWidth: 16,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chatPreview: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  chatHeaderPreview: {
    height: 32,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chatRowOther: {
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  chatRowMe: {
    marginTop: 4,
    alignItems: 'flex-end',
  },
  chatBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chatInputPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatSendButton: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footerButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  footerGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  footerPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  footerPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 폰트 드롭다운
  fontDropdown: {
    marginTop: 6,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  fontDropdownLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fontDropdownList: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  fontDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fontDropdownItemActive: {
    backgroundColor: '#F3F4F6',
  },
  fontDropdownItemText: {
    fontSize: 13,
    color: '#111827',
  },
  fontDropdownItemTextActive: {
    fontWeight: '700',
  },

  // 모달
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    width: 320,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pickerPreview: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerHexInput: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  brightnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
    gap: 8,
  },
  sunIcon: {
    fontSize: 16,
  },

  pickerAreaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerSquareWrap: {
    width: 220,
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerBarWrap: {
    width: 26,
    height: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginLeft: 8,
  },
  pickerSquareHandle: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  pickerBarHandle: {
    position: 'absolute',
    left: -2,
    right: -2,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  pickerButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
});
