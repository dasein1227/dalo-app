// src/screens/chat/components/Modals/SelectCopyModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, X } from "lucide-react-native";
import type { ChatTheme } from "../../theme/chatTheme";

type CopyMode = "translated" | "original";

type Props = {
  visible: boolean;
  senderName: string;
  originalText: string;
  translatedText?: string | null;
  theme: ChatTheme;
  onClose: () => void;
  onCopied?: () => void;
};

function withAlpha(
  hexOrRgba: string | undefined | null,
  alpha: number,
): string {
  if (!hexOrRgba) return `rgba(0,0,0,${alpha})`;
  const input = String(hexOrRgba).trim();
  if (input.startsWith("rgba(")) {
    const parts = input
      .replace("rgba(", "")
      .replace(")", "")
      .split(",")
      .map((p) => p.trim());
    if (parts.length >= 3)
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    return input;
  }
  if (input.startsWith("rgb(")) {
    const parts = input
      .replace("rgb(", "")
      .replace(")", "")
      .split(",")
      .map((p) => p.trim());
    if (parts.length >= 3)
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    return input;
  }
  if (!input.startsWith("#")) return input;
  const h = input.replace("#", "");
  if (h.length !== 6) return input;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isLightColor(hex: string | undefined | null): boolean {
  if (!hex || !String(hex).startsWith("#")) return false;
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72;
}

export default function SelectCopyModal({
  visible,
  senderName,
  originalText,
  translatedText,
  theme,
  onClose,
  onCopied,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const hasTranslation =
    !!translatedText && translatedText.trim() !== originalText.trim();
  const [mode, setMode] = useState<CopyMode>(
    hasTranslation ? "translated" : "original",
  );
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 8 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -24) setExpanded(true);
          if (gesture.dy > 24) setExpanded(false);
        },
      }),
    [],
  );

  useEffect(() => {
    if (visible) {
      setMode(hasTranslation ? "translated" : "original");
      setCopied(false);
      setExpanded(false);
    }
  }, [visible, hasTranslation, originalText, translatedText]);

  const colors = useMemo(() => {
    const surface = (theme as any).headerBg ?? "#FFFFFF";
    const text = (theme as any).headerText ?? "#111111";
    const accent =
      (theme as any).selectionCheckBg ??
      (theme as any).tintColor ??
      (theme as any).pickerAccent ??
      "#68BFA5";
    return {
      backdrop: "rgba(0,0,0,0.34)",
      surface,
      card: (theme as any).inputFieldBg ?? withAlpha(text, 0.055),
      text,
      subtext: withAlpha(text, 0.58),
      weakText: withAlpha(text, 0.42),
      divider: withAlpha((theme as any).dateTimeLine ?? text, 0.22),
      accent,
      accentSoft: withAlpha(accent, 0.14),
      accentPressed: withAlpha(accent, 0.22),
      accentText: isLightColor(accent) ? "#111111" : "#FFFFFF",
      pressed: (theme as any).actionPressedBg ?? withAlpha(text, 0.08),
    };
  }, [theme]);

  const safeOriginalText = String(originalText ?? "").trim();
  const safeTranslatedText = String(translatedText ?? "").trim();

  const currentText =
    mode === "translated" && hasTranslation
      ? safeTranslatedText
      : safeOriginalText;
  const hasText = currentText.trim().length > 0;

  const sheetHeight = useMemo(() => {
    const compact = Math.max(330, Math.round(windowHeight * 0.46));
    const full = Math.round(windowHeight * 0.86);
    return expanded ? full : compact;
  }, [expanded, windowHeight]);

  const handleCopyAll = async () => {
    const text = currentText.trim();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1100);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.gripArea} {...panResponder.panHandlers}>
            <View style={[styles.grip, { backgroundColor: colors.divider }]} />
          </View>

          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              <X size={20} color={colors.text} strokeWidth={2.1} />
            </Pressable>

            <View style={styles.titleBox} pointerEvents="none">
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {senderName || t("chat:selectCopy.titleFallback")}
              </Text>
            </View>

            {hasTranslation ? (
              <View style={[styles.segment, { backgroundColor: colors.card }]}>
                <Pressable
                  onPress={() => setMode("translated")}
                  style={({ pressed }) => [
                    styles.segmentItem,
                    mode === "translated" && {
                      backgroundColor: colors.accentSoft,
                    },
                    pressed && { backgroundColor: colors.accentPressed },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          mode === "translated"
                            ? colors.accent
                            : colors.subtext,
                      },
                    ]}
                  >
                    {t("chat:selectCopy.translated")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("original")}
                  style={({ pressed }) => [
                    styles.segmentItem,
                    mode === "original" && {
                      backgroundColor: colors.accentSoft,
                    },
                    pressed && { backgroundColor: colors.accentPressed },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          mode === "original" ? colors.accent : colors.subtext,
                      },
                    ]}
                  >
                    {t("chat:selectCopy.original")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View
            style={[styles.actionRow, { borderBottomColor: colors.divider }]}
          >
            <Text
              style={[styles.subtitle, { color: colors.weakText }]}
              numberOfLines={1}
            >
              {t("chat:selectCopy.hint")}
            </Text>

            <Pressable
              onPress={handleCopyAll}
              hitSlop={8}
              style={({ pressed }) => [
                styles.copyButton,
                { backgroundColor: copied ? colors.accentSoft : "transparent" },
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              {copied ? (
                <Check size={18} color={colors.accent} strokeWidth={2.4} />
              ) : (
                <Copy size={17} color={colors.text} strokeWidth={2.05} />
              )}
              <Text
                style={[
                  styles.copyText,
                  { color: copied ? colors.accent : colors.text },
                ]}
              >
                {copied ? t("chat:selectCopy.copied") : t("chat:selectCopy.copyAll")}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <View style={[styles.textCard, { backgroundColor: colors.card }]}>
              {hasText ? (
                <Text
                  selectable
                  selectionColor={colors.accentSoft}
                  style={[styles.bodyText, { color: colors.text }]}
                >
                  {currentText}
                </Text>
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.weakText }]}>
                    {t("chat:selectCopy.empty")}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    minHeight: 330,
    maxHeight: "90%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: -10 },
      },
      android: {
        elevation: 16,
      },
    }),
  },
  gripArea: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  grip: {
    width: 42,
    height: 4,
    borderRadius: 999,
  },
  header: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBox: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  actionRow: {
    minHeight: 46,
    paddingHorizontal: 18,
    paddingBottom: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subtitle: {
    flex: 1,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: "400",
  },
  copyButton: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  copyText: {
    fontSize: 13,
    fontWeight: "600",
  },
  segment: {
    flexShrink: 0,
    flexDirection: "row",
    borderRadius: 17,
    padding: 3,
  },
  segmentItem: {
    minWidth: 50,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
    minHeight: 120,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  textCard: {
    minHeight: 118,
    borderRadius: 20,
    paddingHorizontal: 17,
    paddingVertical: 15,
  },
  bodyText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "400",
    letterSpacing: -0.15,
  },
  emptyBox: {
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
});
