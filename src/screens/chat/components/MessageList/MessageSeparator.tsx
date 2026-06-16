// src/screens/chat/components/MessageList/MessageSeparator.tsx
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet } from "react-native";
import type { ChatTheme } from "../../theme/chatTheme";

type Props = {
  label: string;
  theme: ChatTheme;
};

function hexToRgb(hex: string) {
  const v = String(hex || "").replace("#", "").trim();
  const s =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;

  if (s.length !== 6) return null;

  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);

  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
}

function mixHex(fg: string, bg: string, t: number) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return fg;

  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bb = Math.round(a.b + (b.b - a.b) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(bb)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function withAlpha(color: string | undefined | null, alpha: number, fallback: string) {
  const safeAlpha = clamp(Number(alpha), 0, 1);
  const raw = String(color ?? "").trim();

  const hex = hexToRgb(raw);
  if (hex) return `rgba(${hex.r}, ${hex.g}, ${hex.b}, ${safeAlpha})`;

  const rgba = raw.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i,
  );
  if (rgba) {
    const r = clamp(Math.round(Number(rgba[1])), 0, 255);
    const g = clamp(Math.round(Number(rgba[2])), 0, 255);
    const b = clamp(Math.round(Number(rgba[3])), 0, 255);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }

  return fallback;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type ChatT = (key: string, options?: Record<string, any>) => string;

function formatSeparatorDateLabel(year: number, month: number, day: number, t: ChatT): string | null {
  const d = new Date(year, month - 1, day);

  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  const weekdayKey = WEEKDAY_KEYS[d.getDay()] ?? "sun";
  const weekday = t(`datePicker.weekday.${weekdayKey}`, { defaultValue: "" });
  return t("date.separatorLabel", {
    year,
    month: pad2(month),
    day: pad2(day),
    weekday,
    defaultValue: `${year}. ${pad2(month)}. ${pad2(day)} ${weekday}`.trim(),
  });
}

function normalizeDateLabel(label: string, t: ChatT): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "";

  const dotted = raw.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:[일월화수목금토](?:요일)?)?$/);
  if (dotted) {
    const formatted = formatSeparatorDateLabel(Number(dotted[1]), Number(dotted[2]), Number(dotted[3]), t);
    if (formatted) return formatted;
  }

  const dashed = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashed) {
    const formatted = formatSeparatorDateLabel(Number(dashed[1]), Number(dashed[2]), Number(dashed[3]), t);
    if (formatted) return formatted;
  }

  const korean = raw.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*[일월화수목금토]요일?)?$/);
  if (korean) {
    const formatted = formatSeparatorDateLabel(Number(korean[1]), Number(korean[2]), Number(korean[3]), t);
    if (formatted) return formatted;
  }

  return raw;
}

function MessageSeparator({ label, theme }: Props) {
  const { t } = useTranslation("chat");
  const displayLabel = normalizeDateLabel(label, t);
  if (!displayLabel) return null;

  const pillBg =
    String((theme as any).separatorBg ?? "").trim() ||
    withAlpha(theme.headerBg || theme.inputBg || theme.background, 0.72, "rgba(255,255,255,0.72)");
  const textColor =
    String((theme as any).separatorText ?? "").trim() ||
    mixHex(theme.text || theme.headerText, theme.background, 0.12);
  const chevronColor = withAlpha(theme.dateTimeLine || theme.text, 0.72, mixHex(theme.text, theme.background, 0.32));
  const borderColor = withAlpha(theme.dateTimeLine || theme.text, 0.16, "rgba(0,0,0,0.08)");

  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor }]}>
        <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
          {displayLabel}
        </Text>
        <Text style={[styles.chevron, { color: chevronColor }]} numberOfLines={1}>
          ›
        </Text>
      </View>
    </View>
  );
}

export default memo(MessageSeparator);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  pill: {
    maxWidth: "82%",
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 11,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
    includeFontPadding: false,
  },
  chevron: {
    marginLeft: 5,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "500",
    includeFontPadding: false,
    transform: [{ translateY: -0.5 }],
  },
});
