// src/components/header/HeaderIconButton.tsx

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import { createHeaderIconButtonTheme } from './HeaderIconButton.theme';

type HeaderIconButtonVariant = 'circle' | 'plain';

type HeaderIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type HeaderIconButtonProps = Omit<PressableProps, 'children' | 'style' | 'onPress'> & {
  icon?: HeaderIconComponent;
  children?: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: HeaderIconButtonVariant;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  iconStrokeWidth?: number;
  pressedOpacity?: number;
  selected?: boolean;
  selectedBackgroundColor?: string;
  selectedBorderColor?: string;
  selectedIconColor?: string;
  selectedTextColor?: string;
  badgeCount?: number;
  badgeMax?: number;
  badgeBackgroundColor?: string;
  badgeBorderColor?: string;
  badgeTextColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function HeaderIconButton({
  icon: Icon,
  children,
  onPress,
  variant = 'circle',
  size,
  iconSize,
  iconColor,
  iconStrokeWidth,
  pressedOpacity,
  selected = false,
  selectedBackgroundColor,
  selectedBorderColor,
  selectedIconColor,
  selectedTextColor,
  badgeCount,
  badgeMax = 99,
  badgeBackgroundColor,
  badgeBorderColor,
  badgeTextColor,
  disabled,
  style,
  contentStyle,
  textStyle,
  hitSlop,
  accessibilityRole = 'button',
  ...rest
}: HeaderIconButtonProps) {
  const appTheme = useAppTheme();
  const buttonTheme = createHeaderIconButtonTheme(appTheme);

  const resolvedSize = size ?? buttonTheme.size;
  const resolvedIconSize = iconSize ?? buttonTheme.iconSize;
  const resolvedIconColor = selected
    ? selectedIconColor ?? buttonTheme.selectedIconColor
    : iconColor ?? buttonTheme.iconColor;
  const resolvedIconStrokeWidth = iconStrokeWidth ?? buttonTheme.iconStrokeWidth;
  const resolvedPressedOpacity = pressedOpacity ?? buttonTheme.pressedOpacity;
  const isTextChild = typeof children === 'string' || typeof children === 'number';
  const resolvedTextColor = selected
    ? selectedTextColor ?? buttonTheme.selectedTextColor
    : buttonTheme.textColor;
  const resolvedBackgroundColor = selected
    ? selectedBackgroundColor ?? buttonTheme.selectedBackground
    : buttonTheme.circleBackground;
  const resolvedBorderColor = selected
    ? selectedBorderColor ?? buttonTheme.selectedBorderColor
    : buttonTheme.circleBorderColor;
  const shouldShowBadge = typeof badgeCount === 'number' && badgeCount > 0;
  const badgeLabel = shouldShowBadge
    ? badgeCount > badgeMax
      ? `${badgeMax}+`
      : String(badgeCount)
    : '';

  return (
    <Pressable
      {...rest}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      hitSlop={hitSlop ?? buttonTheme.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'circle'
          ? {
              width: resolvedSize,
              height: resolvedSize,
              borderRadius: resolvedSize / 2,
              backgroundColor: resolvedBackgroundColor,
              borderWidth: buttonTheme.circleBorderWidth,
              borderColor: resolvedBorderColor,
            }
          : {
              minWidth: buttonTheme.plainMinSize,
              minHeight: buttonTheme.plainMinSize,
              borderRadius: buttonTheme.radius,
              backgroundColor: selected ? resolvedBackgroundColor : 'transparent',
              borderWidth: selected ? buttonTheme.circleBorderWidth : 0,
              borderColor: selected ? resolvedBorderColor : 'transparent',
            },
        disabled && { opacity: buttonTheme.disabledOpacity },
        pressed && !disabled && { opacity: resolvedPressedOpacity },
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>
        {Icon ? (
          <Icon
            size={resolvedIconSize}
            color={resolvedIconColor}
            strokeWidth={resolvedIconStrokeWidth}
          />
        ) : isTextChild ? (
          <Text
            style={[
              styles.textFallback,
              {
                color: resolvedTextColor,
                fontSize: buttonTheme.textFontSize,
                fontWeight: buttonTheme.textFontWeight,
              },
              textStyle,
            ]}
          >
            {children}
          </Text>
        ) : (
          children ?? null
        )}
      </View>

      {shouldShowBadge ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              backgroundColor: badgeBackgroundColor ?? appTheme.colors.unread,
              borderColor: badgeBorderColor ?? buttonTheme.circleBackground,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: badgeTextColor ?? appTheme.colors.textInverse }]}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default HeaderIconButton;

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textFallback: {
    fontSize: 13,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
