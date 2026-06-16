import React, { type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeScreenProps = Omit<ViewProps, 'style'> & {
  children?: ReactNode;

  /**
   * Screen background color.
   * Prefer passing the value from the screen-level theme.
   */
  backgroundColor?: string;

  /**
   * Default false to avoid breaking existing Header / StatusBar layouts.
   * Use true only for fullscreen/modal screens that own the status-bar area.
   */
  includeTopInset?: boolean;

  /**
   * Protects content from Android navigation bar / iOS home indicator.
   */
  includeBottomInset?: boolean;

  /**
   * Added after the top safe-area inset when includeTopInset is true.
   * Used as normal top padding when includeTopInset is false.
   */
  extraTopPadding?: number;

  /**
   * Added after the bottom safe-area inset when includeBottomInset is true.
   * Used as normal bottom padding when includeBottomInset is false.
   */
  extraBottomPadding?: number;

  /**
   * Ensures a minimum bottom breathing room even when device inset is 0.
   */
  minBottomPadding?: number;

  /**
   * Root container style. Do not put paddingBottom here.
   * Use contentStyle / extraBottomPadding instead, so the safe inset cannot be
   * accidentally overridden.
   */
  style?: StyleProp<ViewStyle>;

  /**
   * Inner content style. Do not put paddingBottom here.
   * Use extraBottomPadding instead.
   */
  contentStyle?: StyleProp<ViewStyle>;
};

function getInsetPadding(params: {
  inset: number;
  includeInset: boolean;
  extraPadding: number;
  minPadding: number;
}) {
  const { inset, includeInset, extraPadding, minPadding } = params;
  const value = includeInset ? inset + extraPadding : extraPadding;

  return Math.max(value, minPadding);
}

/**
 * SafeScreen
 *
 * Use for non-scroll, non-keyboard screens.
 *
 * Good for:
 * - settings home
 * - simple list wrapper screens
 * - static pages with custom internal layout
 *
 * Avoid for:
 * - long legal/help pages -> use SafeScrollScreen
 * - input-heavy forms -> use SafeKeyboardScreen
 * - Chat.tsx -> handle separately
 */
export default function SafeScreen({
  children,
  backgroundColor = '#FFFFFF',
  includeTopInset = false,
  includeBottomInset = true,
  extraTopPadding = 0,
  extraBottomPadding = 0,
  minBottomPadding = 0,
  style,
  contentStyle,
  ...rest
}: SafeScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingTop = getInsetPadding({
    inset: insets.top,
    includeInset: includeTopInset,
    extraPadding: extraTopPadding,
    minPadding: 0,
  });

  const paddingBottom = getInsetPadding({
    inset: insets.bottom,
    includeInset: includeBottomInset,
    extraPadding: extraBottomPadding,
    minPadding: minBottomPadding,
  });

  return (
    <View
      {...rest}
      style={[
        styles.root,
        { backgroundColor },
        style,
      ]}
    >
      <View
        style={[
          styles.content,
          contentStyle,
          {
            paddingTop,
            paddingBottom,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
