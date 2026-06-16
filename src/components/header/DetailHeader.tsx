// src/components/header/DetailHeader.tsx

import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import { createDetailHeaderTheme } from './DetailHeader.theme';

type DetailHeaderProps = {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
  logoSource?: ImageSourcePropType;
  withBorder?: boolean;
  showStatusBar?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  leftStyle?: StyleProp<ViewStyle>;
  rightStyle?: StyleProp<ViewStyle>;
};

export function DetailHeader({
  title,
  showBack = false,
  onBackPress,
  right,
  left,
  logoSource,
  withBorder = true,
  showStatusBar = true,
  containerStyle,
  titleStyle,
  leftStyle,
  rightStyle,
}: DetailHeaderProps) {
  const navigation = useNavigation() as unknown as NativeStackNavigationProp<Record<string, object | undefined>>;
  const appTheme = useAppTheme();
  const headerTheme = createDetailHeaderTheme(appTheme);

  const hasTitle = typeof title === 'string' && title.trim().length > 0;

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <>
      {showStatusBar ? (
        <StatusBar
          backgroundColor={headerTheme.statusBar.backgroundColor}
          translucent={headerTheme.statusBar.translucent}
          barStyle={headerTheme.statusBar.barStyle}
        />
      ) : null}

      <View
        style={[
          styles.container,
          {
            height: headerTheme.container.height,
            backgroundColor: headerTheme.container.backgroundColor,
            borderBottomWidth: withBorder ? headerTheme.container.borderBottomWidth : 0,
            borderBottomColor: withBorder ? headerTheme.container.borderBottomColor : 'transparent',
            paddingHorizontal: headerTheme.container.paddingHorizontal,
            paddingLeft: headerTheme.container.paddingLeft,
            paddingTop: headerTheme.container.paddingTop,
            paddingBottom: headerTheme.container.paddingBottom,
          },
          Platform.OS === 'android' && styles.androidContainer,
          containerStyle,
        ]}
      >
        <View style={[styles.side, { width: headerTheme.slot.width }, leftStyle]}>
          {left ? (
            left
          ) : showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
              hitSlop={appTheme.tokens.hitSlop.md}
              onPress={handleBackPress}
              style={styles.backButton}
            >
              <ChevronLeft
                size={headerTheme.icon.size}
                color={headerTheme.icon.color}
                strokeWidth={headerTheme.icon.strokeWidth}
              />
            </Pressable>
          ) : logoSource ? (
            <Image
              source={logoSource}
              style={[styles.logo, { width: headerTheme.logo.width, height: headerTheme.logo.height }]}
              resizeMode="contain"
              fadeDuration={0}
            />
          ) : null}
        </View>

        <View style={styles.center} pointerEvents="none">
          {hasTitle ? (
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                {
                  color: headerTheme.title.color,
                  fontSize: headerTheme.title.fontSize,
                  lineHeight: headerTheme.title.lineHeight,
                  fontWeight: headerTheme.title.fontWeight,
                },
                titleStyle,
              ]}
            >
              {title}
            </Text>
          ) : null}
        </View>

        <View style={[styles.side, styles.right, { width: headerTheme.slot.width }, rightStyle]}>{right}</View>
      </View>
    </>
  );
}

export default DetailHeader;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  androidContainer: {
    minHeight: 54,
  },
  side: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
  right: {
    alignItems: 'flex-end',
  },
  backButton: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
  },
});
