// src/components/GlobalHeader.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';
import { createGlobalHeaderTheme } from './GlobalHeader.theme';

export const HEADER_SPECS = {
  HEIGHT: 52,
  TITLE_SIZE: 22,
  TITLE_WEIGHT: '700' as const,
  ICON_SIZE: 22,
  ICON_STROKE: 2.0,
  ICON_GAP: 4,
  BTN_PADDING: 6,
};

interface GlobalHeaderProps {
  title?: string;
  titleComponent?: React.ReactNode;
  rightIcons?: React.ReactNode;
  style?: ViewStyle;
}

export function GlobalHeader({ title, titleComponent, rightIcons, style }: GlobalHeaderProps) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const headerTheme = createGlobalHeaderTheme(appTheme);

  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: headerTheme.background,
          borderBottomColor: headerTheme.border,
          paddingTop: Math.max(insets.top, 0) + 4,
        },
        style,
      ]}
    >
      <View style={s.row}>
        <View style={s.left}>
          {titleComponent ? titleComponent : <Text style={[s.title, { color: headerTheme.text }]}>{title}</Text>}
        </View>
        <View style={s.right}>{rightIcons}</View>
      </View>
    </View>
  );
}

export function HeaderIconButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={s.iconBtn} onPress={onPress} hitSlop={4}>
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 0,
  },
  row: {
    height: HEADER_SPECS.HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: HEADER_SPECS.TITLE_SIZE,
    fontWeight: HEADER_SPECS.TITLE_WEIGHT,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_SPECS.ICON_GAP,
  },
  iconBtn: {
    padding: HEADER_SPECS.BTN_PADDING,
    marginLeft: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
