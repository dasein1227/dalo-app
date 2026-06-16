import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeKeyboardScreenProps = Omit<ViewProps, 'style'> & {
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
   * iOS-only in most cases.
   * Use when a custom header is outside this screen and keyboard avoidance needs
   * to start below it.
   */
  keyboardVerticalOffset?: number;

  /**
   * Default:
   * - iOS: padding
   * - Android: undefined
   *
   * Android usually relies on windowSoftInputMode=adjustResize.
   * Forcing KeyboardAvoidingView behavior on Android often causes double
   * compensation, especially with bottom fixed buttons.
   */
  behavior?: KeyboardAvoidingViewProps['behavior'];

  /**
   * Allows a screen to disable KeyboardAvoidingView behavior without changing
   * the wrapper.
   */
  keyboardAvoidingEnabled?: boolean;

  /**
   * Use true when form content can be taller than the viewport.
   */
  scroll?: boolean;

  /**
   * Root container style.
   */
  style?: StyleProp<ViewStyle>;

  /**
   * Inner content style for non-scroll mode.
   * Do not put paddingBottom here. Use extraBottomPadding instead.
   */
  contentStyle?: StyleProp<ViewStyle>;

  /**
   * Additional props for the internal ScrollView when scroll=true.
   */
  scrollProps?: Omit<
    ScrollViewProps,
    'style' | 'contentContainerStyle' | 'children'
  >;

  /**
   * Inner content style for scroll mode.
   * Do not put paddingBottom here. Use extraBottomPadding instead.
   */
  scrollContentContainerStyle?: StyleProp<ViewStyle>;
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
 * SafeKeyboardScreen
 *
 * Use for non-chat form/input screens.
 *
 * Good for:
 * - profile edit
 * - report/contact forms
 * - beacon create/edit
 * - business create/edit
 * - auth forms
 *
 * Avoid for:
 * - Chat.tsx
 * - FlashList screens with custom keyboard/input synchronization
 */
export default function SafeKeyboardScreen({
  children,
  backgroundColor = '#FFFFFF',
  includeTopInset = false,
  includeBottomInset = true,
  extraTopPadding = 0,
  extraBottomPadding = 16,
  minBottomPadding = 16,
  keyboardVerticalOffset = 0,
  behavior,
  keyboardAvoidingEnabled = true,
  scroll = false,
  style,
  contentStyle,
  scrollProps,
  scrollContentContainerStyle,
  ...rest
}: SafeKeyboardScreenProps) {
  const insets = useSafeAreaInsets();

  const resolvedBehavior =
    behavior === undefined ? (Platform.OS === 'ios' ? 'padding' : undefined) : behavior;

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
    <KeyboardAvoidingView
      {...rest}
      style={[
        styles.root,
        { backgroundColor },
        style,
      ]}
      behavior={resolvedBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      enabled={keyboardAvoidingEnabled}
    >
      {scroll ? (
        <ScrollView
          {...scrollProps}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            scrollContentContainerStyle,
            {
              paddingTop,
              paddingBottom,
            },
          ]}
          keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? 'handled'}
          keyboardDismissMode={
            scrollProps?.keyboardDismissMode ??
            (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
          }
          showsVerticalScrollIndicator={scrollProps?.showsVerticalScrollIndicator ?? false}
        >
          {children}
        </ScrollView>
      ) : (
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
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
