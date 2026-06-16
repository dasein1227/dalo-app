import React from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Animated,
  PanResponder,
} from 'react-native';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TranslationTier, TranslationTone } from '../hooks/useChatUIState';
import type { ChatRoomType, ChatTheme } from '../theme/chatTheme';
import { createTranslationSettingsPanelTheme, type TranslationSettingsPanelTheme } from './TranslationSettingsPanel.theme';

const AUTO_SEND_LANG = 'AUTO';

const TranslationSettingsPanelThemeContext = React.createContext<TranslationSettingsPanelTheme | null>(null);

function usePanelTheme() {
  const ui = React.useContext(TranslationSettingsPanelThemeContext);
  return ui ?? createTranslationSettingsPanelTheme();
}

type Props = {
  visible: boolean;
  onClose: () => void;
  roomType: ChatRoomType;
  theme?: ChatTheme;
  autoTranslate: boolean;
  onToggleAutoTranslate: () => void;
  showTranslatedOnly: boolean;
  onToggleShowTranslatedOnly: () => void;
  userTier: TranslationTier;
  translationTier: TranslationTier;
  setTranslationTier: (tier: TranslationTier) => void;
  translationTone: TranslationTone;
  setTranslationTone: (tone: TranslationTone) => void;
  viewLang: string | null;
  settingLang: string | null;
  onChangeViewLang: (lang: string) => void;
  preferredLang: string | null;
  onChangePreferredLang: (lang: string) => void;
  peerViewLang: string | null;
  peerSettingLang: string | null;
  onPressUpgrade: () => void;
  onRefreshUserTier?: () => void | Promise<void>;
  refreshingUserTier?: boolean;
};

type OptionRowProps = {
  title: string;
  desc?: string | null;
  selected?: boolean;
  disabled?: boolean;
  rightText?: string | null;
  rightSubText?: string | null;
  onPress?: () => void;
};

type TranslationOptionMeta<T extends string> = {
  value: T;
  labelKey: string;
  descKey: string;
};

const TONE_OPTIONS: TranslationOptionMeta<TranslationTone>[] = [
  { value: 'business', labelKey: 'tone.options.business.label', descKey: 'tone.options.business.desc' },
  { value: 'polite', labelKey: 'tone.options.polite.label', descKey: 'tone.options.polite.desc' },
  { value: 'casual', labelKey: 'tone.options.casual.label', descKey: 'tone.options.casual.desc' },
  { value: 'neutral', labelKey: 'tone.options.neutral.label', descKey: 'tone.options.neutral.desc' },
  { value: 'creative', labelKey: 'tone.options.creative.label', descKey: 'tone.options.creative.desc' },
];

const TIER_OPTIONS: TranslationOptionMeta<TranslationTier>[] = [
  { value: 'free', labelKey: 'tier.options.free.label', descKey: 'tier.options.free.desc' },
  { value: 'mid', labelKey: 'tier.options.mid.label', descKey: 'tier.options.mid.desc' },
  { value: 'high', labelKey: 'tier.options.high.label', descKey: 'tier.options.high.desc' },
];

type AppTranslateFn = (key: string, options?: Record<string, unknown>) => string;

function panelText(t: AppTranslateFn | undefined, key: string, options?: Record<string, unknown>) {
  const translate = t ?? i18next.t.bind(i18next);
  return translate(`chat:translationPanel.${key}`, options);
}

export const TRANSLATION_LANGUAGE_OPTIONS = [
  { code: 'EN', fallback: 'English' },
  { code: 'KO', fallback: '한국어' },
  { code: 'JA', fallback: '日本語' },
  { code: 'ZH-HANS', fallback: '简体中文' },
  { code: 'ZH-HANT', fallback: '繁體中文' },
  { code: 'ES', fallback: 'Español' },
  { code: 'FR', fallback: 'Français' },
  { code: 'DE', fallback: 'Deutsch' },
  { code: 'IT', fallback: 'Italiano' },
  { code: 'PT', fallback: 'Português' },
  { code: 'VI', fallback: 'Tiếng Việt' },
  { code: 'HI', fallback: 'हिन्दी' },
  { code: 'ID', fallback: 'Bahasa Indonesia' },
  { code: 'TH', fallback: 'ไทย' },
  { code: 'TR', fallback: 'Türkçe' },
  { code: 'RU', fallback: 'Русский' },
  { code: 'AR', fallback: 'العربية' },
  { code: 'HE', fallback: 'עברית' },
  { code: 'NL', fallback: 'Nederlands' },
  { code: 'PL', fallback: 'Polski' },
  { code: 'SV', fallback: 'Svenska' },
  { code: 'UK', fallback: 'Українська' },
  { code: 'RO', fallback: 'Română' },
  { code: 'CS', fallback: 'Čeština' },
  { code: 'DA', fallback: 'Dansk' },
  { code: 'EL', fallback: 'Ελληνικά' },
  { code: 'FI', fallback: 'Suomi' },
  { code: 'HU', fallback: 'Magyar' },
  { code: 'SK', fallback: 'Slovenčina' },
  { code: 'SL', fallback: 'Slovenščina' },
  { code: 'BG', fallback: 'Български' },
  { code: 'ET', fallback: 'Eesti' },
  { code: 'LT', fallback: 'Lietuvių' },
  { code: 'LV', fallback: 'Latviešu' },
] as const;

export type TranslationLanguageCode = typeof TRANSLATION_LANGUAGE_OPTIONS[number]['code'];

const TRANSLATION_LANGUAGE_CODE_SET = new Set<string>(
  TRANSLATION_LANGUAGE_OPTIONS.map((item) => item.code),
);

function translationLanguageI18nKey(code: string) {
  return code.trim().toUpperCase().replace(/-/g, '_');
}

const TIER_WEIGHT: Record<TranslationTier, number> = { free: 0, mid: 1, high: 2 };

function normalizeLang(v: string | null | undefined) {
  const raw = String(v ?? '').trim().replace(/_/g, '-');
  if (!raw) return null;

  const low = raw.toLowerCase();
  if (low === AUTO_SEND_LANG.toLowerCase() || low === 'auto') return null;

  if (low === 'zh' || low === 'zh-cn' || low === 'zh-sg' || low === 'zh-hans') return 'ZH-HANS';
  if (low === 'zh-tw' || low === 'zh-hk' || low === 'zh-mo' || low === 'zh-hant') return 'ZH-HANT';
  if (low === 'iw') return 'HE';
  if (low === 'in') return 'ID';

  const up = low.toUpperCase();
  return TRANSLATION_LANGUAGE_CODE_SET.has(up) ? up : up;
}

export function isAutoPreferredLang(v: string | null | undefined) {
  return normalizeLang(v) == null;
}

export function labelByTranslationLang(code: string | null | undefined, t?: AppTranslateFn) {
  const normalized = normalizeLang(code) ?? 'KO';
  const hit = TRANSLATION_LANGUAGE_OPTIONS.find((x) => x.code === normalized);
  const fallback = hit?.fallback ?? normalized;
  if (!t) return fallback;

  return panelText(t, `language.${translationLanguageI18nKey(normalized)}`, {
    defaultValue: fallback,
  });
}

function canSelectTier(userTier: TranslationTier, target: TranslationTier) {
  return TIER_WEIGHT[target] <= TIER_WEIGHT[userTier];
}

function shouldShowUpgradeButton(userTier: TranslationTier, optionTier: TranslationTier) {
  if (userTier === 'high') return false;
  return TIER_WEIGHT[optionTier] > TIER_WEIGHT[userTier];
}

export function summarizeTranslationSettings(params: {
  autoTranslate: boolean;
  showTranslatedOnly: boolean;
  viewLang: string | null;
  settingLang: string | null;
  preferredLang: string | null;
}, t?: AppTranslateFn) {
  const { autoTranslate, showTranslatedOnly, viewLang, settingLang, preferredLang } = params;
  if (!autoTranslate) return panelText(t, 'status.off');

  const receive = normalizeLang(viewLang) || normalizeLang(settingLang) || 'KO';
  const send = isAutoPreferredLang(preferredLang)
    ? panelText(t, 'status.auto')
    : labelByTranslationLang(preferredLang, t);

  const onLabel = panelText(t, 'status.on');
  const receiveLabel = panelText(t, 'status.receive');
  const sendLabel = panelText(t, 'status.send');
  const translatedOnlyLabel = panelText(t, 'status.translatedOnly');

  return `${onLabel} · ${receiveLabel} ${labelByTranslationLang(receive, t)} · ${sendLabel} ${send}${showTranslatedOnly ? ` · ${translatedOnlyLabel}` : ''}`;
}

function OptionRow({ title, desc, selected, disabled, rightText, rightSubText, onPress }: OptionRowProps) {
  const ui = usePanelTheme();
  const active = !!selected;
  const titleColor = active ? ui.bubbleText : disabled ? ui.textDisabled : ui.textPrimary;
  const descColor = active ? ui.bubbleSubText : ui.textSecondary;
  const rightColor = active ? ui.bubbleText : ui.textSecondary;
  const subRightColor = active ? ui.bubbleSubText : ui.textSecondary;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: ui.ripple }}
      style={({ pressed }) => [
        styles.optionRow,
        {
          borderBottomColor: ui.border,
          borderBottomWidth: ui.hairline,
          backgroundColor: active ? ui.selectedBackground : 'transparent',
          opacity: disabled ? 0.46 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.optionTextBox}>
        <Text style={[styles.optionTitle, { color: titleColor }]}>{title}</Text>
        {!!desc && <Text style={[styles.optionDesc, { color: descColor }]}>{desc}</Text>}
      </View>

      <View style={styles.optionRight}>
        {!!rightText && <Text style={[styles.optionRightText, { color: rightColor }]}>{rightText}</Text>}
        {!!rightSubText && <Text style={[styles.optionRightSub, { color: subRightColor }]}>{rightSubText}</Text>}
        <View
          style={[
            styles.radioOuter,
            {
              borderColor: active ? ui.bubbleText : ui.radioBorder,
              borderWidth: active ? 1.4 : 1.1,
              backgroundColor: active ? ui.radioSelectedBackground : ui.radioBackground,
            },
          ]}
        >
          {active && <View style={[styles.radioInner, { backgroundColor: ui.bubbleText }]} />}
        </View>
      </View>
    </Pressable>
  );
}

function SectionToggle({
  title,
  desc,
  value,
  onValueChange,
  embedded,
  showDivider,
}: {
  title: string;
  desc?: string;
  value: boolean;
  onValueChange: () => void;
  embedded?: boolean;
  showDivider?: boolean;
}) {
  const ui = usePanelTheme();
  const accent = ui.accent;
  return (
    <View
      style={[
        embedded ? styles.toggleInlineRow : styles.toggleCard,
        {
          backgroundColor: embedded ? 'transparent' : ui.surfaceRaised,
          borderColor: embedded ? 'transparent' : ui.border,
          borderWidth: embedded ? 0 : ui.hairline,
          borderBottomColor: showDivider ? ui.border : 'transparent',
          borderBottomWidth: showDivider ? ui.hairline : 0,
          borderRadius: embedded ? 0 : ui.radius.card,
        },
      ]}
    >
      <View style={styles.toggleTextBox}>
        <Text style={[styles.toggleTitle, { color: ui.textPrimary }]}>{title}</Text>
        {!!desc && <Text style={[styles.toggleDesc, { color: ui.textSecondary }]}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: ui.switchTrackOff, true: accent }}
        thumbColor={ui.switchThumb}
      />
    </View>
  );
}

function ToggleStack({ children }: { children: React.ReactNode }) {
  const ui = usePanelTheme();

  return (
    <View
      style={[
        styles.toggleStack,
        {
          backgroundColor: ui.surfaceRaised,
          borderColor: ui.border,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.card,
        },
      ]}
    >
      {children}
    </View>
  );
}

function ExpandBlock({
  title,
  value,
  desc,
  open,
  onPress,
  children,
}: {
  title: string;
  value: string;
  desc?: string;
  open: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const ui = usePanelTheme();
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <View
      style={[
        styles.expandBlock,
        {
          backgroundColor: ui.surfaceRaised,
          borderColor: open ? ui.strongBorder : ui.border,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.card,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        android_ripple={{ color: ui.ripple }}
        style={({ pressed }) => [styles.expandHeaderPressable, { opacity: pressed ? 0.84 : 1 }]}
      >
        <View style={styles.expandHeaderRow}>
          <View style={styles.expandTitleBox}>
            <Text style={[styles.expandTitle, { color: ui.textPrimary }]}>{title}</Text>
            <Text style={[styles.expandValue, { color: ui.textSecondary }]} numberOfLines={1}>{value}</Text>
          </View>
          <View
            style={[
              styles.chevronBox,
              {
                borderColor: ui.border,
                borderWidth: ui.hairline,
                backgroundColor: ui.chevronBackground,
              },
            ]}
          >
            <Icon size={18} strokeWidth={1.8} color={ui.iconMuted} />
          </View>
        </View>
        {!!desc && <Text style={[styles.expandDesc, { color: ui.textSecondary }]}>{desc}</Text>}
      </Pressable>

      {open && !!children && (
        <View
          style={[
            styles.optionGroup,
            {
              backgroundColor: ui.surfaceRaised,
              borderTopColor: ui.border,
              borderTopWidth: ui.hairline,
            },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

export default function TranslationSettingsPanel({
  visible,
  onClose,
  roomType,
  theme,
  autoTranslate,
  onToggleAutoTranslate,
  showTranslatedOnly,
  onToggleShowTranslatedOnly,
  userTier,
  translationTier,
  setTranslationTier,
  translationTone,
  setTranslationTone,
  viewLang,
  settingLang,
  onChangeViewLang,
  preferredLang,
  onChangePreferredLang,
  peerViewLang,
  peerSettingLang,
  onPressUpgrade,
  onRefreshUserTier,
  refreshingUserTier,
}: Props) {
  const ui = React.useMemo(() => createTranslationSettingsPanelTheme(theme, roomType), [roomType, theme]);
  const insets = useSafeAreaInsets();
  const { t: rawT } = useTranslation();
  const t = rawT as AppTranslateFn;
  const dragY = React.useRef(new Animated.Value(0)).current;
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshStopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshRotation, setRefreshRotation] = React.useState(0);
  const [localRefreshingUserTier, setLocalRefreshingUserTier] = React.useState(false);
  const isRefreshingUserTier = !!refreshingUserTier || localRefreshingUserTier;
  const refreshDisabled = isRefreshingUserTier;

  React.useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [dragY, visible]);

  const clearRefreshTimers = React.useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    if (refreshStopTimerRef.current) {
      clearTimeout(refreshStopTimerRef.current);
      refreshStopTimerRef.current = null;
    }
  }, []);

  const startRefreshSpin = React.useCallback(() => {
    if (refreshStopTimerRef.current) {
      clearTimeout(refreshStopTimerRef.current);
      refreshStopTimerRef.current = null;
    }
    if (refreshIntervalRef.current) return;

    setRefreshRotation(0);
    refreshIntervalRef.current = setInterval(() => {
      setRefreshRotation((prev) => (prev + 22) % 360);
    }, 16);
  }, []);

  const stopRefreshSpin = React.useCallback(() => {
    clearRefreshTimers();
    setRefreshRotation(0);
  }, [clearRefreshTimers]);

  React.useEffect(() => {
    if (isRefreshingUserTier) {
      startRefreshSpin();
      return;
    }

    stopRefreshSpin();
  }, [isRefreshingUserTier, startRefreshSpin, stopRefreshSpin]);

  React.useEffect(() => () => {
    clearRefreshTimers();
  }, [clearRefreshTimers]);

  const refreshIconStyle = React.useMemo(
    () => ({
      transform: [{ rotate: `${refreshRotation}deg` }],
    }),
    [refreshRotation],
  );

  const handleRefreshUserTier = React.useCallback(() => {
    if (isRefreshingUserTier) return;

    setLocalRefreshingUserTier(true);
    const startedAt = Date.now();
    const minBusyMs = 920;
    const refreshTask = onRefreshUserTier ? Promise.resolve(onRefreshUserTier()) : Promise.resolve();

    refreshTask
      .catch(() => undefined)
      .finally(() => {
        const elapsed = Date.now() - startedAt;
        const remain = Math.max(0, minBusyMs - elapsed);

        if (refreshStopTimerRef.current) {
          clearTimeout(refreshStopTimerRef.current);
          refreshStopTimerRef.current = null;
        }

        refreshStopTimerRef.current = setTimeout(() => {
          refreshStopTimerRef.current = null;
          setLocalRefreshingUserTier(false);
        }, remain);
      });
  }, [isRefreshingUserTier, onRefreshUserTier]);

  const closeWithDragReset = React.useCallback(() => {
    dragY.setValue(0);
    onClose();
  }, [dragY, onClose]);

  const resetDragPosition = React.useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 160,
      friction: 18,
    }).start();
  }, [dragY]);

  const handlePanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          dragY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 72 || gestureState.vy > 0.75) {
            closeWithDragReset();
            return;
          }
          resetDragPosition();
        },
        onPanResponderTerminate: resetDragPosition,
      }),
    [closeWithDragReset, dragY, resetDragPosition],
  );

  const cardDragStyle = React.useMemo(
    () => ({ transform: [{ translateY: dragY }] }),
    [dragY],
  );

  const [openSection, setOpenSection] = React.useState<'tier' | 'tone' | 'sendLang' | 'recvLang' | null>(null);

  const tierOpen = openSection === 'tier';
  const toneOpen = openSection === 'tone';
  const sendLangOpen = openSection === 'sendLang';
  const recvLangOpen = openSection === 'recvLang';

  const toggleOpenSection = React.useCallback((section: 'tier' | 'tone' | 'sendLang' | 'recvLang') => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  const toneDisabled = !(userTier === 'high' && translationTier === 'high');
  const autoSendSelected = isAutoPreferredLang(preferredLang);
  const peerDefaultSendLang = normalizeLang(peerViewLang) || normalizeLang(peerSettingLang) || null;
  const effectiveReceiveLang = normalizeLang(viewLang) || normalizeLang(settingLang) || 'KO';
  const manualPreferredLang = normalizeLang(preferredLang);
  const effectiveSendLang = manualPreferredLang || peerDefaultSendLang || 'KO';

  const tierLabel = React.useMemo(() => {
    const option = TIER_OPTIONS.find((x) => x.value === translationTier);
    return option ? panelText(t, option.labelKey) : String(translationTier).toUpperCase();
  }, [t, translationTier]);

  const toneLabel = React.useMemo(() => {
    const option = TONE_OPTIONS.find((x) => x.value === translationTone);
    return option ? panelText(t, option.labelKey) : String(translationTone);
  }, [t, translationTone]);

  const sendLangLabel = React.useMemo(() => {
    const label = labelByTranslationLang(effectiveSendLang, t);
    return autoSendSelected ? `${panelText(t, 'status.auto')} · ${label}` : label;
  }, [autoSendSelected, effectiveSendLang, t]);

  const recvLangLabel = React.useMemo(
    () => labelByTranslationLang(effectiveReceiveLang, t),
    [effectiveReceiveLang, t],
  );

  const handleSelectTier = React.useCallback((value: TranslationTier) => {
    const selectable = canSelectTier(userTier, value);
    const showUpgrade = shouldShowUpgradeButton(userTier, value);
    if (selectable) {
      setTranslationTier(value);
      return;
    }
    if (showUpgrade) onPressUpgrade();
  }, [userTier, setTranslationTier, onPressUpgrade]);

  const handleSelectTone = React.useCallback((tone: TranslationTone) => {
    if (toneDisabled) return;
    setTranslationTone(tone);
  }, [toneDisabled, setTranslationTone]);

  return (
    <TranslationSettingsPanelThemeContext.Provider value={ui}>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeWithDragReset}>
      <View style={styles.modalRoot}>
        <Pressable style={[styles.backdrop, { backgroundColor: ui.backdrop }]} onPress={closeWithDragReset} />

        <Animated.View
          style={[
            styles.card,
            cardDragStyle,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderTopLeftRadius: ui.radius.sheet,
              borderTopRightRadius: ui.radius.sheet,
              paddingBottom: 18 + insets.bottom,
            },
          ]}
        >
          <Pressable
            style={styles.handleWrap}
            onPress={closeWithDragReset}
            hitSlop={{ top: 12, bottom: 12, left: 56, right: 56 }}
            {...handlePanResponder.panHandlers}
          >
            <View style={[styles.handle, { backgroundColor: ui.handle }]} />
          </Pressable>

          <View style={styles.headerRow}>
            <View style={styles.headerTextBox}>
              <Text style={[styles.headerTitle, { color: ui.textPrimary }]}>{panelText(t, 'title')}</Text>
              <Text style={[styles.headerSubtitle, { color: ui.textSecondary }]}>{panelText(t, 'subtitle')}</Text>
            </View>

            <Pressable
              disabled={refreshDisabled}
              onPress={handleRefreshUserTier}
              android_ripple={{ color: ui.ripple, borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={t('common:refresh', { defaultValue: 'Refresh' })}
              style={({ pressed }) => [
                styles.refreshButton,
                {
                  backgroundColor: pressed ? ui.refreshPressedBackground : 'transparent',
                  opacity: refreshDisabled ? 0.42 : pressed ? 0.74 : 1,
                },
              ]}
              hitSlop={14}
            >
              <View style={refreshIconStyle}>
                <RefreshCw size={21} strokeWidth={1.9} color={ui.refreshIcon} />
              </View>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <ToggleStack>
              <SectionToggle
                embedded
                showDivider
                title={panelText(t, 'autoTranslate.title')}
                desc={panelText(t, 'autoTranslate.desc')}
                value={autoTranslate}
                onValueChange={onToggleAutoTranslate}
              />

              <SectionToggle
                embedded
                title={panelText(t, 'showTranslatedOnly.title')}
                desc={panelText(t, 'showTranslatedOnly.desc')}
                value={showTranslatedOnly}
                onValueChange={onToggleShowTranslatedOnly}
              />
            </ToggleStack>

            <ExpandBlock
              title={panelText(t, 'tier.title')}
              value={tierLabel}
              desc={panelText(t, 'tier.desc')}
              open={tierOpen}
              onPress={() => toggleOpenSection('tier')}
            >
              {TIER_OPTIONS.map((option) => {
                const selected = option.value === translationTier;
                const selectable = canSelectTier(userTier, option.value);
                const showUpgrade = shouldShowUpgradeButton(userTier, option.value);
                return (
                  <OptionRow
                    key={option.value}
                    title={panelText(t, option.labelKey)}
                    desc={panelText(t, option.descKey)}
                    selected={selected && selectable}
                    disabled={!selectable && !showUpgrade}
                    rightText={showUpgrade ? panelText(t, 'tier.upgrade') : null}
                    onPress={() => handleSelectTier(option.value)}
                  />
                );
              })}
            </ExpandBlock>

            <ExpandBlock
              title={panelText(t, 'tone.title')}
              value={toneLabel}
              desc={panelText(t, 'tone.desc')}
              open={toneOpen}
              onPress={() => toggleOpenSection('tone')}
            >
              {TONE_OPTIONS.map((option) => {
                const selected = option.value === translationTone;
                return (
                  <OptionRow
                    key={option.value}
                    title={panelText(t, option.labelKey)}
                    desc={panelText(t, option.descKey)}
                    selected={selected && !toneDisabled}
                    disabled={toneDisabled}
                    onPress={() => handleSelectTone(option.value)}
                  />
                );
              })}
            </ExpandBlock>

            <ExpandBlock
              title={panelText(t, 'sendLang.title')}
              value={sendLangLabel}
              desc={panelText(t, 'sendLang.desc')}
              open={sendLangOpen}
              onPress={() => toggleOpenSection('sendLang')}
            >
              <OptionRow
                key="send-auto"
                title={panelText(t, 'sendLang.auto')}
                rightText={labelByTranslationLang(effectiveSendLang, t)}
                selected={autoSendSelected}
                onPress={() => onChangePreferredLang(AUTO_SEND_LANG)}
              />

              {TRANSLATION_LANGUAGE_OPTIONS.map((opt) => {
                const selected = !autoSendSelected && opt.code === effectiveSendLang;
                const isPeerDefault = !!peerDefaultSendLang && opt.code === peerDefaultSendLang;
                return (
                  <OptionRow
                    key={`send-${opt.code}`}
                    title={labelByTranslationLang(opt.code, t)}
                    rightText={isPeerDefault ? panelText(t, 'sendLang.peerDefault') : null}
                    selected={selected}
                    onPress={() => onChangePreferredLang(opt.code)}
                  />
                );
              })}
            </ExpandBlock>

            <ExpandBlock
              title={panelText(t, 'receiveLang.title')}
              value={recvLangLabel}
              desc={panelText(t, 'receiveLang.desc')}
              open={recvLangOpen}
              onPress={() => toggleOpenSection('recvLang')}
            >
              {TRANSLATION_LANGUAGE_OPTIONS.map((opt) => {
                const selected = opt.code === effectiveReceiveLang;
                return (
                  <OptionRow
                    key={`recv-${opt.code}`}
                    title={labelByTranslationLang(opt.code, t)}
                    selected={selected}
                    onPress={() => onChangeViewLang(opt.code)}
                  />
                );
              })}
            </ExpandBlock>
          </ScrollView>

          <Pressable
            onPress={closeWithDragReset}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: ui.doneBackground,
                borderRadius: ui.radius.capsule,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
            hitSlop={12}
          >
            <Text style={[styles.closeButtonText, { color: ui.doneText }]}>{t('common:done')}</Text>
          </Pressable>
        </Animated.View>
      </View>
      </Modal>
    </TranslationSettingsPanelThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    maxHeight: '84%',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 22,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
  },
  headerRow: {
    paddingHorizontal: 2,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextBox: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    marginTop: -3,
    marginRight: -2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  scroll: {
    maxHeight: 620,
  },
  scrollContent: {
    paddingBottom: 10,
    gap: 10,
  },
  toggleStack: {
    overflow: 'hidden',
  },
  toggleCard: {
    minHeight: 62,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  toggleInlineRow: {
    minHeight: 62,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  toggleTextBox: {
    flex: 1,
    minWidth: 0,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  toggleDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  expandBlock: {
    overflow: 'hidden',
  },
  expandHeaderPressable: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  expandHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  expandTitleBox: {
    flex: 1,
    minWidth: 0,
  },
  expandTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  expandValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '400',
  },
  expandDesc: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  chevronBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionGroup: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  optionRow: {
    minHeight: 52,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionTextBox: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  optionDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 28,
    justifyContent: 'flex-end',
  },
  optionRightText: {
    fontSize: 12,
    fontWeight: '500',
    marginRight: 8,
  },
  optionRightSub: {
    fontSize: 12,
    fontWeight: '400',
    marginRight: 8,
  },
  radioOuter: {
    width: 19,
    height: 19,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  infoText: {
    marginHorizontal: 4,
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  closeButton: {
    marginTop: 14,
    alignSelf: 'center',
    minWidth: 96,
    minHeight: 42,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
