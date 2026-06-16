import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MessageCircle, Phone } from 'lucide-react-native';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FriendRow as FriendRowType } from '../api/friends.types';
import {
  createFriendRowTheme,
  type FriendRowTheme,
} from './FriendRow.theme';

const ACTION_W = 120;
const AVATAR_SIZE = 50;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function getInitial(name?: string | null) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

type Props = {
  item: FriendRowType;
  openCloserRef: React.MutableRefObject<null | (() => void)>;
  onPress: (item: FriendRowType) => void;
  onLongPress?: (item: FriendRowType) => void;
  onChat: (item: FriendRowType) => void;
  onCommunicate: (item: FriendRowType) => void;
};

export default memo(function FriendRow({
  item,
  openCloserRef,
  onPress,
  onLongPress,
  onChat,
  onCommunicate,
}: Props) {
  const appTheme = useAppTheme();
  const ui = useMemo(() => createFriendRowTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);

  const x = useRef(new Animated.Value(0)).current;
  const xVal = useRef(0);
  const isOpen = useRef(false);
  const [rowActive, setRowActive] = useState(false);

  useEffect(() => {
    const id = x.addListener(({ value }) => {
      xVal.current = value;
    });
    return () => x.removeListener(id);
  }, [x]);

  const close = useCallback(() => {
    Animated.timing(x, {
      toValue: 0,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      isOpen.current = false;
      if (openCloserRef.current === close) openCloserRef.current = null;
    });
  }, [openCloserRef, x]);

  const open = useCallback(() => {
    if (openCloserRef.current && openCloserRef.current !== close) {
      openCloserRef.current();
    }
    openCloserRef.current = close;
    Animated.timing(x, {
      toValue: ACTION_W,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      isOpen.current = true;
    });
  }, [close, openCloserRef, x]);

  const handleAvatarPress = useCallback(() => {
    if (xVal.current > 2) {
      close();
      return;
    }
    onPress(item);
  }, [close, item, onPress]);

  const handleLongPress = useCallback(() => {
    if (xVal.current > 2) {
      close();
      return;
    }
    onLongPress?.(item);
  }, [close, item, onLongPress]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        if (absDx < 8 || absDy > absDx) return false;
        if (g.dx < 0) return true;
        if (isOpen.current && g.dx > 0) return true;
        return false;
      },
      onPanResponderGrant: () => {
        setRowActive(true);
      },
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) x.setValue(clamp(-g.dx, 0, ACTION_W));
        else if (isOpen.current && g.dx > 0) {
          x.setValue(clamp(ACTION_W - g.dx, 0, ACTION_W));
        }
      },
      onPanResponderRelease: (_, g) => {
        setRowActive(false);
        if (g.vx < -0.35 || xVal.current > ACTION_W * 0.45) open();
        else close();
      },
      onPanResponderTerminate: () => {
        setRowActive(false);
        if (xVal.current > ACTION_W * 0.45) open();
        else close();
      },
    }),
  ).current;

  const actionsTx = x.interpolate({
    inputRange: [0, ACTION_W],
    outputRange: [ACTION_W, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.rowContainer, rowActive && styles.rowContainerActive]}>
      <Pressable
        style={[styles.fixedProfileArea, rowActive && styles.surfaceActive]}
        onPressIn={() => setRowActive(true)}
        onPressOut={() => setRowActive(false)}
        onPress={handleAvatarPress}
        onLongPress={handleLongPress}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{getInitial(item.nickname)}</Text>
          </View>
        )}
      </Pressable>

      <View
        style={[styles.swipeableWrap, rowActive && styles.surfaceActive]}
        {...pan.panHandlers}
      >
        <Animated.View
          style={[
            styles.revealActions,
            rowActive && styles.surfaceActive,
            { transform: [{ translateX: actionsTx }] },
          ]}
        >
          <View style={styles.swipeActions}>
            <Pressable
              style={({ pressed }) => [
                styles.swipeBtn,
                pressed && styles.swipeBtnPressed,
              ]}
              onPress={() => {
                close();
                onChat(item);
              }}
            >
              <MessageCircle
                size={20}
                color={ui.colors.actionIcon}
                strokeWidth={1.9}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.swipeBtn,
                pressed && styles.swipeBtnPressed,
              ]}
              onPress={() => {
                close();
                onCommunicate(item);
              }}
            >
              <Phone
                size={20}
                color={ui.colors.callIcon}
                strokeWidth={1.9}
              />
            </Pressable>
          </View>
        </Animated.View>

        <Pressable
          style={[styles.content, rowActive && styles.surfaceActive]}
          onPressIn={() => setRowActive(true)}
          onPressOut={() => setRowActive(false)}
          onPress={() => {
            if (xVal.current > 2) close();
          }}
          onLongPress={handleLongPress}
        >
          <View style={styles.rightInner}>
            <View style={styles.rightText}>
              <Text style={styles.title} numberOfLines={1}>
                {item.nickname}
              </Text>
              {!!item.status_message && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.status_message}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
});

function createStyles(ui: FriendRowTheme) {
  return StyleSheet.create({
    rowContainer: {
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: 74,
      backgroundColor: ui.colors.rowBackground,
    },
    rowContainerActive: {
      backgroundColor: ui.colors.rowPressedBackground,
    },
    surfaceActive: {
      backgroundColor: ui.colors.rowPressedBackground,
    },
    fixedProfileArea: {
      paddingLeft: 16,
      paddingRight: 12,
      justifyContent: 'center',
      zIndex: 2,
      backgroundColor: ui.colors.rowBackground,
    },
    swipeableWrap: {
      flex: 1,
      zIndex: 1,
      minHeight: 74,
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: ui.colors.rowBackground,
    },
    revealActions: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: ACTION_W,
      justifyContent: 'center',
      zIndex: 5,
      backgroundColor: ui.colors.rowBackground,
    },
    swipeActions: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingRight: 16,
    },
    swipeBtn: {
      width: 44,
      height: 44,
      borderRadius: ui.radius.actionButton,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.actionBackground,
    },
    swipeBtnPressed: {
      backgroundColor: ui.colors.actionPressedBackground,
    },
    content: {
      flex: 1,
      paddingRight: 16,
      paddingVertical: 12,
      justifyContent: 'center',
      backgroundColor: ui.colors.rowBackground,
    },
    rightInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    rightText: {
      flex: 1,
      justifyContent: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: ui.fontWeight.title,
      lineHeight: 21,
      color: ui.colors.titleText,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: ui.fontWeight.subtitle,
      lineHeight: 18,
      color: ui.colors.subtitleText,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: ui.radius.avatar,
      borderWidth: ui.borderWidth.avatar,
      borderColor: ui.colors.avatarBorder,
      backgroundColor: ui.colors.avatarBackground,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontWeight: ui.fontWeight.avatarFallback,
      fontSize: 18,
      color: ui.colors.avatarFallbackText,
    },
  });
}
