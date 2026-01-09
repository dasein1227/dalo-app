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

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

/* =======================
   Types
======================= */

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

type ReactionKey = 'heart' | 'like' | 'check' | 'haha' | 'wow' | 'sad';

/* =======================
   Const
======================= */

const REACTIONS: Array<{ key: ReactionKey; label: string }> = [
  { key: 'heart', label: '❤️' },
  { key: 'like', label: '👍' },
  { key: 'check', label: '✅' },
  { key: 'haha', label: '😄' },
  { key: 'wow', label: '😮' },
  { key: 'sad', label: '😢' },
];

// open / close
export const CHAT_OPEN_MSG_ACTIONS = 'chat:openMessageActions';
export const CHAT_CLOSE_MSG_ACTIONS = 'chat:closeMessageActions';

// requests
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

export default function MessageActionsOverlay() {
  const [visible, setVisible] = useState(false);
  const [payloadSnap, setPayloadSnap] = useState<OpenPayload | null>(null);
  const payloadRef = useRef<OpenPayload | null>(null);

  // animation
  const dim = useSharedValue(0);
  const sheetY = useSharedValue(40);

  /* ---------- open / close ---------- */

  const close = useCallback(() => {
    dim.value = withTiming(0, { duration: 120 });
    sheetY.value = withTiming(40, { duration: 120 }, () => {
      runOnJS(setVisible)(false);
      payloadRef.current = null;
      runOnJS(setPayloadSnap)(null);
    });
  }, [dim, sheetY]);

  const open = useCallback(
    (p: OpenPayload) => {
      payloadRef.current = p;
      setPayloadSnap(p);
      setVisible(true);

      dim.value = withTiming(1, { duration: 120 });
      sheetY.value = withSpring(0, { stiffness: 420, damping: 32, mass: 0.9 });
    },
    [dim, sheetY],
  );

  /* ---------- events ---------- */

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
        mediaUris: Array.isArray(p?.mediaUris)
          ? p.mediaUris.map((x: any) => safeStr(x)).filter(Boolean)
          : [],
      });
    });

    const subClose = DeviceEventEmitter.addListener(CHAT_CLOSE_MSG_ACTIONS, close);

    return () => {
      subOpen.remove();
      subClose.remove();
    };
  }, [open, close]);

  // android back
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  /* ---------- render guard (CRITICAL) ---------- */

  if (!visible || !payloadSnap) return null;

  /* ---------- safe access AFTER guard ---------- */

  const p = payloadSnap;
  const kind = p.kind ?? 'text';

  /* ---------- handlers ---------- */

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

  /* ---------- styles ---------- */

  const dimStyle = useAnimatedStyle(() => ({
    opacity: dim.value * 0.55,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  /* =======================
     Render
  ======================= */

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View style={[styles.dim, dimStyle]} />
        </Pressable>

        {/* reactions */}
        <View style={styles.reactionRowWrap}>
          <View style={styles.reactionRow}>
            {REACTIONS.map((r) => (
              <Pressable key={r.key} style={styles.reactionBtn} onPress={() => emitAndClose(CHAT_REQ_REACT, { msgId: p.msgId, emoji: r.key })}>
                <Text style={styles.reactionEmoji}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* sheet */}
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{p.senderName ?? '메시지'}</Text>
            <Text style={styles.sheetSub}>
              {kind === 'image' ? '사진' : kind === 'video' ? '동영상' : kind === 'audio' ? '음성 메시지' : '텍스트'}
            </Text>
          </View>

          <View style={styles.divider} />

          <Pressable style={styles.item} onPress={() => emitAndClose(CHAT_REQ_REPLY, { msgId: p.msgId })}>
            <Text style={styles.itemText}>답장</Text>
          </Pressable>

          <Pressable style={styles.item} onPress={handleCopy}>
            <Text style={styles.itemText}>복사</Text>
          </Pressable>

          <Pressable style={styles.item} onPress={() => emitAndClose(CHAT_REQ_TOGGLE_ORIGINAL, { msgId: p.msgId })}>
            <Text style={styles.itemText}>원문 / 번역</Text>
          </Pressable>

          <Pressable style={styles.item} onPress={() => emitAndClose(CHAT_REQ_TRANSLATE, { msgId: p.msgId })}>
            <Text style={styles.itemText}>번역</Text>
          </Pressable>

          <Pressable style={styles.item} onPress={() => emitAndClose(CHAT_REQ_OPEN_REACTORS, { msgId: p.msgId })}>
            <Text style={styles.itemText}>공감한 친구</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.item} onPress={() => emitAndClose(CHAT_REQ_DELETE, { msgId: p.msgId })}>
            <Text style={[styles.itemText, styles.dangerText]}>삭제</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* =======================
   Styles
======================= */

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { flex: 1, backgroundColor: '#000' },

  reactionRowWrap: {
    position: 'absolute',
    top: Platform.select({ ios: 90, android: 80 }),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  reactionRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 6,
  },
  reactionBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 22 },

  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
  },
  sheetHeader: { padding: 16 },
  sheetTitle: { fontSize: 14, fontWeight: '800' },
  sheetSub: { marginTop: 4, fontSize: 12, color: '#6b7280' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e7eb' },

  item: { paddingHorizontal: 16, paddingVertical: 14 },
  itemText: { fontSize: 15, fontWeight: '700' },
  dangerText: { color: '#ef4444' },
});
