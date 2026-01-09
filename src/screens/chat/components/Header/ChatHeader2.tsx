// src/screens/chat/components/Header/ChatHeader.tsx
import React from 'react';
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
  Languages,
  Search,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react-native';

import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type RoomType = 'self' | 'dm' | 'personal' | 'group' | 'open' | 'beacon';

type Props = {
  // ✅ theme injected from Chat.tsx
  theme: ChatTheme;

  // 상위(Chat.tsx)에서 계산해서 내려주는 최종 제목
  title: string;

  // 참여자 수
  participantCount: number;

  // 자동 번역 상태
  autoTranslate: boolean;

  // ✅ 헤더 배지에 표시할 "보낼 언어" 코드 (preferred_lang)
  myLang: string;

  // 번역 ON/OFF 토글 (탭)
  onToggleTranslate: () => void;

  // 번역 설정 팝업 열기 (롱프레스)
  onOpenTranslateSettings?: () => void;

  // 검색 버튼 클릭 (일반모드에서 searchMode 진입 트리거)
  onPressSearch?: () => void;

  // 옵션(더보기) 버튼 클릭
  onPressOptions?: () => void;

  // 방 타입
  roomType?: RoomType;

  // =========================
  // ✅ Kakao-style inline search mode
  // =========================
  searchMode?: boolean;

  searchQuery?: string;
  onChangeSearchQuery?: (v: string) => void;
  onSubmitSearch?: () => void;

  // chip labels (예: "원규", "2025-12-21")
  searchSenderLabel?: string;
  searchDateLabel?: string;

  onPressSearchSender?: () => void;
  onPressSearchDate?: () => void;

  // search mode 종료 (X)
  onExitSearch?: () => void;

  // =========================
  // ✅ Advanced search (원문+번역 동시 검색)
  // =========================
  advancedSearch?: boolean;
  onToggleAdvancedSearch?: () => void;
};

const HEADER_HEIGHT = 54;

function hexToRgba(hex: string, alpha: number) {
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
    autoTranslate,
    myLang,
    onToggleTranslate,
    onOpenTranslateSettings,
    onPressSearch,
    onPressOptions,
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

  const roomTypeLabel = React.useMemo(() => {
    if (!roomType) return '';
    switch (roomType) {
      case 'self':
        return '나와의 채팅';
      case 'dm':
        return '비지니스 채팅';
      case 'personal':
        return '1:1 채팅';
      case 'group':
        return '그룹 채팅';
      case 'open':
        return '오픈채팅';
      case 'beacon':
        return '비콘 채팅';
      default:
        return '';
    }
  }, [roomType]);

  // ✅ theme-driven colors
  const headerBg = theme.headerBg;
  const titleColor = theme.opponentText;
  const subColor = theme.originalText;
  const divider = 'rgba(0,0,0,0.08)';

  const iconColor = theme.opponentText;
  const translateOn = theme.translateOn;

  const badgeBg = hexToRgba(headerBg, 0.92);
  const badgeText = translateOn;

  const badgeCode = React.useMemo(() => {
    const s = String(myLang ?? '').trim();
    if (!s) return '';
    return s.toUpperCase();
  }, [myLang]);

  const handleExitSearch = React.useCallback(() => {
    if (onExitSearch) return onExitSearch();
    navigation.goBack();
  }, [navigation, onExitSearch]);

  const handleBack = React.useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const showSenderChip = !!(searchSenderLabel && searchSenderLabel.trim());
  const showDateChip = !!(searchDateLabel && searchDateLabel.trim());

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
                ref={(r) => {
                  inputRef.current = r;
                }}
                value={searchQuery ?? ''}
                onChangeText={(v) => onChangeSearchQuery?.(v)}
                placeholder="대화내용 검색"
                placeholderTextColor={hexToRgba(titleColor, 0.55)}
                style={[styles.searchInput, { color: titleColor }]}
                returnKeyType="search"
                onSubmitEditing={() => onSubmitSearch?.()}
                autoCorrect={false}
                autoCapitalize="none"
                underlineColorAndroid="transparent"
              />

              {/* ✅ 고급검색 토글 (원문+번역 동시) */}
              <Pressable
                style={[
                  styles.advBtn,
                  {
                    backgroundColor: advancedSearch
                      ? hexToRgba('#000', 0.18)
                      : 'transparent',
                    borderColor: advancedSearch
                      ? hexToRgba('#000', 0.12)
                      : hexToRgba('#000', 0.10),
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
                  style={[
                    styles.advTxt,
                    { color: advancedSearch ? titleColor : hexToRgba(titleColor, 0.72) },
                  ]}
                  numberOfLines={1}
                >
                  고급
                </Text>
              </Pressable>

              <Pressable
                style={styles.searchIconInBox}
                onPress={() => onSubmitSearch?.()}
                hitSlop={8}
              >
                <Search size={18} color={hexToRgba(iconColor, 0.8)} strokeWidth={2.6} />
              </Pressable>
            </View>

            <View style={styles.pickerRow}>
              <Pressable style={styles.pickerBtn} onPress={onPressSearchSender} hitSlop={6}>
                <Text style={[styles.pickerTxt, { color: hexToRgba(titleColor, 0.78) }]}>
                  보낸사람
                </Text>
              </Pressable>

              <View style={[styles.pickerDot, { backgroundColor: hexToRgba(titleColor, 0.25) }]} />

              <Pressable style={styles.pickerBtn} onPress={onPressSearchDate} hitSlop={6}>
                <Text style={[styles.pickerTxt, { color: hexToRgba(titleColor, 0.78) }]}>
                  날짜
                </Text>
              </Pressable>

              {/* roomTypeLabel 필요하면 여기 배치 가능 */}
              {!!roomTypeLabel ? null : null}
            </View>
          </View>
        ) : (
          <View style={styles.titleWrap}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.memberCount, { color: subColor }]}>{participantCount}</Text>
            </View>
          </View>
        )}

        {/* RIGHT */}
        {searchMode ? (
          <View style={styles.rightRowSearch} />
        ) : (
          <View style={styles.rightRow}>
            <View style={{ position: 'relative' }}>
              {autoTranslate && !!badgeCode && (
                <View style={[styles.langBadgeGlass, { backgroundColor: badgeBg }]}>
                  <Text
                    style={[styles.langBadgeGlassTxt, { color: badgeText }]}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {badgeCode}
                  </Text>
                </View>
              )}

              <Pressable
                style={styles.headerBtn}
                onPress={onToggleTranslate}
                onLongPress={onOpenTranslateSettings}
                delayLongPress={250}
                hitSlop={8}
              >
                <Languages
                  size={18}
                  strokeWidth={2.6}
                  color={autoTranslate ? translateOn : hexToRgba(iconColor, 0.55)}
                />
              </Pressable>
            </View>

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
  },

  titleWrap: {
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  title: { fontSize: 18, fontWeight: '800' },
  memberCount: { marginLeft: 4, fontSize: 14, fontWeight: '700', opacity: 0.65 },

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

  // Language badge
  langBadgeGlass: {
    position: 'absolute',
    top: 2,
    left: -10,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  langBadgeGlassTxt: {
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.2,
  },
});
