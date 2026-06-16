// src/components/header/ListHeader.tsx

import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';
import { createListHeaderTheme } from './ListHeader.theme';

type ListHeaderProps = {
  title?: string;
  subtitle?: string;
  titleComponent?: React.ReactNode;
  leftAccessory?: React.ReactNode;
  rightIcons?: React.ReactNode;
  safeTop?: boolean;
  withBorder?: boolean;
  style?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  leftStyle?: StyleProp<ViewStyle>;
  rightStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
};

function renderNodeSafely(node: React.ReactNode, textStyle: StyleProp<TextStyle>) {
  if (typeof node === 'string' || typeof node === 'number') {
    return <Text style={textStyle}>{node}</Text>;
  }
  return node;
}

export function ListHeader({
  title,
  subtitle,
  titleComponent,
  leftAccessory,
  rightIcons,
  safeTop = true,
  withBorder = true,
  style,
  rowStyle,
  leftStyle,
  rightStyle,
  titleStyle,
  subtitleStyle,
}: ListHeaderProps) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const headerTheme = createListHeaderTheme(appTheme);

  const hasTitle = typeof title === 'string' && title.trim().length > 0;
  const hasSubtitle = typeof subtitle === 'string' && subtitle.trim().length > 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: headerTheme.container.backgroundColor,
          borderBottomWidth: withBorder ? headerTheme.container.borderBottomWidth : 0,
          borderBottomColor: withBorder ? headerTheme.container.borderBottomColor : 'transparent',
          paddingTop: safeTop ? Math.max(insets.top, 0) + headerTheme.specs.topPadding : headerTheme.specs.topPadding,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.row,
          {
            height: headerTheme.specs.rowHeight,
            paddingHorizontal: headerTheme.specs.horizontalPadding,
          },
          rowStyle,
        ]}
      >
        <View style={[styles.left, leftStyle]}>
          {leftAccessory ? <View style={styles.leftAccessory}>{renderNodeSafely(leftAccessory, titleStyle)}</View> : null}

          <View style={styles.titleBlock}>
            {titleComponent ? (
              renderNodeSafely(titleComponent, [styles.title, headerTheme.title, titleStyle])
            ) : hasTitle ? (
              <Text numberOfLines={1} style={[styles.title, headerTheme.title, titleStyle]}>
                {title}
              </Text>
            ) : null}

            {hasSubtitle ? (
              <Text numberOfLines={1} style={[styles.subtitle, headerTheme.subtitle, subtitleStyle]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.right, { gap: headerTheme.specs.iconGap }, rightStyle]}>
          {renderNodeSafely(rightIcons, [styles.rightTextFallback, { color: headerTheme.icon.color }])}
        </View>
      </View>
    </View>
  );
}

export default ListHeader;

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftAccessory: {
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    includeFontPadding: false,
  },
  subtitle: {
    includeFontPadding: false,
    marginTop: 1,
  },
  right: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rightTextFallback: {
    fontSize: 13,
    fontWeight: '600',
  },
});
