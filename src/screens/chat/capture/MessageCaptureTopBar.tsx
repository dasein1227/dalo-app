// src/screens/chat/capture/MessageCaptureTopBar.tsx

import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import type { ChatTheme } from "../theme/chatTheme";

type Props = {
  theme: ChatTheme;
  count: number;
  onBack: () => void;
  onClear: () => void;
};

function MessageCaptureTopBar({ theme, count, onBack, onClear }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("chat");
  const bg = theme.headerBg || "#FFFFFF";
  const text = theme.headerText || theme.text || "#111111";
  const subText = theme.dateTimeLine || theme.accessoryIcon || "rgba(0,0,0,0.56)";
  const divider = theme.bubbleHairline?.opponentColor || "rgba(0,0,0,0.08)";
  const clearColor = count > 0 ? text : subText;

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: bg, borderBottomColor: divider }]}> 
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("capture.exit")} hitSlop={10} onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={26} color={text} strokeWidth={2.15} />
        </Pressable>

        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t("capture.title")}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={t("capture.clear")} hitSlop={10} onPress={onClear} style={styles.clearButton}>
          <Text style={[styles.clearText, { color: clearColor, opacity: count > 0 ? 1 : 0.55 }]} numberOfLines={1}>{t("capture.clear")}</Text>
        </Pressable>
      </View>
      <View style={styles.captionRow}>
        <Text style={[styles.caption, { color: subText }]} numberOfLines={1}>{t("capture.desc")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.22,
  },
  clearButton: {
    minWidth: 92,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.08,
  },
  captionRow: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  caption: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    letterSpacing: -0.08,
  },
});

export default memo(MessageCaptureTopBar);
