// src/screens/chat/components/Search/ChatSearchBar.tsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable } from "react-native";
import { ChevronUp, ChevronDown, User, Calendar, Bookmark } from "lucide-react-native";

import type { ChatTheme } from "@/screens/chat/theme/chatTheme";

import {
  CHAT_SEARCH_CONTROLS_METRICS,
  INLINE_SEARCH_BAR_HEIGHT,
  chatSearchControlStyles as styles,
  createChatSearchControlsTheme,
} from "./ChatSearchControls.theme";

export { INLINE_SEARCH_BAR_HEIGHT };

type Props = {
  theme: ChatTheme;

  countLabel: string;
  hasSenderFilter: boolean;
  hasDateFilter: boolean;
  hasBookmarkFilter: boolean;

  onOpenSender: () => void;
  onOpenDate: () => void;
  onToggleBookmark: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function ChatSearchBar({
  theme,
  countLabel,
  hasSenderFilter,
  hasDateFilter,
  hasBookmarkFilter,
  onOpenSender,
  onOpenDate,
  onToggleBookmark,
  onPrev,
  onNext,
}: Props) {
  const { t } = useTranslation();
  const ui = useMemo(() => createChatSearchControlsTheme(theme), [theme]);

  return (
    <View
      style={[
        styles.inlineWrap,
        { backgroundColor: ui.inlineBg, borderTopColor: ui.borderSoft },
      ]}
    >
      <Pressable
        onPress={onOpenSender}
        style={({ pressed }) => [
          styles.inlineButton,
          {
            backgroundColor: hasSenderFilter
              ? ui.activeBg
              : pressed
                ? ui.pressed
                : "transparent",
            borderColor: hasSenderFilter ? ui.activeBorder : "transparent",
          },
        ]}
        hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('chat:search.senderFilter')}
        accessibilityState={{ selected: hasSenderFilter }}
      >
        <User
          size={CHAT_SEARCH_CONTROLS_METRICS.filterIconSize}
          color={hasSenderFilter ? ui.active : ui.text}
          strokeWidth={hasSenderFilter ? 2.5 : 2}
        />
      </Pressable>

      <Pressable
        onPress={onOpenDate}
        style={({ pressed }) => [
          styles.inlineButton,
          {
            backgroundColor: hasDateFilter
              ? ui.activeBg
              : pressed
                ? ui.pressed
                : "transparent",
            borderColor: hasDateFilter ? ui.activeBorder : "transparent",
          },
        ]}
        hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('chat:search.dateFilter')}
        accessibilityState={{ selected: hasDateFilter }}
      >
        <Calendar
          size={CHAT_SEARCH_CONTROLS_METRICS.filterIconSize}
          color={hasDateFilter ? ui.active : ui.text}
          strokeWidth={hasDateFilter ? 2.5 : 2}
        />
      </Pressable>

      <Pressable
        onPress={onToggleBookmark}
        style={({ pressed }) => [
          styles.inlineButton,
          {
            backgroundColor: hasBookmarkFilter
              ? ui.activeBg
              : pressed
                ? ui.pressed
                : "transparent",
            borderColor: hasBookmarkFilter ? ui.activeBorder : "transparent",
          },
        ]}
        hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('chat:search.bookmarkFilter')}
        accessibilityState={{ selected: hasBookmarkFilter }}
      >
        <Bookmark
          size={CHAT_SEARCH_CONTROLS_METRICS.filterIconSize}
          color={hasBookmarkFilter ? ui.active : ui.text}
          strokeWidth={hasBookmarkFilter ? 2.5 : 2}
        />
      </Pressable>

      <View pointerEvents="none" style={styles.centerOverlay}>
        <Text
          style={[styles.countText, { color: ui.text }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {countLabel}
        </Text>
      </View>

      <View style={styles.inlineRight}>
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.inlineButton,
            { backgroundColor: pressed ? ui.pressed : "transparent" },
          ]}
          hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={t('chat:search.prevResult')}
        >
          <ChevronUp
            size={CHAT_SEARCH_CONTROLS_METRICS.navIconSize}
            color={ui.text}
            strokeWidth={CHAT_SEARCH_CONTROLS_METRICS.actionIconStroke}
          />
        </Pressable>

        <Pressable
          onPress={onPrev}
          style={({ pressed }) => [
            styles.inlineButton,
            { backgroundColor: pressed ? ui.pressed : "transparent" },
          ]}
          hitSlop={CHAT_SEARCH_CONTROLS_METRICS.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={t('chat:search.nextResult')}
        >
          <ChevronDown
            size={CHAT_SEARCH_CONTROLS_METRICS.navIconSize}
            color={ui.text}
            strokeWidth={CHAT_SEARCH_CONTROLS_METRICS.actionIconStroke}
          />
        </Pressable>
      </View>
    </View>
  );
}
