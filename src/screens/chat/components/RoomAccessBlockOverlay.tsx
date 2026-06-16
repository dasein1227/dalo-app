import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type RoomAccessBlockOverlayProps = {
  visible: boolean;
  topInset?: number;
  bottomInset?: number;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export default function RoomAccessBlockOverlay({
  visible,
  topInset = 0,
  bottomInset = 0,
  title,
  message,
  confirmLabel,
  onConfirm,
}: RoomAccessBlockOverlayProps) {
  if (!visible) return null;

  return (
    <View
      pointerEvents="auto"
      importantForAccessibility="yes"
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFillObject,
        styles.overlay,
        {
          paddingTop: Math.max(topInset, 0),
          paddingBottom: Math.max(bottomInset, 0),
        },
      ]}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onConfirm}
          style={styles.confirmButton}
        >
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000000,
    elevation: 1000000,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0, 0, 0, 0.34)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 25,
    paddingBottom: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17, 24, 39, 0.08)",
  },
  title: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111827",
    textAlign: "center",
  },
  message: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
  confirmButton: {
    marginTop: 20,
    width: "100%",
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
