// src/screens/chat/components/MessageActions/MomentQuickMenu.tsx
import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type AnchorRect = { x: number; y: number; w: number; h: number };

type Props = {
  // UX 설명(선택)
  policyText?: string;
  expiryText?: string;

  visible: boolean;
  theme: ChatTheme;
  anchor: AnchorRect | null;

  onClose: () => void;
  onCancelMoment: () => void;

  // optional: if false, menu still shows but cancel is disabled
  canCancel?: boolean;
};

function withAlpha(hexOrRgba: string, alpha: number) {
  if (!hexOrRgba?.startsWith('#')) return hexOrRgba;
  const h = hexOrRgba.replace('#', '');
  if (h.length !== 6) return hexOrRgba;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function MomentQuickMenu({
  visible,
  theme,
  anchor,
  onClose,
  onCancelMoment,
  canCancel = true,
  policyText,
  expiryText,
}: Props) {
  const { t } = useTranslation();
  const { width: W, height: H } = Dimensions.get('window');

  const pos = useMemo(() => {
    // 기본은 가운데
    if (!anchor) return { left: (W - 220) / 2, top: (H - 120) / 2 };

    const menuW = 220;
    const menuH = policyText || expiryText ? 132 : 98;

    // anchor 아래쪽에 뜨도록
    let left = anchor.x + anchor.w / 2 - menuW / 2;
    let top = anchor.y + anchor.h + 8;

    // 화면 밖으로 나가면 clamp
    const pad = 10;
    left = Math.max(pad, Math.min(W - menuW - pad, left));

    // 아래 공간이 부족하면 위로
    if (top + menuH + pad > H) {
      top = anchor.y - menuH - 8;
    }
    top = Math.max(pad, Math.min(H - menuH - pad, top));

    return { left, top };
  }, [anchor, W, H]);

  const cardBg = theme.headerBg;
  const border = withAlpha(theme.dateTimeLine, 0.18);
  const text = theme.headerText;
  const subtle = withAlpha(theme.headerText, 0.62);
  const pressedBg = theme.highlightLine;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.card,
            {
              left: pos.left,
              top: pos.top,
              backgroundColor: cardBg,
              borderColor: border,
            },
          ]}
        >
          <Text style={[styles.title, { color: subtle }]}>{t('chat:moment.title')}</Text>

          {!!policyText && (
            <Text style={[styles.sub, { color: subtle }]} numberOfLines={2}>
              {policyText}
            </Text>
          )}
          {!!expiryText && (
            <Text style={[styles.sub, { color: subtle }]} numberOfLines={2}>
              {expiryText}
            </Text>
          )}


          <Pressable
            disabled={!canCancel}
            onPress={() => {
              if (!canCancel) return;
              onCancelMoment();
              onClose();
            }}
            style={({ pressed }) => [
              styles.item,
              pressed && { backgroundColor: pressedBg },
              !canCancel && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.itemText, { color: text }]}>{t('chat:moment.cancel')}</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: pressedBg }]}
          >
            <Text style={[styles.itemText, { color: text }]}>{t('common:close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  card: {
    position: 'absolute',
    width: 220,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 12,
      },
    }),
  },
  sub: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  title: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '800',
    includeFontPadding: false,
  },
});
