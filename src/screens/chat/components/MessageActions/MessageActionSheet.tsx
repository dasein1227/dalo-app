import React, { useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

export type MessageActionKey =
  | 'copy'
  | 'select_copy'
  | 'reply'
  | 'share'
  | 'to_me'
  | 'notice'
  | 'highlight'
  | 'capture'
  | 'delete'
  | 'cancel_moment';

export type MessageActionItem = {
  key: MessageActionKey;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
};

export type ReactionItem = {
  key: string;
  emoji: string;
};

type Props<TMessage> = {
  visible: boolean;
  onClose: () => void;

  // ✅ theme 필수
  meId?: string | null;
  theme: ChatTheme;

  // 롱프레스된 메시지(원하는 타입 그대로)
  message: TMessage | null;

  // 액션 클릭 콜백
  onAction: (key: MessageActionKey, message: TMessage) => void;

  // 리액션 클릭 콜백(옵션)
  onReact?: (emoji: string, message: TMessage) => void;

  // 액션/리액션 커스터마이즈(옵션)
  actions?: MessageActionItem[];
  reactions?: ReactionItem[];

  // UI 옵션
  titleText?: string;
  maxSheetHeight?: number; // 기본 520
};

// ✅ 사용자 확정 리액션: ❤️👍✔️😆😮😭 (총 6개 고정)
const DEFAULT_REACTIONS: ReactionItem[] = [
  { key: 'heart', emoji: '❤️' },
  { key: 'like', emoji: '👍' },
  { key: 'check', emoji: '✔️' },
  { key: 'lol', emoji: '😆' },
  { key: 'wow', emoji: '😮' },
  { key: 'sad', emoji: '😭' },
];

const DEFAULT_ACTIONS: MessageActionItem[] = [
  { key: 'copy', label: '복사' },
  { key: 'select_copy', label: '선택 복사' },
  { key: 'reply', label: '답장' },
  { key: 'share', label: '공유' },
  { key: 'to_me', label: '나에게' },
  { key: 'notice', label: '공지' },
  { key: 'highlight', label: '책갈피 설정' },
  { key: 'capture', label: '캡처' },
  { key: 'delete', label: '삭제', destructive: true },
];

function withAlpha(hexOrRgba: string, alpha: number) {
  if (!hexOrRgba) return hexOrRgba;
  // hex(#RRGGBB)만 처리. rgba/기타는 그대로 반환.
  if (!hexOrRgba.startsWith('#')) return hexOrRgba;
  const h = hexOrRgba.replace('#', '');
  if (h.length !== 6) return hexOrRgba;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseToMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export default function MessageActionSheet<TMessage>({
  visible,
  onClose,
  theme,
  meId,
  message,
  onAction,
  onReact,
  actions,
  reactions,
  titleText,
  maxSheetHeight = 520,
}: Props<TMessage>) {
  const insets = useSafeAreaInsets();

  const sheetTranslateY = useRef(new Animated.Value(999)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const actionItems = useMemo(() => {
    const base = actions ?? DEFAULT_ACTIONS;

    const msg: any = message as any;
    const id = msg?.id;
    const sender = msg?.senderId ?? msg?.sender_id ?? msg?.sender;
    const del = msg?.delete_at ?? msg?.deleteAt ?? null;

    const delMs = parseToMs(del);

    const canCancelMoment =
      !!meId &&
      !!sender &&
      String(sender) === String(meId) &&
      !!delMs &&
      delMs > Date.now() &&
      !!id &&
      !String(id).startsWith('local_');

    if (!canCancelMoment) return base;

    // ✅ "삭제 설정 취소"는 삭제 메뉴 바로 위에
    const out = [...base];
    const idx = out.findIndex((a) => a.key === 'delete');
    const item: MessageActionItem = { key: 'cancel_moment', label: '삭제 설정 취소' };

    if (idx >= 0) out.splice(idx, 0, item);
    else out.push(item);

    return out;
  }, [actions, message, meId]);

  // ✅ 6개 딱 고정: 커스텀 reactions가 들어와도 최대 6개만 사용
  const reactionItems = useMemo(() => {
    const base = reactions ?? DEFAULT_REACTIONS;
    return base.slice(0, 6);
  }, [reactions]);

  const canInteract = visible && !!message;

  // ✅ 테마 기반 색상 매핑(필드가 없을 수도 있으니 안전 fallback)
  const sheetBg = (theme as any).headerBg ?? '#FFF';
  const chipBg = (theme as any).inputFieldBg ?? 'rgba(0,0,0,0.06)';
  const baseText = (theme as any).headerText ?? '#111';
  const subtleText = withAlpha(baseText, 0.6);
  const pressedBg = (theme as any).highlightLine ?? withAlpha(baseText, 0.12);
  const divider = withAlpha(((theme as any).dateTimeLine ?? baseText) as string, 0.22);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 999,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, sheetTranslateY]);

  const handleActionPress = (key: MessageActionKey) => {
    if (!message) return;
    onAction(key, message);
    onClose();
  };

  const handleReactPress = (emoji: string) => {
    if (!message) return;
    onReact?.(emoji, message);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.35],
            }),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 10),
              transform: [{ translateY: sheetTranslateY }],
              maxHeight: maxSheetHeight + Math.max(insets.bottom, 10),
            },
          ]}
        >
          {/* Top bar: reactions only (✅ 아래쪽 방향 버튼 제거) */}
          <View style={[styles.topRow, { borderBottomColor: divider }]}>
            <View style={styles.reactionRow}>
              {reactionItems.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => {
                    if (!canInteract) return;
                    handleReactPress(r.emoji);
                  }}
                  style={({ pressed }) => [
                    styles.reactionBtn,
                    { backgroundColor: chipBg },
                    pressed && { opacity: 0.78 },
                    !canInteract && styles.disabled,
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {titleText ? (
            <Text style={[styles.titleText, { color: subtleText }]} numberOfLines={1}>
              {titleText}
            </Text>
          ) : null}

          {/* Actions */}
          <View style={styles.actionsBox}>
            {actionItems.map((a) => {
              const isDisabled = !!a.disabled || !canInteract;
              const isDestructive = !!a.destructive;

              return (
                <Pressable
                  key={a.key}
                  onPress={() => !isDisabled && handleActionPress(a.key)}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && { backgroundColor: pressedBg },
                    isDisabled && styles.disabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      { color: baseText },
                      isDestructive && { color: '#D11A2A' }, // 삭제는 고정(명확성)
                      isDisabled && { color: withAlpha(baseText, 0.45) },
                    ]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // 카톡처럼 "중앙에 뜨는" 느낌 유지
  // 하단 고정으로 바꾸려면 justifyContent: 'flex-end' 로 변경
  sheetWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  sheet: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 10,
      },
    }),
  },

  topRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // ✅ 6개 딱 한 줄: ScrollView 제거 + space-between (gap 사용 안함)
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  reactionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  reactionEmoji: {
    fontSize: 18,
  },

  titleText: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    fontSize: 12,
  },

  actionsBox: {
    paddingVertical: 10,
  },

  actionRow: {
    paddingHorizontal: 18,
    paddingVertical: 13,
  },

  actionText: {
    fontSize: 16,
  },

  disabled: {
    opacity: 0.55,
  },
});
