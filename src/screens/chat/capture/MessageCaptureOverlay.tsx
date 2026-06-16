// src/screens/chat/capture/MessageCaptureOverlay.tsx

import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Download, EyeOff, Share2, User } from "lucide-react-native";

import type { ChatTheme } from "../theme/chatTheme";

type Props = {
  visible: boolean;
  count: number;
  theme: ChatTheme;
  anonymize: boolean;
  onToggleAnonymize: () => void;
  onCancel: () => void;
  onSave: () => void;
  onShare?: () => void;
};

function alpha(hexOrRgba: string | undefined | null, fallback: string, opacity: number) {
  const value = String(hexOrRgba ?? "").trim() || fallback;
  if (!value.startsWith("#")) return value;
  const h = value.slice(1);
  if (h.length !== 6) return value;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return value;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

function MessageCaptureOverlay({
  visible,
  count,
  theme,
  anonymize,
  onToggleAnonymize,
  onSave,
  onShare,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("chat");

  if (!visible) return null;

  const isActionEnabled = count > 0;
  const textColor = theme.text || theme.headerText || "#111111";
  const mutedIcon = theme.accessoryIcon || alpha(textColor, "#111111", 0.46);
  const disabledIcon = alpha(textColor, "#111111", 0.25);
  const borderColor = theme.bubbleHairline?.opponentColor || alpha(textColor, "#111111", 0.08);
  const pressedBg = theme.actionPressedBg || alpha(textColor, "#111111", 0.06);
  const barBg = theme.inputBg || theme.headerBg || "#FFFFFF";
  const buttonBg = theme.inputFieldBg || theme.headerBg || "#FFFFFF";
  const primaryBg = theme.sendButtonActive || theme.tintColor || textColor;
  const secondaryBg = theme.voiceButton || mutedIcon;
  const activePrivacyBg = anonymize ? secondaryBg : buttonBg;
  const activePrivacyBorder = anonymize ? alpha(textColor, "#111111", 0.04) : borderColor;
  const PrivacyIcon = anonymize ? EyeOff : User;

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.root,
        {
          backgroundColor: barBg,
          borderTopColor: borderColor,
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <View style={[styles.row, { backgroundColor: barBg }]}> 
        <View style={styles.leftActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={anonymize ? t("capture.anonymousOff") : t("capture.anonymousOn")}
            accessibilityState={{ selected: anonymize }}
            hitSlop={12}
            onPress={onToggleAnonymize}
            style={({ pressed }) => [
              styles.roundButton,
              {
                backgroundColor: pressed ? pressedBg : activePrivacyBg,
                borderColor: activePrivacyBorder,
              },
            ]}
          >
            <PrivacyIcon
              size={19}
              color={anonymize ? "#FFFFFF" : mutedIcon}
              strokeWidth={2.45}
            />
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <View style={styles.rightActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("capture.shareCapture")}
            disabled={!isActionEnabled || !onShare}
            hitSlop={12}
            onPress={onShare}
            style={({ pressed }) => [
              styles.roundButton,
              {
                backgroundColor: pressed && isActionEnabled && !!onShare ? pressedBg : buttonBg,
                borderColor,
                opacity: isActionEnabled && !!onShare ? 1 : 0.52,
              },
            ]}
          >
            <Share2
              size={19}
              color={isActionEnabled && onShare ? textColor : disabledIcon}
              strokeWidth={2.35}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("capture.saveCapture")}
            disabled={!isActionEnabled}
            hitSlop={12}
            onPress={onSave}
            style={({ pressed }) => [
              styles.roundButton,
              {
                backgroundColor: isActionEnabled ? (pressed ? alpha(primaryBg, primaryBg, 0.86) : primaryBg) : buttonBg,
                borderColor: isActionEnabled ? alpha(textColor, "#111111", 0.05) : borderColor,
                opacity: isActionEnabled ? 1 : 0.52,
              },
            ]}
          >
            <Download
              size={20}
              color={isActionEnabled ? "#FFFFFF" : disabledIcon}
              strokeWidth={2.45}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 80,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    flex: 1,
  },
});

export default memo(MessageCaptureOverlay);
