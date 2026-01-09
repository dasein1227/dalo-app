// src/screens/chat/components/InputBar/InputBar.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Keyboard,
  Platform,
  Dimensions,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

import {
  Mic,
  Send as SendIcon,
  Image as ImageIcon,
  Camera,
  Clock,
  MapPin,
  Phone,
  FileText,
  Languages,
  Plus,
  X,
  Smile,
  UserPlus,
  WalletCards,
  Sticker,
  Music,
  Video,
} from 'lucide-react-native';

import InputReplyPreview from './InputReplyPreview';
import type { ReplyInfo, TranslationTier, TranslationTone } from '../../hooks/useChatUIState';

import {
  makeKeyboardCacheKey,
  getCachedKeyboardHeight,
  updateCachedKeyboardHeight,
} from '@/lib/ui/keyboardHeightCache';

import type { ChatTheme } from '../../theme/chatTheme';

const FALLBACK_PANEL_H = 360;
const PANEL_MIN_H = 280;

/**
 * ✅ (추가) 런타임 메모리 캐시
 * - 같은 앱 세션 내에서 방을 나갔다 들어올 때 “첫 프레임부터” 캐시값으로 시작하게 함
 * - WatermelonDB async read 전에 360으로 열리는 현상 제거에 매우 효과적
 */
const MEM_KB_CACHE = new Map<string, number>();

function clampPanelH(v: number) {
  return Math.max(PANEL_MIN_H, Math.min(420, Math.round(v)));
}

type Props = {
  theme: ChatTheme;

  collapseNonce?: number;
  onAttachmentsOpenChange?: (open: boolean) => void;

  text: string;
  setText: (v: string) => void;
  replyTo: ReplyInfo | null;
  cancelReply: () => void;

  sendMessage: (opts: {
    content: string;
    original?: string | null;
    kind?: string;
    replyTo?: ReplyInfo | null;
  }) => Promise<void>;

  openMedia: () => void;
  openVoice: () => void;

  onOpenTranslateSettings: () => void;

  autoTranslate: boolean;
  setAutoTranslate: (v: boolean) => void;
  translationTier: TranslationTier;
  translationTone: TranslationTone;

  showTranslatedOnly?: boolean;
};

type AttachmentItemProps = {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
  itemW: number;
  theme: ChatTheme;
};

function AttachmentItem({ label, onPress, icon, itemW, theme }: AttachmentItemProps) {
  return (
    <Pressable style={[styles.attachItem, { width: itemW }]} onPress={onPress}>
      <View style={[styles.attachIconWrap, { backgroundColor: theme.opponentBubble }]}>{icon}</View>
      <Text style={[styles.attachLabel, { color: theme.originalText }]}>{label}</Text>
    </Pressable>
  );
}

function PlusXButton({
  isOpen,
  onPress,
  theme,
}: {
  isOpen: boolean;
  onPress: () => void;
  theme: ChatTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.plusBtn,
        {
          backgroundColor: theme.opponentBubble,
          borderColor: 'rgba(229, 231, 235, 0.5)',
        },
        pressed && { opacity: 0.75 },
      ]}
      hitSlop={8}
    >
      {isOpen ? (
        <X size={22} color={theme.accessoryIcon} strokeWidth={2.6} />
      ) : (
        <Plus size={22} color={theme.accessoryIcon} strokeWidth={2.6} />
      )}
    </Pressable>
  );
}

export default function InputBar({
  theme,

  collapseNonce,
  onAttachmentsOpenChange,

  text,
  setText,
  replyTo,
  cancelReply,
  sendMessage,
  openMedia,
  openVoice,
  onOpenTranslateSettings,

  autoTranslate,
  setAutoTranslate,
  translationTier,
  translationTone,

  showTranslatedOnly = false,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = { autoTranslate, setAutoTranslate, translationTier, translationTone };

  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);

  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);

  const { height: kbH, progress: kbP } = useReanimatedKeyboardAnimation() as any;

  const screen = Dimensions.get('screen');
  const win = Dimensions.get('window');

  const SCREEN_W = win.width;
  const SCREEN_H = win.height;
  const MAX_KB_H = Math.min(420, Math.floor(SCREEN_H * 0.6));

  /**
   * ✅ (개선) 캐시 키 2종: screen 기반 + window 기반
   * - 일부 Android에서 screen 값이 상태에 따라 바뀌어 miss 나는 케이스 완화
   */
  const platformKey = Platform.OS === 'ios' ? 'ios' : 'android';
  const primaryKey = useMemo(
    () =>
      makeKeyboardCacheKey({
        platform: platformKey,
        screenW: screen.width,
        screenH: screen.height,
      }),
    [platformKey, screen.width, screen.height],
  );

  const fallbackKey = useMemo(
    () =>
      makeKeyboardCacheKey({
        platform: platformKey,
        screenW: win.width,
        screenH: win.height,
      }),
    [platformKey, win.width, win.height],
  );

  const cacheKeyRef = useRef(primaryKey);
  React.useEffect(() => {
    cacheKeyRef.current = primaryKey;
  }, [primaryKey]);

  /**
   * ✅ (핵심) defaultPanelH의 초기값을 “메모리 캐시”에서 먼저 채움
   * - 재진입(같은 앱 세션)에서 async DB read 전에 360으로 열리는 현상 제거
   */
  const [defaultPanelH, setDefaultPanelH] = useState<number>(() => {
    const memPrimary = MEM_KB_CACHE.get(primaryKey);
    if (typeof memPrimary === 'number' && memPrimary > 0) return clampPanelH(memPrimary);

    const memFallback = MEM_KB_CACHE.get(fallbackKey);
    if (typeof memFallback === 'number' && memFallback > 0) return clampPanelH(memFallback);

    return FALLBACK_PANEL_H;
  });

  const GRID_PADDING_H = 16;
  const GRID_GAP = 12;
  const ITEM_MIN_W = 78;
  const MAX_COLS = 6;
  const MIN_COLS = 4;

  const gridCols = useMemo(() => {
    const usable = SCREEN_W - GRID_PADDING_H * 2;
    const cols = Math.floor((usable + GRID_GAP) / (ITEM_MIN_W + GRID_GAP));
    return Math.max(MIN_COLS, Math.min(MAX_COLS, cols));
  }, [SCREEN_W]);

  const itemW = useMemo(() => {
    const usable = SCREEN_W - GRID_PADDING_H * 2;
    const w = (usable - GRID_GAP * (gridCols - 1)) / gridCols;
    return Math.floor(w);
  }, [SCREEN_W, gridCols]);

  const ITEMS_PER_ROW = gridCols;
  const ROW_H = 72;
  const PANEL_TOP_PAD = 10;
  const PANEL_BOTTOM_PAD = 6 + 16 + 12;

  const MIN_ROWS = 1;
  const MAX_ROWS = 3;

  const itemsPerPage = useMemo(() => {
    const avail = Math.max(PANEL_MIN_H, defaultPanelH) - PANEL_TOP_PAD - PANEL_BOTTOM_PAD;
    const rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor(avail / ROW_H)));
    return Math.max(ITEMS_PER_ROW, rows * ITEMS_PER_ROW);
  }, [defaultPanelH, ITEMS_PER_ROW]);

  /**
   * ✅ (핵심) async DB 캐시 로드 + 이미 패널이 열려있으면 UI 보정
   * - “입장 직후 + 버튼” 케이스에서 DB 로드가 늦으면 360으로 열리는데,
   *   로드 완료 시점에 바로 holdHeightSV를 올려 패널 높이를 즉시 정상화
   */
  React.useEffect(() => {
    let alive = true;

    (async () => {
      const key = primaryKey;

      // 1) DB 캐시: primary key 먼저
      let cached = await getCachedKeyboardHeight(key);

      // 2) miss면 window 기반 키도 시도
      if (cached == null) {
        cached = await getCachedKeyboardHeight(fallbackKey);
      }

      if (!alive) return;

      if (cached != null) {
        const clamped = clampPanelH(cached);

        // 메모리 캐시 갱신(재진입 즉시 적용)
        MEM_KB_CACHE.set(primaryKey, clamped);
        MEM_KB_CACHE.set(fallbackKey, clamped);

        // state 갱신
        setDefaultPanelH((prev) => (Math.abs(prev - clamped) >= 1 ? clamped : prev));

        // ✅ 이미 첨부패널이 열려있고(키보드 0), 패널 높이를 즉시 보정
        // - 키보드 올리지 않아도 패널이 캐시값으로 바로 맞춰짐
        runOnUI(() => {
          const kh = Math.min(Math.max(0, Math.abs(kbH?.value ?? 0)), MAX_KB_H);
          if (kh === 0 && panelOpenSV.value === 1) {
            const base = Math.max(clamped, PANEL_MIN_H);
            holdOnSV.value = 1;
            holdHeightSV.value = Math.max(holdHeightSV.value, base);
            lastKbSV.value = Math.max(lastKbSV.value, base);
          }
        })();
      } else {
        // DB에도 없으면 fallback 유지
        setDefaultPanelH((prev) => prev);
      }
    })();

    return () => {
      alive = false;
    };
    // kbH/panelOpenSV/holdHeightSV 등은 runOnUI로 접근하므로 deps에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKey, fallbackKey, MAX_KB_H]);

  const panelOpenSV = useSharedValue(0);

  const holdOnSV = useSharedValue(0);
  const holdHeightSV = useSharedValue(FALLBACK_PANEL_H);
  const lastKbSV = useSharedValue(FALLBACK_PANEL_H);
  const programmaticDismissSV = useSharedValue(0);

  const saveArmedSV = useSharedValue(1);

  const maxSeenKhSV = useSharedValue(0);
  const prevKhSV = useSharedValue(0);
  const stableFramesSV = useSharedValue(0);

  React.useEffect(() => {
    const base = Math.max(defaultPanelH, PANEL_MIN_H);
    holdHeightSV.value = Math.max(holdHeightSV.value, base);
    lastKbSV.value = Math.max(lastKbSV.value, base);
  }, [defaultPanelH, holdHeightSV, lastKbSV]);

  React.useEffect(() => {
    panelOpenSV.value = attachmentsOpen ? 1 : 0;
    onAttachmentsOpenChange?.(attachmentsOpen);
  }, [attachmentsOpen, panelOpenSV, onAttachmentsOpenChange]);

  const prevCollapseRef = useRef<number | undefined>(collapseNonce);
  React.useEffect(() => {
    if (collapseNonce == null) return;
    if (prevCollapseRef.current === collapseNonce) return;
    prevCollapseRef.current = collapseNonce;

    programmaticDismissSV.value = 0;
    holdOnSV.value = 0;
    setAttachmentsOpen(false);
    Keyboard.dismiss();
    inputRef.current?.blur();
  }, [collapseNonce, programmaticDismissSV, holdOnSV]);

  const collapseExtraAreaNow = useCallback(() => {
    runOnUI(() => {
      programmaticDismissSV.value = 0;
      holdOnSV.value = 0;
      holdHeightSV.value = 0;

      saveArmedSV.value = 1;
      maxSeenKhSV.value = 0;
      prevKhSV.value = 0;
      stableFramesSV.value = 0;
    })();

    setAttachmentsOpen(false);
    Keyboard.dismiss();
    inputRef.current?.blur();
  }, [programmaticDismissSV, holdOnSV, holdHeightSV, saveArmedSV, maxSeenKhSV, prevKhSV, stableFramesSV]);

  const persistKeyboardHeight = useCallback(async (measured: number) => {
    const key = cacheKeyRef.current;
    const clampedNow = clampPanelH(measured);

    // ✅ 메모리 캐시 갱신(재진입 즉시 적용)
    MEM_KB_CACHE.set(key, clampedNow);
    MEM_KB_CACHE.set(fallbackKey, clampedNow);

    setDefaultPanelH((prev) => (Math.abs(prev - clampedNow) >= 1 ? clampedNow : prev));

    await updateCachedKeyboardHeight({
      key,
      measuredHeight: measured,
      thresholdPx: 24,
      minPx: 240,
      maxPx: 520,
    });

    // (선택) window 키에도 저장해두면 miss가 더 줄어듦
    if (fallbackKey && fallbackKey !== key) {
      await updateCachedKeyboardHeight({
        key: fallbackKey,
        measuredHeight: measured,
        thresholdPx: 24,
        minPx: 240,
        maxPx: 520,
      });
    }
  }, [fallbackKey]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSampleRef = useRef<number>(0);

  const queuePersistKeyboardHeight = useCallback(
    (measured: number) => {
      lastSampleRef.current = measured;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(() => {
        persistKeyboardHeight(lastSampleRef.current);
      }, 120);
    },
    [persistKeyboardHeight],
  );

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useAnimatedReaction(
    () => {
      const hAbs = Math.abs(kbH?.value ?? 0);
      const p = kbP?.value ?? -1;
      return { hAbs, p };
    },
    ({ hAbs, p }) => {
      const kh = Math.min(Math.max(0, hAbs), MAX_KB_H);
      const base = Math.max(defaultPanelH, PANEL_MIN_H);

      if (kh === 0) {
        saveArmedSV.value = 1;
        maxSeenKhSV.value = 0;
        prevKhSV.value = 0;
        stableFramesSV.value = 0;

        if (panelOpenSV.value === 1) {
          holdOnSV.value = 1;
          holdHeightSV.value = Math.max(holdHeightSV.value, base);
          return;
        }

        if (programmaticDismissSV.value === 1) {
          holdOnSV.value = 1;
          holdHeightSV.value = Math.max(holdHeightSV.value, base);
          return;
        }

        holdOnSV.value = 0;
        return;
      }

      holdOnSV.value = 1;
      programmaticDismissSV.value = 0;
      holdHeightSV.value = kh;

      if (kh > 80) {
        lastKbSV.value = kh;
      }

      if (kh > maxSeenKhSV.value) {
        maxSeenKhSV.value = kh;
      }

      const delta = Math.abs(kh - prevKhSV.value);
      prevKhSV.value = kh;

      const nearMax = kh >= maxSeenKhSV.value - 1;
      const almostNoMove = delta <= 1;

      if (nearMax && almostNoMove && kh >= 200) {
        stableFramesSV.value = Math.min(10, stableFramesSV.value + 1);
      } else {
        stableFramesSV.value = 0;
      }

      const progressSaysDone = p >= 0.999;
      const stableSaysDone = stableFramesSV.value >= 4;

      if (saveArmedSV.value === 1 && (progressSaysDone || stableSaysDone)) {
        saveArmedSV.value = 0;
        const finalKh = maxSeenKhSV.value;
        runOnJS(queuePersistKeyboardHeight)(finalKh);
      }
    },
    [defaultPanelH, MAX_KB_H],
  );

  const showSend = useMemo(() => text.trim().length > 0, [text]);

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    await sendMessage({
      content: trimmed,
      original: null,
      kind: 'text',
      replyTo,
    });

    setText('');
    cancelReply();
  }, [text, replyTo, sendMessage, setText, cancelReply]);

  const handlePressAlbum = useCallback(() => {
    collapseExtraAreaNow();
    openMedia();
  }, [collapseExtraAreaNow, openMedia]);

  const handlePressCamera = useCallback(() => {
    collapseExtraAreaNow();
    openMedia();
  }, [collapseExtraAreaNow, openMedia]);

  const handlePressReserved = useCallback(() => {
    collapseExtraAreaNow();
  }, [collapseExtraAreaNow]);

  const handlePressMap = useCallback(() => {
    collapseExtraAreaNow();
  }, [collapseExtraAreaNow]);

  const handlePressContact = useCallback(() => {
    collapseExtraAreaNow();
  }, [collapseExtraAreaNow]);

  const handlePressVoice = useCallback(() => {
    collapseExtraAreaNow();
    openVoice();
  }, [collapseExtraAreaNow, openVoice]);

  const handlePressFile = useCallback(() => {
    collapseExtraAreaNow();
  }, [collapseExtraAreaNow]);

  const handlePressTranslate = useCallback(() => {
    collapseExtraAreaNow();
    onOpenTranslateSettings();
  }, [collapseExtraAreaNow, onOpenTranslateSettings]);

  const handlePressEmoji = useCallback(() => {}, []);
  const handlePressFriend = useCallback(() => {}, []);
  const handlePressMoney = useCallback(() => {}, []);
  const handlePressSticker = useCallback(() => {}, []);
  const handlePressMusic = useCallback(() => {}, []);
  const handlePressVideo = useCallback(() => {}, []);

  const onPressPlusOrClose = useCallback(() => {
    if (attachmentsOpen) {
      programmaticDismissSV.value = 0;
      setAttachmentsOpen(false);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    runOnUI(() => {
      const base = Math.max(defaultPanelH, PANEL_MIN_H);
      const target = Math.max(lastKbSV.value, base);

      holdHeightSV.value = target;
      holdOnSV.value = 1;
      programmaticDismissSV.value = 1;
    })();

    setPageIndex(0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    });

    setAttachmentsOpen(true);
    Keyboard.dismiss();
  }, [attachmentsOpen, defaultPanelH, programmaticDismissSV, holdHeightSV, holdOnSV, lastKbSV]);

  const onFocusInput = useCallback(() => {
    if (!attachmentsOpen) return;
    programmaticDismissSV.value = 0;
    setAttachmentsOpen(false);
  }, [attachmentsOpen, programmaticDismissSV]);

  const extraAreaH = useDerivedValue(() => {
    const base = Math.max(defaultPanelH, PANEL_MIN_H);
    if (holdOnSV.value === 1) return Math.max(holdHeightSV.value, base);

    const kh = Math.min(Math.max(0, Math.abs(kbH?.value ?? 0)), MAX_KB_H);
    return kh > 0 ? kh : 0;
  });

  const bottomInset = Math.max(insets.bottom, 0);
  const isIOS = Platform.OS === 'ios';

  const effectiveExtraH = useDerivedValue(() => {
    const raw = extraAreaH.value;
    if (!isIOS) return raw;
    return Math.max(0, raw - bottomInset);
  });

  const panelOpacity = useDerivedValue(() => {
    const kh = Math.max(0, Math.abs(kbH?.value ?? 0));
    const target = panelOpenSV.value === 1 && kh === 0 ? 1 : 0;
    return withTiming(target, { duration: 180 });
  });

  const panelTranslateY = useDerivedValue(() => {
    const kh = Math.max(0, Math.abs(kbH?.value ?? 0));
    const shown = panelOpenSV.value === 1 && kh === 0;
    return withTiming(shown ? 0 : 14, { duration: 180 });
  });

  const rootPadBottom = useDerivedValue(() => (effectiveExtraH.value > 0 ? 0 : bottomInset));

  const extraAreaStyle = useAnimatedStyle(() => ({ height: effectiveExtraH.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
    transform: [{ translateY: panelTranslateY.value }],
  }));
  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: rootPadBottom.value }));

  const rootBg = theme.inputBg;
  const rowBg = theme.inputBg;
  const pillBg = theme.inputFieldBg;
  const textColor = theme.opponentText;
  const placeholderColor = 'rgba(0,0,0,0.35)';

  const attachmentIconColor = theme.accessoryIcon;
  const voiceIconColor = '#ffffff';
  const voiceBg = theme.voiceButton;
  const sendBg = theme.sendButtonActive;
  const panelBg = theme.inputBg;

  const replyToForPreview = useMemo<ReplyInfo | null>(() => {
    if (!replyTo) return null;

    const o = String((replyTo as any)?.contentOriginal ?? (replyTo as any)?.content ?? '').trim();
    const t = String((replyTo as any)?.contentTranslated ?? '').trim();

    const nextContent = showTranslatedOnly && t ? t : o;
    return { ...(replyTo as any), content: nextContent } as ReplyInfo;
  }, [replyTo, showTranslatedOnly]);

  const allAttachments = useMemo(
    () => [
      { key: 'album', label: '앨범', onPress: handlePressAlbum, icon: <ImageIcon size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'camera', label: '카메라', onPress: handlePressCamera, icon: <Camera size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'reserve', label: '예약', onPress: handlePressReserved, icon: <Clock size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'map', label: '지도', onPress: handlePressMap, icon: <MapPin size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'contact', label: '연락처', onPress: handlePressContact, icon: <Phone size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'voice', label: '음성', onPress: handlePressVoice, icon: <Mic size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'file', label: '파일', onPress: handlePressFile, icon: <FileText size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'translate', label: '번역', onPress: handlePressTranslate, icon: <Languages size={22} color={attachmentIconColor} strokeWidth={2.2} /> },

      { key: 'emoji', label: '이모지', onPress: handlePressEmoji, icon: <Smile size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'friend', label: '친구추가', onPress: handlePressFriend, icon: <UserPlus size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'money', label: '송금', onPress: handlePressMoney, icon: <WalletCards size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'sticker', label: '스티커', onPress: handlePressSticker, icon: <Sticker size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'music', label: '음악', onPress: handlePressMusic, icon: <Music size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
      { key: 'video', label: '동영상', onPress: handlePressVideo, icon: <Video size={22} color={attachmentIconColor} strokeWidth={2.2} /> },
    ],
    [
      handlePressAlbum,
      handlePressCamera,
      handlePressReserved,
      handlePressMap,
      handlePressContact,
      handlePressVoice,
      handlePressFile,
      handlePressTranslate,
      handlePressEmoji,
      handlePressFriend,
      handlePressMoney,
      handlePressSticker,
      handlePressMusic,
      handlePressVideo,
      attachmentIconColor,
    ],
  );

  const pages = useMemo(() => {
    const per = Math.max(1, itemsPerPage);
    const out: typeof allAttachments[] = [];
    for (let i = 0; i < allAttachments.length; i += per) out.push(allAttachments.slice(i, i + per));
    return out;
  }, [allAttachments, itemsPerPage]);

  React.useEffect(() => {
    setPageIndex((p) => {
      const next = Math.max(0, Math.min(p, pages.length - 1));
      if (next !== p) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ x: next * SCREEN_W, y: 0, animated: false });
        });
      }
      return next;
    });
  }, [pages.length, SCREEN_W]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / SCREEN_W);
      setPageIndex(Math.max(0, Math.min(pages.length - 1, idx)));
    },
    [SCREEN_W, pages.length],
  );

  const goToPage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, idx));
      setPageIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * SCREEN_W, y: 0, animated: true });
    },
    [SCREEN_W, pages.length],
  );

  return (
    <Animated.View style={[styles.root, { backgroundColor: rootBg }, rootStyle]}>
      <InputReplyPreview replyTo={replyToForPreview} onCancel={cancelReply} theme={theme} />

      <View style={[styles.inputRow, { backgroundColor: rowBg }]}>
        <PlusXButton isOpen={attachmentsOpen} onPress={onPressPlusOrClose} theme={theme} />

        <View style={[styles.inputPill, { backgroundColor: pillBg }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: textColor }]}
            value={text}
            onChangeText={setText}
            placeholder="메시지 입력…"
            placeholderTextColor={placeholderColor}
            multiline
            returnKeyType="send"
            onFocus={onFocusInput}
            onSubmitEditing={() => {
              if (showSend) onSend();
            }}
          />
        </View>

        {showSend ? (
          <Pressable style={[styles.roundBtnSolid, { backgroundColor: sendBg }]} onPress={onSend}>
            <SendIcon size={18} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable style={[styles.roundBtnSolid, { backgroundColor: voiceBg }]} onPress={handlePressVoice}>
            <Mic size={18} color={voiceIconColor} strokeWidth={2.6} />
          </Pressable>
        )}
      </View>

      <Animated.View style={[styles.extraArea, extraAreaStyle]} pointerEvents="none" />

      <Animated.View
        style={[
          styles.attachPanel,
          styles.attachPanelAbs,
          { backgroundColor: panelBg, borderTopColor: 'rgba(229, 231, 235, 0.9)' },
          panelStyle,
          extraAreaStyle,
        ]}
        pointerEvents={attachmentsOpen ? 'auto' : 'none'}
      >
        <ScrollView
          ref={scrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          scrollEventThrottle={16}
          contentContainerStyle={{ width: SCREEN_W * pages.length }}
        >
          {pages.map((items, pi) => (
            <View
              key={`p-${pi}`}
              style={[
                styles.page,
                {
                  width: SCREEN_W,
                  paddingHorizontal: GRID_PADDING_H,
                  rowGap: 12,
                  columnGap: GRID_GAP,
                  justifyContent: 'flex-start',
                },
              ]}
            >
              {items.map((it) => (
                <AttachmentItem
                  key={it.key}
                  itemW={itemW}
                  label={it.label}
                  onPress={it.onPress}
                  icon={it.icon}
                  theme={theme}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {pages.length > 1 && (
          <View style={styles.dotsRow}>
            {Array.from({ length: pages.length }).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => goToPage(i)}
                hitSlop={10}
                style={[
                  styles.dot,
                  { backgroundColor: 'rgba(17, 24, 39, 0.18)' },
                  i === pageIndex && { backgroundColor: 'rgba(17, 24, 39, 0.55)' },
                ]}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },

  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.5)',
  },

  roundBtnSolid: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.5)',
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 12,
    minHeight: 44,
  },

  input: {
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontSize: 16,
  },

  extraArea: { backgroundColor: 'transparent' },

  attachPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  attachPanelAbs: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
  },

  attachItem: {
    alignItems: 'center',
    marginBottom: 12,
  },

  attachIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  attachLabel: { fontSize: 11 },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 2,
    paddingBottom: 6,
  },

  dot: { width: 6, height: 6, borderRadius: 3 },
});
