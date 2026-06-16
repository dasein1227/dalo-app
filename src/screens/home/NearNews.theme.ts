// src/screens/home/NearNews.theme.ts

import type { AppTheme } from "@/theme/useAppTheme";

export function createNearNewsTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  // CO·ONN의 하이엔드 미니멀리즘에 맞춘 신문지 테마
  // 완벽한 트루 블랙과 오프화이트를 사용하여 모던한 매거진 느낌을 줍니다.
  const paper = isDark ? colors.background : "#F8F9FA";
  const paperAlt = isDark ? colors.surfaceSubtle : "#FFFFFF";
  const ink = isDark ? "#FFFFFF" : "#000000";
  const inkMuted = isDark ? "#A3A3A3" : "#555555";
  const inkFaint = isDark ? "#737373" : "#888888";
  const line = isDark ? "#333333" : "rgba(0,0,0,0.15)";
  const lineStrong = isDark ? "#FFFFFF" : "#000000";

  return {
    isDark,
    pressedOpacity: tokens.opacity.pressed,

    background: paper,
    paper,
    paperAlt,
    surfacePressed: isDark ? "#202020" : colors.controlPressed,
    photoBg: paperAlt,

    ink,
    inkMuted,
    inkFaint,
    line,
    lineStrong,
    rule: line,

    eventText: isDark ? "#D8BA73" : "#7D4816",
    noticeText: isDark ? "#BBC8DB" : "#425D77",
    postText: ink,

    refreshTint: ink,

    textPrimary: ink,
    textSecondary: inkMuted,
    textTertiary: inkFaint,
    border: line,
    imageBg: paperAlt,
    emptyIconBg: paperAlt,
    radius: {
      avatar: tokens.radius.round,
    },
  } as const;
}

export type NearNewsTheme = ReturnType<typeof createNearNewsTheme>;