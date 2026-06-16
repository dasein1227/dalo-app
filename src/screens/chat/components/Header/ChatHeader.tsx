// src/screens/chat/components/Header/ChatHeader.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  X,
  Search,
  Lock,
  LockOpen,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react-native';


import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type RoomType = 'self' | 'dm' | 'personal' | 'business_dm' | 'group' | 'open' | 'beacon';

type Props = {
  avatarUrl?: string | null;
  theme: ChatTheme;
  title: string;
  participantCount: number;
  autoTranslate: boolean;
  myLang: string;
  onToggleTranslate: () => void;
  onOpenTranslateSettings?: () => void;
  onPressSearch?: () => void;
  onPressOptions?: () => void;
  onBack?: () => void;
  secureEnabled?: boolean;
  secureUnlocking?: boolean;
  onToggleSecure?: () => void;
  roomType?: RoomType;
  searchMode?: boolean;
  searchQuery?: string;
  onChangeSearchQuery?: (v: string) => void;
  onSubmitSearch?: () => void;
  searchSenderLabel?: string;
  searchDateLabel?: string;
  onPressSearchSender?: () => void;
  onPressSearchDate?: () => void;
  onExitSearch?: () => void;
  advancedSearch?: boolean;
  onToggleAdvancedSearch?: () => void;
  hasOptionsBadge?: boolean;
};

const HEADER_HEIGHT = 54;

function hexToRgba(hex: string, alpha: number) {
  'worklet';
  const h = String(hex ?? '')
    .replace('#', '')
    .trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function ChatHeader(props: Props) {
  const {
    theme,
    title,
    participantCount,
    onPressSearch,
    onPressOptions,
    onBack,
    secureEnabled = false,
    secureUnlocking = false,
    onToggleSecure,
    roomType,
    searchMode,
    searchQuery,
    onChangeSearchQuery,
    onSubmitSearch,
    searchSenderLabel,
    searchDateLabel,
    onPressSearchSender,
    onPressSearchDate,
    onExitSearch,
    advancedSearch,
    onToggleAdvancedSearch,
  } = props;

  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const inputRef = React.useRef<TextInput | null>(null);

  React.useEffect(() => {
    if (searchMode) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [searchMode]);


  const headerBg = theme.headerBg;
  const titleColor = theme.opponentText;
  const subColor = theme.originalText;
  const divider = 'rgba(0,0,0,0.08)';
  const iconColor = theme.opponentText;


  const handleExitSearch = React.useCallback(() => {
    if (onExitSearch) return onExitSearch();
    navigation.goBack();
  }, [navigation, onExitSearch]);

  const handleBack = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    navigation.goBack();
  }, [navigation, onBack]);

  const showSenderChip = !!(searchSenderLabel && searchSenderLabel.trim());
  const showDateChip = !!(searchDateLabel && searchDateLabel.trim());

  const canShowParticipantCount =
    roomType === 'group' || roomType === 'open' || roomType === 'beacon';
  const showParticipantCount =
    canShowParticipantCount &&
    Number.isFinite(Number(participantCount)) &&
    Number(participantCount) > 1;
  const showSelfPill = roomType === 'self';

  return (
    <View style={[styles.wrap, { backgroundColor: headerBg, paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          { height: HEADER_HEIGHT, backgroundColor: headerBg, borderBottomColor: divider },
        ]}
      >
        {/* LEFT */}
        {searchMode ? (
          <Pressable style={styles.headerBtn} onPress={handleExitSearch} hitSlop={8}>
            <X size={20} color={iconColor} strokeWidth={2.8} />
          </Pressable>
        ) : (
          <Pressable style={styles.headerBtn} onPress={handleBack} hitSlop={8}>
            <ChevronLeft size={22} color={iconColor} strokeWidth={2.4} />
          </Pressable>
        )}

        {/* CENTER */}
        {searchMode ? (
          <View style={styles.searchCenterWrap}>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: hexToRgba('#000', Platform.OS === 'ios' ? 0.06 : 0.08),
                  borderColor: hexToRgba('#000', 0.06),
                },
              ]}
            >
              {showSenderChip ? (
                <Pressable
                  style={[styles.chip, { backgroundColor: hexToRgba('#000', 0.12) }]}
                  onPress={onPressSearchSender}
                  hitSlop={6}
                >
                  <Text style={[styles.chipText, { color: titleColor }]} numberOfLines={1}>
                    {searchSenderLabel}
                  </Text>
                  <Text style={[styles.chipX, { color: titleColor }]}>×</Text>
                </Pressable>
              ) : null}

              {showDateChip ? (
                <Pressable
                  style={[styles.chip, { backgroundColor: hexToRgba('#000', 0.12) }]}
                  onPress={onPressSearchDate}
                  hitSlop={6}
                >
                  <Text style={[styles.chipText, { color: titleColor }]} numberOfLines={1}>
                    {searchDateLabel}
                  </Text>
                </Pressable>
              ) : null}

              <TextInput
                ref={(r) => { inputRef.current = r; }}
                value={searchQuery ?? ''}
                onChangeText={(v) => onChangeSearchQuery?.(v)}
                placeholder={t('chat:header.searchPlaceholder')}
                placeholderTextColor={hexToRgba(titleColor, 0.55)}
                style={[styles.searchInput, { color: titleColor }]}
                returnKeyType="search"
                onSubmitEditing={() => onSubmitSearch?.()}
                autoCorrect={false}
                autoCapitalize="none"
                underlineColorAndroid="transparent"
              />

              <Pressable
                style={[
                  styles.advBtn,
                  {
                    backgroundColor: advancedSearch ? hexToRgba('#000', 0.18) : 'transparent',
                    borderColor: advancedSearch ? hexToRgba('#000', 0.12) : hexToRgba('#000', 0.10),
                  },
                ]}
                onPress={onToggleAdvancedSearch}
                hitSlop={8}
              >
                <SlidersHorizontal
                  size={16}
                  color={advancedSearch ? titleColor : hexToRgba(titleColor, 0.72)}
                  strokeWidth={2.6}
                />
                <Text
                  style={[styles.advTxt, { color: advancedSearch ? titleColor : hexToRgba(titleColor, 0.72) }]}
                  numberOfLines={1}
                >
                  {t('chat:header.advanced')}
                </Text>
              </Pressable>

              <Pressable style={styles.searchIconInBox} onPress={() => onSubmitSearch?.()} hitSlop={8}>
                <Search size={18} color={hexToRgba(iconColor, 0.8)} strokeWidth={2.6} />
              </Pressable>
            </View>

            <View style={styles.pickerRow}>
              <Pressable style={styles.pickerBtn} onPress={onPressSearchSender} hitSlop={6}>
                <Text style={[styles.pickerTxt, { color: hexToRgba(titleColor, 0.78) }]}>{t('chat:header.sender')}</Text>
              </Pressable>
              <View style={[styles.pickerDot, { backgroundColor: hexToRgba(titleColor, 0.25) }]} />
              <Pressable style={styles.pickerBtn} onPress={onPressSearchDate} hitSlop={6}>
                <Text style={[styles.pickerTxt, { color: hexToRgba(titleColor, 0.78) }]}>{t('chat:header.date')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.titleWrap}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                {title}
              </Text>
              {showSelfPill ? (
                <View style={[styles.selfPill, { backgroundColor: hexToRgba(titleColor, 0.08) }]}>
                  <Text style={[styles.selfPillText, { color: titleColor }]}>{t('chat:me')}</Text>
                </View>
              ) : null}
              {showParticipantCount ? (
                <Text style={[styles.memberCount, { color: subColor }]}>{participantCount}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* RIGHT */}
        {searchMode ? (
          <View style={styles.rightRowSearch} />
        ) : (
          <View style={styles.rightRow}>

            {onToggleSecure ? (
              <Pressable
                style={[
                  styles.headerBtn,
                  secureEnabled
                    ? { backgroundColor: hexToRgba(iconColor, 0.08) }
                    : null,
                  secureUnlocking ? { opacity: 0.55 } : null,
                ]}
                onPress={onToggleSecure}
                disabled={secureUnlocking}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={secureEnabled ? t('chat:secure.enabled') : t('chat:secure.disabled')}
              >
                {secureEnabled ? (
                  <Lock size={18} color={iconColor} strokeWidth={2.45} />
                ) : (
                  <LockOpen size={18} color={hexToRgba(iconColor, 0.72)} strokeWidth={2.35} />
                )}
              </Pressable>
            ) : null}

            <Pressable style={styles.headerBtn} onPress={onPressSearch} hitSlop={8}>
              <Search size={18} color={iconColor} strokeWidth={2.6} />
            </Pressable>

            <Pressable style={styles.headerBtn} onPress={onPressOptions} hitSlop={8}>
              <MoreHorizontal size={22} color={iconColor} strokeWidth={2.4} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },

  title: { flexShrink: 1, minWidth: 0, fontSize: 18, fontWeight: '800' },
  selfPill: {
    marginLeft: 6,
    height: 20,
    minWidth: 28,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selfPillText: { fontSize: 11, fontWeight: '900', includeFontPadding: false },
  memberCount: { marginLeft: 4, fontSize: 14, fontWeight: '700', opacity: 0.65, flexShrink: 0 },

  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // Search mode
  searchCenterWrap: { flex: 1, marginHorizontal: 6, justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 26,
  },
  chipText: { fontSize: 13, fontWeight: '800', includeFontPadding: false },
  chipX: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 16,
    includeFontPadding: false,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
    includeFontPadding: false,
  },

  advBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  advTxt: {
    fontSize: 12,
    fontWeight: '900',
    includeFontPadding: false,
    letterSpacing: -0.2,
  },

  searchIconInBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  pickerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  pickerBtn: { paddingVertical: 2, paddingHorizontal: 2 },
  pickerTxt: { fontSize: 12, fontWeight: '800', includeFontPadding: false },
  pickerDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.9 },
  rightRowSearch: { width: 36 },
});