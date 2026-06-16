import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  BackHandler,
  DeviceEventEmitter,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  withDelay,
} from 'react-native-reanimated';

import { type ChatTheme } from '../../theme/chatTheme'; 

/* =======================
   Types
======================= */

type ReactionKey = 'heart' | 'like' | 'check' | 'haha' | 'wow' | 'sad';

type OpenPayload = {
  msgId: string;
  roomId?: string | number;
  isMe?: boolean;
  kind?: string;
  senderName?: string | null;
  createdAt?: any;
  displayText?: string;
  originalText?: string | null;
  mediaUris?: string[];
};

/* =======================
   Constants
======================= */

const REACTIONS: Array<{ key: ReactionKey; label: string }> = [
  { key: 'heart', label: '❤️' },
  { key: 'like', label: '👍' },
  { key: 'check', label: '✅' },
  { key: 'haha', label: '😄' },
  { key: 'wow', label: '😮' },
  { key: 'sad', label: '😢' },
];

export const CHAT_OPEN_MSG_ACTIONS = 'chat:openMessageActions';
export const CHAT_CLOSE_MSG_ACTIONS = 'chat:closeMessageActions';

export const CHAT_REQ_REPLY = 'chat:reqReplyMessage';
export const CHAT_REQ_TOGGLE_ORIGINAL = 'chat:reqToggleOriginal';
export const CHAT_REQ_TRANSLATE = 'chat:reqTranslateMessage';
export const CHAT_REQ_DELETE = 'chat:reqDeleteMessage';
export const CHAT_REQ_REACT = 'chat:reqReactMessage';
export const CHAT_REQ_OPEN_REACTORS = 'chat:reqOpenReactors';

const safeStr = (v: any) => (v == null ? '' : String(v)).trim();

/* =======================
   Component
======================= */

type Props = {
  theme: ChatTheme;
};

export default function MessageActionsOverlay({ theme }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [payloadSnap, setPayloadSnap] = useState<OpenPayload | null>(null);
  const payloadRef = useRef<OpenPayload | null>(null);

  // Colors
  const BG_COLOR = theme.background || '#ffffff';
  const SHEET_BG = theme.inputBg || '#f2f2f7';
  const TEXT_COLOR = (theme as any).text || '#000000';

  // Animations
  const dim = useSharedValue(0);
  const sheetY = useSharedValue(100);
  const reactionScale = useSharedValue(0.5);

  const close = useCallback(() => {
    dim.value = withTiming(0, { duration: 150 });
    sheetY.value = withTiming(100, { duration: 150 });
    reactionScale.value = withTiming(0.5, { duration: 100 }, () => {
      runOnJS(setVisible)(false);
      payloadRef.current = null;
      runOnJS(setPayloadSnap)(null);
    });
  }, [dim, sheetY, reactionScale]);

  const open = useCallback(
    (p: OpenPayload) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      payloadRef.current = p;
      setPayloadSnap(p);
      setVisible(true);

      dim.value = withTiming(1, { duration: 200 });
      sheetY.value = withSpring(0, { damping: 15, stiffness: 150 });
      reactionScale.value = withDelay(50, withSpring(1, { damping: 12, stiffness: 200 }));
    },
    [dim, sheetY, reactionScale],
  );

  useEffect(() => {
    const subOpen = DeviceEventEmitter.addListener(CHAT_OPEN_MSG_ACTIONS, (p: any) => {
      const msgId = safeStr(p?.msgId);
      if (!msgId) return;
      open({
        msgId,
        roomId: p?.roomId,
        isMe: !!p?.isMe,
        kind: safeStr(p?.kind) || 'text',
        senderName: p?.senderName ?? null,
        createdAt: p?.createdAt,
        displayText: safeStr(p?.displayText),
        originalText: p?.originalText ?? null,
        mediaUris: Array.isArray(p?.mediaUris) ? p.mediaUris.map(safeStr).filter(Boolean) : [],
      });
    });
    const subClose = DeviceEventEmitter.addListener(CHAT_CLOSE_MSG_ACTIONS, close);
    return () => { subOpen.remove(); subClose.remove(); };
  }, [open, close]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [visible, close]);

  if (!visible || !payloadSnap) return null;

  const p = payloadSnap;

  const handleCopy = async () => {
    const t = safeStr(payloadRef.current?.displayText);
    if (!t) return;
    await Clipboard.setStringAsync(t);
    close();
  };

  const emitAndClose = (event: string, data: any) => {
    DeviceEventEmitter.emit(event, data);
    close();
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.4 }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const reactionStyle = useAnimatedStyle(() => ({ transform: [{ scale: reactionScale.value }] }));

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View style={[styles.dim, dimStyle]} />
        </Pressable>

        {/* Reaction Bar */}
        <Animated.View style={[styles.reactionRowWrap, reactionStyle]}>
          <View style={[styles.reactionRow, { backgroundColor: BG_COLOR }]}>
            {REACTIONS.map((r) => (
              <Pressable
                key={r.key}
                // ✅ [수정] android_ripple 추가 (초록색 방지)
                android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: true, radius: 22 }}
                style={({ pressed }) => [
                  styles.reactionBtn,
                  pressed && { backgroundColor: SHEET_BG, transform: [{ scale: 0.95 }] }
                ]}
                onPress={() => emitAndClose(CHAT_REQ_REACT, { msgId: p.msgId, emoji: r.key })}
              >
                <Text style={styles.reactionEmoji}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Action Sheet */}
        <Animated.View style={[styles.sheet, sheetStyle, { backgroundColor: SHEET_BG }]}>
          
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: TEXT_COLOR }]} numberOfLines={1}>
              {p.senderName || t('chat:unknown')}
            </Text>
            <Text style={styles.sheetSub}>
              {p.kind === 'image' ? t('chat:mediaKind.image') : p.kind === 'video' ? t('chat:mediaKind.video') : p.kind === 'audio' ? t('chat:mediaKind.audio') : t('chat:mediaKind.text')}
            </Text>
          </View>

          {/* Group 1 */}
          <View style={[styles.group, { backgroundColor: BG_COLOR }]}>
            <MenuItem label={t('chat:messageAction.reply')} icon="↩️" textColor={TEXT_COLOR} onPress={() => emitAndClose(CHAT_REQ_REPLY, { msgId: p.msgId })} />
            <MenuItem label={t('chat:messageAction.copy')} icon="📋" textColor={TEXT_COLOR} onPress={handleCopy} />
            <MenuItem label={t('chat:messageAction.share')} icon="📤" textColor={TEXT_COLOR} onPress={() => console.log('share')} />
          </View>

          <View style={styles.spacer} />

          {/* Group 2 */}
          <View style={[styles.group, { backgroundColor: BG_COLOR }]}>
            <MenuItem label={t('chat:messageAction.viewOriginalTranslation')} icon="🅰️" textColor={TEXT_COLOR} onPress={() => emitAndClose(CHAT_REQ_TOGGLE_ORIGINAL, { msgId: p.msgId })} />
            <MenuItem label={t('chat:messageAction.translateOther')} icon="🌐" textColor={TEXT_COLOR} onPress={() => emitAndClose(CHAT_REQ_TRANSLATE, { msgId: p.msgId })} />
            <MenuItem label={t('chat:messageAction.reactors')} icon="👀" textColor={TEXT_COLOR} onPress={() => emitAndClose(CHAT_REQ_OPEN_REACTORS, { msgId: p.msgId })} />
          </View>

          <View style={styles.spacer} />

          {/* Group 3 (Delete) */}
          <View style={[styles.group, { backgroundColor: BG_COLOR }]}>
            <MenuItem 
              label={t('chat:messageAction.delete')} 
              icon="🗑️" 
              isDestructive 
              textColor={TEXT_COLOR}
              onPress={() => emitAndClose(CHAT_REQ_DELETE, { msgId: p.msgId })} 
            />
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

// ✅ [수정] MenuItem에도 android_ripple 추가 (초록색 방지)
const MenuItem = ({ label, icon, onPress, isDestructive, textColor }: any) => (
  <Pressable 
    android_ripple={{ color: 'rgba(0,0,0,0.08)' }} 
    style={({ pressed }) => [
      styles.item, 
      pressed && { backgroundColor: 'rgba(0,0,0,0.05)' } 
    ]} 
    onPress={onPress}
  >
    <Text style={styles.itemIcon}>{icon}</Text>
    <Text style={[
      styles.itemText, 
      { color: isDestructive ? '#ff3b30' : textColor } 
    ]}>
      {label}
    </Text>
  </Pressable>
);

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { flex: 1, backgroundColor: '#000' },

  reactionRowWrap: {
    position: 'absolute',
    bottom: 420, 
    alignSelf: 'center',
    zIndex: 10,
    marginBottom: 20,
  },
  reactionRow: {
    flexDirection: 'row',
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    gap: 8,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    overflow: 'hidden', // ripple이 둥글게 잘리도록
  },
  reactionEmoji: { fontSize: 26 },

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.select({ ios: 40, android: 24 }),
    paddingTop: 12,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetSub: { fontSize: 13, color: '#8e8e93', marginTop: 2 },

  group: {
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  spacer: { height: 12 },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  itemIcon: {
    fontSize: 20,
    marginRight: 14,
    width: 24,
    textAlign: 'center',
  },
  itemText: {
    fontSize: 17,
    fontWeight: '500',
  },
});