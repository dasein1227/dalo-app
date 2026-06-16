import { Dimensions, Platform } from "react-native";

function toSafePx(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function clampPx(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export const resolveKeyboardTopY = (event: any): number | null => {
  const end = event?.endCoordinates ?? null;
  if (!end) return null;

  const screenHeight = toSafePx(Dimensions.get("screen").height);
  const screenY = Number(end.screenY);
  const eventHeight = toSafePx(end.height);
  const candidates: number[] = [];

  if (Number.isFinite(screenY) && screenY > 0) {
    candidates.push(Math.floor(screenY));
  }

  /**
   * Samsung Keyboard can report screenY from the key area while height still
   * includes the toolbar/accessory area. Keep the height-derived top as a
   * second candidate and use the upper one.
   */
  if (screenHeight > 0 && eventHeight > 0) {
    candidates.push(Math.max(0, screenHeight - eventHeight));
  }

  if (!candidates.length) return null;
  return Math.min(...candidates);
};

export const resolveKeyboardDockHeight = (event: any): number => {
  const end = event?.endCoordinates ?? null;
  if (!end) return 0;

  const windowHeight = toSafePx(Dimensions.get("window").height);
  const screenHeight = toSafePx(Dimensions.get("screen").height);
  const screenY = Number(end.screenY);
  const eventHeight = toSafePx(end.height);
  const hasScreenY = Number.isFinite(screenY) && screenY > 0;

  const heightFromScreenY =
    hasScreenY && screenHeight > 0
      ? Math.max(0, Math.floor(screenHeight - screenY))
      : 0;
  const fullKeyboardHeight = Math.max(eventHeight, heightFromScreenY);
  const overlapInsideWindow =
    hasScreenY && windowHeight > 0
      ? Math.max(0, Math.floor(windowHeight - screenY))
      : 0;

  if (Platform.OS !== "android") {
    if (overlapInsideWindow > 0) return overlapInsideWindow;
    return eventHeight;
  }

  if (fullKeyboardHeight <= 0) return overlapInsideWindow;

  const windowScreenGap =
    screenHeight > 0 && windowHeight > 0
      ? Math.max(0, screenHeight - windowHeight)
      : 0;

  /**
   * Android adjustResize + edge-to-edge does not expose a single stable IME
   * model across Samsung devices, foldables, tablets, and nav modes.
   *
   * - A near-full screen/window gap means RN window is already resized by IME,
   *   so the spacer should only cover the remaining overlap.
   * - A small gap is usually system navigation/accessory inset, not real IME
   *   resize. Subtracting it causes the composer to sit under the keyboard
   *   toolbar/soft-key area.
   * - Medium gaps are partial resize; use the remaining keyboard surface, but
   *   never less than the visible overlap inside the current RN window.
   */
  const smallSystemGap =
    windowScreenGap > 0 && windowScreenGap < fullKeyboardHeight * 0.28;
  const nearFullResize =
    windowScreenGap >= fullKeyboardHeight * 0.72 &&
    overlapInsideWindow <= fullKeyboardHeight * 0.28;

  if (nearFullResize) {
    return clampPx(overlapInsideWindow, 0, fullKeyboardHeight);
  }

  if (smallSystemGap || windowScreenGap <= 0) {
    return clampPx(
      Math.max(eventHeight, heightFromScreenY, overlapInsideWindow),
      0,
      fullKeyboardHeight,
    );
  }

  const remainingAfterResize = Math.max(0, fullKeyboardHeight - windowScreenGap);
  return clampPx(
    Math.max(remainingAfterResize, overlapInsideWindow),
    0,
    fullKeyboardHeight,
  );
};
