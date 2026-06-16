import React, { type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeScrollScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children?: ReactNode;

  /**
   * Screen background color.
   * Prefer passing the value from the screen-level theme.
   */
  backgroundColor?: string;

  /**
   * Default false to avoid breaking existing Header / StatusBar layouts.
   */
  includeTopInset?: boolean;

  /**
   * Protects content from Android navigation bar / iOS home indicator.
   */
  includeBottomInset?: boolean;

  extraTopPadding?: number;
  extraBottomPadding?: number;
  minBottomPadding?: number;

  /**
   * Makes content fill the viewport when content is shorter than the screen.
   */
  fill?: boolean;

  /**
   * Do not put paddingTop / paddingBottom here.
   * Use extraTopPadding / extraBottomPadding instead, so safe-area padding stays
   * authoritative.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
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
 * SafeScrollScreen
 *
 * Use for long non-chat screens.
 *
 * Good for:
 * - legal
 * - privacy policy
 * - settings detail
 * - profile detail
 * - report/help pages
 *
 * Avoid for:
 * - input-heavy forms -> use SafeKeyboardScreen
 * - Chat.tsx -> handle separately
 */
export default function SafeScrollScreen({
  children,
  backgroundColor = '#FFFFFF',
  includeTopInset = false,
  includeBottomInset = true,
  extraTopPadding = 0,
  extraBottomPadding = 24,
  minBottomPadding = 24,
  fill = true,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  showsVerticalScrollIndicator = false,
  ...rest
}: SafeScrollScreenProps) {
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
    <ScrollView
      {...rest}
      style={[
        styles.root,
        { backgroundColor },
        style,
      ]}
      contentContainerStyle={[
        fill ? styles.fillContent : null,
        contentContainerStyle,
        {
          paddingTop,
          paddingBottom,
        },
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fillContent: {
    flexGrow: 1,
  },
});
