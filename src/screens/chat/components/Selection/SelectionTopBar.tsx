// src/screens/chat/components/Selection/SelectionTopBar.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  theme: ChatTheme;
  insetsTop: number;
  count: number;
  onExit: () => void;
  onSelectAll?: () => void;
};

const HEADER_HEIGHT = 54;

export default function SelectionTopBar({ theme, insetsTop, count, onExit, onSelectAll }: Props) {
  const { t } = useTranslation();

  const iconColor = theme.opponentText;
  const titleColor = theme.opponentText;
  const divider = 'rgba(0,0,0,0.08)';

  return (
    <View style={[styles.wrap, { backgroundColor: theme.headerBg, paddingTop: Math.max(0, insetsTop) }]}>
      <View
        style={[
          styles.bar,
          {
            height: HEADER_HEIGHT,
            backgroundColor: theme.headerBg,
            borderBottomColor: divider,
          },
        ]}
      >
        <Pressable onPress={onExit} style={styles.headerBtn} hitSlop={8}>
          <ChevronLeft size={22} color={iconColor} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
              {t('chat:selection.title')}
            </Text>
            <Text style={[styles.count, { color: titleColor }]}>{count}</Text>
          </View>
        </View>

        <Pressable
          onPress={onSelectAll}
          style={[styles.rightBtn, { opacity: onSelectAll ? 1 : 0 }]}
          disabled={!onSelectAll}
          hitSlop={8}
        >
          <Text style={[styles.rightText, { color: titleColor }]} numberOfLines={1}>
            {t('chat:selection.selectAll')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  bar: {
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: '800',
    includeFontPadding: false,
  },
  count: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.65,
    flexShrink: 0,
    includeFontPadding: false,
  },
  rightBtn: {
    minWidth: 64,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightText: {
    fontSize: 13,
    fontWeight: '800',
    includeFontPadding: false,
    opacity: 0.9,
  },
});
