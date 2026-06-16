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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import ReactionIcon from '../../reactions/ReactionIcon';

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
  onReact?: (reactionKey: string, message: TMessage) => void;

  // 액션/리액션 커스터마이즈(옵션)
  actions?: MessageActionItem[];
  reactions?: ReactionItem[];

  // UI 옵션
  titleText?: string;
  maxSheetHeight?: number; // 기본 520

  // 공지 등록 권한/노출 제어.
  // ActionModals에서 넘기고, false면 notice 액션을 숨긴다.
  canShowNoticeAction?: boolean;
};

// ✅ 사용자 확정 리액션: heart / like / check / laugh / surprise / sad (총 6개 고정)
const DEFAULT_REACTIONS: ReactionItem[] = [
  { key: 'heart', emoji: '❤' },
  { key: 'like', emoji: '👍' },
  { key: 'check', emoji: '✓' },
  { key: 'laugh', emoji: '😊' },
  { key: 'surprise', emoji: '😮' },
  { key: 'sad', emoji: '😢' },
];

const DEFAULT_ACTIONS: MessageActionItem[] = [
  { key: 'copy', label: '' },
  { key: 'select_copy', label: '' },
  { key: 'reply', label: '' },
  { key: 'share', label: '' },
  { key: 'to_me', label: '' },
  { key: 'notice', label: '' },
  { key: 'highlight', label: '' },
  { key: 'capture', label: '' },
  { key: 'delete', label: '', destructive: true },
];


function parseJsonObject(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
}

function mergedMessageMeta(msg: any): Record<string, any> {
  const raw = msg?._raw ?? {};
  return {
    ...(parseJsonObject(raw?.metadata) ?? {}),
    ...(parseJsonObject(raw?.meta) ?? {}),
    ...(parseJsonObject(msg?.metadata) ?? {}),
    ...(parseJsonObject(msg?.meta) ?? {}),
  };
}

function canPromoteMessageToNotice(message: any): boolean {
  if (!message) return false;

  const raw = message?._raw ?? {};
  const id = String(message?.id ?? raw?.id ?? '').trim();
  const messageUid = String(
    message?.message_uid ?? message?.messageUid ?? raw?.message_uid ?? raw?.messageUid ?? '',
  ).trim();
  if (!id || id.startsWith('local_') || id.startsWith('opt_')) return false;
  if (!messageUid) return false;

  const kind = String(message?.kind ?? raw?.kind ?? '').trim().toLowerCase();
  if (!['text', 'image', 'video', 'audio', 'file', 'map'].includes(kind)) return false;

  const deletedForAll = message?.deleted_for_all_at ?? message?.deletedForAllAt ?? raw?.deleted_for_all_at ?? null;
  const deleteAt = message?.delete_at ?? message?.deleteAt ?? raw?.delete_at ?? null;
  if (deletedForAll != null || deleteAt != null) return false;

  const isSecure = message?.is_secure ?? message?.isSecure ?? raw?.is_secure ?? raw?.isSecure;
  if (isSecure === true) return false;

  const meta = mergedMessageMeta(message);
  if (meta?.system === true || meta?.secure_system === true) return false;

  const systemType = String(
    meta?.secure_system_type ?? meta?.secureSystemType ?? meta?.system_type ?? meta?.systemType ?? '',
  ).toLowerCase();
  if (
    systemType.startsWith('secure_peer_recovery_') ||
    systemType === 'secure_system' ||
    systemType === 'secure_recovery' ||
    systemType === 'system_private'
  ) {
    return false;
  }

  return true;
}

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
  canShowNoticeAction,
}: Props<TMessage>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  const sheetTranslateY = useRef(new Animated.Value(999)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const actionLabels = useMemo<Record<MessageActionKey, string>>(
    () => ({
      copy: t('chat:messageAction.copy'),
      select_copy: t('chat:messageAction.selectCopy'),
      reply: t('chat:messageAction.reply'),
      share: t('chat:messageAction.share'),
      to_me: t('chat:messageAction.shareToMe'),
      notice: t('chat:messageAction.notice'),
      highlight: t('chat:messageAction.highlight'),
      capture: t('chat:messageAction.capture'),
      delete: t('chat:messageAction.delete'),
      cancel_moment: t('chat:messageAction.cancelMoment'),
    }),
    [t],
  );

  const actionItems = useMemo(() => {
    const base = actions ?? DEFAULT_ACTIONS;

    const msg: any = message as any;
    const canPromoteNotice = canPromoteMessageToNotice(msg);
    let filteredBase = base.filter((item) => String((item as any).key) !== 'schedule_detail');
    if (!canPromoteNotice || canShowNoticeAction === false) {
      filteredBase = filteredBase.filter((item) => item.key !== 'notice');
    }

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

    if (!canCancelMoment) return filteredBase;

    // ✅ "삭제 설정 취소"는 삭제 메뉴 바로 위에
    const out = [...filteredBase];
    const idx = out.findIndex((a) => a.key === 'delete');
    const item: MessageActionItem = { key: 'cancel_moment', label: '' };

    if (idx >= 0) out.splice(idx, 0, item);
    else out.push(item);

    return out;
  }, [actions, canShowNoticeAction, message, meId]);

  // ✅ 6개 딱 고정: 커스텀 reactions가 들어와도 최대 6개만 사용
  const reactionItems = useMemo(() => {
    const base = reactions ?? DEFAULT_REACTIONS;
    return base.slice(0, 6);
  }, [reactions]);

  const canInteract = visible && !!message;
  const isBookmarked = !!(message as any)?.__bookmarked;
  const safeSheetMaxHeight = Math.min(
    maxSheetHeight + Math.max(insets.bottom, 10),
    Math.max(320, windowHeight - insets.top - insets.bottom - 48),
  );

  // 대부분의 메시지 액션은 한 화면에 모두 보여야 한다.
  // 작은 화면/액션 과다 케이스에서만 ScrollView로 fallback 한다.
  const estimatedActionHeight = actionItems.length * 43 + 12;
  const actionsMaxHeight = Math.max(156, safeSheetMaxHeight - 62 - (titleText ? 26 : 0));
  const shouldScrollActions = estimatedActionHeight > actionsMaxHeight;

  // ✅ 테마 기반 색상 매핑(필드가 없을 수도 있으니 안전 fallback)
  const sheetBg = (theme as any).headerBg ?? '#FFF';
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
    const currentMessage = message;

    // 캡처는 모달이 열린 동안의 interaction lock에 막히면 안 된다.
    // 먼저 롱프레스 메뉴를 닫고, 다음 프레임에서 Chat의 capture controller로 넘긴다.
    if (key === 'capture') {
      onClose();
      requestAnimationFrame(() => onAction(key, currentMessage));
      return;
    }

    onAction(key, currentMessage);
    onClose();
  };

  const handleReactPress = (reactionKey: string) => {
    if (!message) return;
    onReact?.(reactionKey, message);
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
              maxHeight: safeSheetMaxHeight,
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
                    handleReactPress(r.key);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.reactionBtn,
                    pressed && { opacity: 0.58, transform: [{ scale: 0.96 }] },
                    !canInteract && styles.disabled,
                  ]}
                >
                  <ReactionIcon reactionKey={r.key} size={28} theme={theme} />
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
          {shouldScrollActions ? (
            <ScrollView
              style={[styles.actionsScroll, { maxHeight: actionsMaxHeight }]}
              contentContainerStyle={styles.actionsBox}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
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
                      {a.key === 'highlight'
                        ? isBookmarked
                          ? t('chat:messageAction.unhighlight')
                          : t('chat:messageAction.highlight')
                        : actionLabels[a.key] ?? a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
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
                      {a.key === 'highlight'
                        ? isBookmarked
                          ? t('chat:messageAction.unhighlight')
                          : t('chat:messageAction.highlight')
                        : actionLabels[a.key] ?? a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
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
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleText: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    fontSize: 12,
  },

  actionsScroll: {
    flexGrow: 0,
  },

  actionsBox: {
    paddingVertical: 6,
  },

  actionRow: {
    minHeight: 43,
    paddingHorizontal: 18,
    paddingVertical: 9,
    justifyContent: 'center',
  },

  actionText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
  },

  disabled: {
    opacity: 0.55,
  },
});
