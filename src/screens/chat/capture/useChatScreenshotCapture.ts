// src/screens/chat/capture/useChatScreenshotCapture.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Image, Keyboard, type View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { captureRef } from "react-native-view-shot";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { ImageFormat, Skia } from "@shopify/react-native-skia";

import type {
  ChatCaptureSelectionState,
  ChatCaptureSnapshot,
  ChatCaptureToastInput,
  ChatScreenshotCaptureController,
  UseChatScreenshotCaptureArgs,
} from "./chatCaptureTypes";
import type { ChatCaptureSelectionFrame } from "../components/MessageList/MessageList";

type WindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type ContentRowFrame = { top: number; bottom: number; height: number };

type PendingStart =
  | { kind: "message"; message: any; snapshot?: ChatCaptureSnapshot | null }
  | { kind: "empty" }
  | null;

const MIN_CROP_HEIGHT = 12;
const CROP_VERTICAL_BLEED = 0;
const LONG_CAPTURE_SEGMENT_OVERLAP = 0;
const LONG_CAPTURE_MAX_VIEWPORTS = 4;
const LONG_CAPTURE_MAX_HEIGHT_DP = 4200;
const LONG_CAPTURE_SEGMENT_GUARD = 24;
const CROP_EDGE_PIXEL_TRIM = 1;
const FILE_SYSTEM_BASE64_ENCODING = "base64" as any;

function bytesToBase64(input: ArrayBuffer | Uint8Array | number[]): string {
  const bytes = input instanceof Uint8Array
    ? input
    : Array.isArray(input)
      ? Uint8Array.from(input)
      : new Uint8Array(input);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  const len = bytes.length;

  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }

  if (i < len) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const n = (a << 16) | (b << 8);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += i + 1 < len ? chars[(n >> 6) & 63] : "=";
    out += "=";
  }

  return out;
}



function base64ToBytes(input: string): Uint8Array {
  const clean = String(input ?? "").replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup: Record<string, number> = {};
  for (let i = 0; i < chars.length; i += 1) lookup[chars[i]] = i;

  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const length = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "=") break;
    const value = lookup[ch];
    if (value == null) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (index < out.length) out[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return out;
}

function extractMessageId(message: any): string {
  return String(
    message?.id ??
      message?._serverId ??
      message?.message_id ??
      message?.messageId ??
      message?.uid ??
      message?.message_uid ??
      "",
  ).trim();
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function measureInWindowAsync(node: View | null): Promise<WindowRect | null> {
  return new Promise((resolve) => {
    if (!node || typeof (node as any).measureInWindow !== "function") {
      resolve(null);
      return;
    }

    try {
      (node as any).measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          const rect = {
            x: Number(x) || 0,
            y: Number(y) || 0,
            width: Number(width) || 0,
            height: Number(height) || 0,
          };
          if (rect.width <= 0 || rect.height <= 0) {
            resolve(null);
            return;
          }
          resolve(rect);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

async function ensureMediaPermission(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await MediaLibrary.requestPermissionsAsync();
  return !!requested.granted;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCropRect(input: CropRect, imageWidth: number, imageHeight: number): CropRect | null {
  const originX = clamp(Math.floor(input.originX), 0, Math.max(0, imageWidth - 1));
  const originY = clamp(Math.floor(input.originY), 0, Math.max(0, imageHeight - 1));
  const maxWidth = Math.max(1, imageWidth - originX);
  const maxHeight = Math.max(1, imageHeight - originY);
  const width = clamp(Math.ceil(input.width), 1, maxWidth);
  const height = clamp(Math.ceil(input.height), 1, maxHeight);

  if (width <= 0 || height < MIN_CROP_HEIGHT) return null;
  return { originX, originY, width, height };
}


type CapturedSegment = {
  uri: string;
  width: number;
  height: number;
  contentTop?: number;
  contentBottom?: number;
};

type CaptureImageResult = {
  outputUri: string;
  requestedContentEnd: number;
  contentEnd: number;
  composedAllSegments: boolean;
};

function makeCacheImageUri(prefix = "coonn-chat-capture", referenceUri?: string | null): string {
  const source = String(referenceUri ?? "").trim();
  const slashIndex = source.lastIndexOf("/");
  const base = slashIndex >= 0 ? source.slice(0, slashIndex + 1) : "";
  return `${base}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
}

async function composeSegmentsWithSkia(segments: CapturedSegment[]): Promise<string | null> {
  const valid = segments.filter((segment) => segment.width > 0 && segment.height > 0);
  if (valid.length <= 0) return null;
  if (valid.length === 1) return valid[0].uri;

  try {
    const width = Math.max(1, Math.min(...valid.map((segment) => Math.round(segment.width))));
    const height = Math.max(1, valid.reduce((sum, segment) => sum + Math.round(segment.height), 0));
    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) return null;

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();

    let y = 0;
    for (const segment of valid) {
      const base64 = await FileSystemLegacy.readAsStringAsync(segment.uri, {
        encoding: FILE_SYSTEM_BASE64_ENCODING,
      });
      let data: any = null;
      try {
        const bytes = base64ToBytes(base64);
        data = typeof (Skia.Data as any)?.fromBytes === "function"
          ? (Skia.Data as any).fromBytes(bytes)
          : null;
      } catch {}
      if (!data && typeof (Skia.Data as any)?.fromBase64 === "function") {
        try {
          data = (Skia.Data as any).fromBase64(base64);
        } catch {}
      }
      if (!data) continue;

      const image = Skia.Image.MakeImageFromEncoded(data);
      if (!image) continue;

      const segmentHeight = Math.round(segment.height);
      const src = Skia.XYWHRect(0, 0, image.width(), image.height());
      const dst = Skia.XYWHRect(0, y, width, segmentHeight);
      canvas.drawImageRect(image, src, dst, paint);
      y += segmentHeight;
    }

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const nonTexture = (snapshot as any)?.makeNonTextureImage?.() ?? snapshot;
    let encoded = "";

    if (typeof (nonTexture as any)?.encodeToBase64 === "function") {
      encoded = String((nonTexture as any).encodeToBase64(ImageFormat.PNG, 100) ?? "");
    }

    if (!encoded && typeof (nonTexture as any)?.encodeToBytes === "function") {
      const bytes = (nonTexture as any).encodeToBytes(ImageFormat.PNG, 100);
      if (bytes) encoded = bytesToBase64(bytes);
    }

    if (!encoded) return null;

    const outputUri = makeCacheImageUri("coonn-chat-capture-long", valid[0]?.uri);
    await FileSystemLegacy.writeAsStringAsync(outputUri, encoded, {
      encoding: FILE_SYSTEM_BASE64_ENCODING,
    });
    return outputUri;
  } catch (error) {
    console.warn('[chat-capture] composeSegmentsWithSkia failed', error);
    return null;
  }
}

function getRenderItemKey(item: any): string {
  return String(item?.key ?? '').trim();
}

function getSeparatorCaptureKey(item: any, index?: number): string {
  const key = getRenderItemKey(item);
  if (key) return `separator:${key}`;
  if (Number.isFinite(Number(index))) return `separator:index:${Number(index)}`;
  return '';
}

function getIncludedSeparatorKeysForSelection(items: any[], selectedIds: Set<string>): string[] {
  if (!Array.isArray(items) || selectedIds.size <= 0) return [];

  const selectedIndices: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as any;
    if (item?.type !== 'message') continue;
    const id = extractMessageIdFromRenderItem(item);
    if (!id || !selectedIds.has(id)) continue;
    selectedIndices.push(index);
  }

  if (selectedIndices.length <= 0) return [];

  const startIndex = Math.min(...selectedIndices);
  const endIndex = Math.max(...selectedIndices);
  const out: string[] = [];
  const pushSeparatorAt = (index: number) => {
    if (index < 0 || index >= items.length) return;
    const item = items[index] as any;
    if (item?.type !== 'separator') return;
    const key = getSeparatorCaptureKey(item, index);
    if (key && !out.includes(key)) out.push(key);
  };

  // Include date separators that are already inside the selected range.
  for (let index = startIndex; index <= endIndex; index += 1) {
    pushSeparatorAt(index);
  }

  // Include only the nearest date separator directly above the selected range.
  // A following/below date belongs to the next section and should not be captured.
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const item = items[index] as any;
    if (item?.type === 'message') break;
    if (item?.type === 'separator') {
      pushSeparatorAt(index);
      break;
    }
  }

  return out;
}

function extractSenderIdentityKey(message: any): string {
  const raw = message?._raw ?? null;
  return String(
    message?.senderId ??
      message?.sender_id ??
      message?.user_id ??
      raw?.sender_id ??
      raw?.senderId ??
      raw?.user_id ??
      message?.author_id ??
      raw?.author_id ??
      "",
  ).trim();
}

function buildAnonymousLabelMap(
  items: any[],
  selectedIds: Set<string>,
  formatLabel: (index: number) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  let index = 1;
  if (!Array.isArray(items) || selectedIds.size <= 0) return out;

  for (const item of items) {
    if (!item || item.type !== "message") continue;
    const msg = item.data ?? item.message ?? item.msg ?? null;
    const msgId = extractMessageId(msg);
    if (!msgId || !selectedIds.has(msgId)) continue;

    const senderKey = extractSenderIdentityKey(msg) || `message:${msgId}`;
    if (out[senderKey]) continue;
    out[senderKey] = formatLabel(index);
    index += 1;
  }
  return out;
}

function extractMessageIdFromRenderItem(item: any): string {
  if (!item || item.type !== "message") return "";
  return extractMessageId(item.data ?? item.message ?? item.msg ?? null);
}

function getOrderedMessageIds(items: any[]): string[] {
  if (!Array.isArray(items) || items.length <= 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const id = extractMessageIdFromRenderItem(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildRangeSelectedIdSet(items: any[], anchorId: string | null, focusId: string | null): Set<string> {
  const anchor = String(anchorId ?? "").trim();
  const focus = String(focusId ?? "").trim() || anchor;
  const fallback = new Set<string>();
  if (anchor) fallback.add(anchor);
  if (focus) fallback.add(focus);
  if (!anchor || !focus) return fallback;

  const orderedIds = getOrderedMessageIds(items);
  const anchorIndex = orderedIds.indexOf(anchor);
  const focusIndex = orderedIds.indexOf(focus);
  if (anchorIndex < 0 || focusIndex < 0) return fallback;

  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return new Set(orderedIds.slice(start, end + 1));
}

export function useChatScreenshotCapture({
  items = [],
  interactionLocked = false,
  captureBlockedBySecure = false,
  attachmentsOpen = false,
  attachmentSheetRef,
  setAttachmentsOpen,
  scheduleDockLockRelease,
  showFloatingToast,
}: UseChatScreenshotCaptureArgs): ChatScreenshotCaptureController {
  const navigation = useNavigation<any>();
  const { t } = useTranslation("chat");

  const targetRef = useRef<View | null>(null);
  const listRefRef = useRef<any>(null);
  const selectedIdSetRef = useRef<Set<string>>(new Set());
  const itemRefMapRef = useRef<Map<string, View>>(new Map());
  const itemContentFrameMapRef = useRef<Map<string, ContentRowFrame>>(new Map());
  const snapshotMapRef = useRef<Map<string, ChatCaptureSnapshot>>(new Map());
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureSeqRef = useRef(0);
  const itemsRef = useRef<any[]>(Array.isArray(items) ? items : []);
  const rangeAnchorIdRef = useRef<string | null>(null);
  const rangeFocusIdRef = useRef<string | null>(null);
  const interactionLockedRef = useRef(interactionLocked);
  const savingRef = useRef(false);
  const pendingStartRef = useRef<PendingStart>(null);
  const pendingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollYRef = useRef(0);
  const selectionFrameRef = useRef<ChatCaptureSelectionFrame>(null);
  const saveProgrammaticScrollRef = useRef(false);

  const [active, setActive] = useState(false);
  const [selectedIdSet, setSelectedIdSet] = useState<Set<string>>(() => new Set());
  const [selectionFrame, setSelectionFrame] = useState<ChatCaptureSelectionFrame>(null);
  const [anonymize, setAnonymize] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [processingCoverVisible, setProcessingCoverVisible] = useState(false);
  const [processingCoverUri, setProcessingCoverUri] = useState<string | null>(null);
  const [anonymousLabelMap, setAnonymousLabelMap] = useState<Record<string, string>>({});

  useEffect(() => {
    selectionFrameRef.current = selectionFrame;
  }, [selectionFrame]);

  useEffect(() => {
    interactionLockedRef.current = interactionLocked;
  }, [interactionLocked]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const showToast = useCallback(
    (params: ChatCaptureToastInput) => {
      showFloatingToast?.(params);
    },
    [showFloatingToast],
  );

  const anonymousLabel = useCallback(
    (index: number) => t("capture.anonymousUser", { index }),
    [t],
  );

  const registerCaptureListRef = useCallback((node: any | null) => {
    listRefRef.current = node ?? null;
  }, []);

  const clearRecomputeTimer = useCallback(() => {
    if (!recomputeTimerRef.current) return;
    clearTimeout(recomputeTimerRef.current);
    recomputeTimerRef.current = null;
  }, []);

  const clearPendingFlushTimer = useCallback(() => {
    if (!pendingFlushTimerRef.current) return;
    clearTimeout(pendingFlushTimerRef.current);
    pendingFlushTimerRef.current = null;
  }, []);

  const closeTransientSurfaces = useCallback(() => {
    try {
      Keyboard.dismiss();
    } catch {}

    try {
      attachmentSheetRef?.current?.close?.();
    } catch {}

    if (attachmentsOpen) {
      setAttachmentsOpen?.(false);
    }
  }, [attachmentSheetRef, attachmentsOpen, setAttachmentsOpen]);

  const recomputeSelectionFrame = useCallback(async () => {
    const seq = ++measureSeqRef.current;
    if (!active) {
      if (seq === measureSeqRef.current) setSelectionFrame(null);
      return null;
    }

    const ids = Array.from(selectedIdSetRef.current);
    if (ids.length <= 0) {
      if (seq === measureSeqRef.current) setSelectionFrame(null);
      return null;
    }
    const frameKeys = [
      ...getIncludedSeparatorKeysForSelection(itemsRef.current, selectedIdSetRef.current),
      ...ids,
    ];

    const targetRect = await measureInWindowAsync(targetRef.current);
    if (!targetRect) {
      if (seq === measureSeqRef.current) setSelectionFrame(null);
      return null;
    }

    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    let measuredCount = 0;

    for (const id of frameKeys) {
      const node = itemRefMapRef.current.get(id) ?? null;
      const rect = await measureInWindowAsync(node);

      let contentTop: number | null = null;
      let contentBottom: number | null = null;

      if (rect) {
        const localTop = rect.y - targetRect.y;
        const localBottom = localTop + rect.height;
        contentTop = localTop + scrollYRef.current;
        contentBottom = localBottom + scrollYRef.current;
        itemContentFrameMapRef.current.set(id, {
          top: contentTop,
          bottom: contentBottom,
          height: Math.max(0, contentBottom - contentTop),
        });
      } else {
        const cached = itemContentFrameMapRef.current.get(id) ?? null;
        if (cached) {
          contentTop = cached.top;
          contentBottom = cached.bottom;
        }
      }

      if (contentTop == null || contentBottom == null) continue;

      top = Math.min(top, contentTop);
      bottom = Math.max(bottom, contentBottom);
      measuredCount += 1;
    }

    if (measuredCount <= 0 || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      if (seq === measureSeqRef.current) setSelectionFrame(null);
      return null;
    }

    const clampedTop = Math.max(0, top - CROP_VERTICAL_BLEED);
    const clampedBottom = Math.max(clampedTop, bottom + CROP_VERTICAL_BLEED);
    const frame = {
      top: clampedTop,
      bottom: clampedBottom,
      height: Math.max(0, clampedBottom - clampedTop),
    };

    if (seq !== measureSeqRef.current || !active) return null;

    setSelectionFrame(frame);
    return { frame, targetRect, measuredCount };
  }, [active]);

  const scheduleRecomputeSelectionFrame = useCallback(() => {
    if (recomputeTimerRef.current) return;
    recomputeTimerRef.current = setTimeout(() => {
      recomputeTimerRef.current = null;
      void recomputeSelectionFrame();
    }, 16);
  }, [recomputeSelectionFrame]);

  const onCaptureViewportChange = useCallback(() => {
    if (!active || !chromeVisible) return;
    scheduleRecomputeSelectionFrame();
  }, [active, chromeVisible, scheduleRecomputeSelectionFrame]);

  const onCaptureScrollYChange = useCallback((nextScrollY: number) => {
    const y = Number(nextScrollY);
    scrollYRef.current = Number.isFinite(y) ? y : 0;
  }, []);

  useEffect(() => {
    if (!active || !chromeVisible) {
      setSelectionFrame(null);
      return;
    }
    scheduleRecomputeSelectionFrame();
  }, [active, chromeVisible, selectedIdSet, scheduleRecomputeSelectionFrame]);

  const clearSelection = useCallback(() => {
    selectedIdSetRef.current = new Set();
    setSelectedIdSet(new Set());
    setAnonymousLabelMap({});
    setSelectionFrame(null);
    rangeAnchorIdRef.current = null;
    rangeFocusIdRef.current = null;
    measureSeqRef.current += 1;
  }, []);

  const exit = useCallback(() => {
    clearRecomputeTimer();
    clearPendingFlushTimer();
    pendingStartRef.current = null;
    setActive(false);
    setSaving(false);
    savingRef.current = false;
    setChromeVisible(true);
    setProcessingCoverVisible(false);
    setProcessingCoverUri(null);
    setAnonymize(false);
    setSelectionFrame(null);
    setSelectedIdSet(new Set());
    setAnonymousLabelMap({});
    selectedIdSetRef.current = new Set();
    snapshotMapRef.current.clear();
    itemRefMapRef.current.clear();
    itemContentFrameMapRef.current.clear();
    rangeAnchorIdRef.current = null;
    rangeFocusIdRef.current = null;
    measureSeqRef.current += 1;

    try {
      scheduleDockLockRelease?.(120);
    } catch {}
  }, [clearPendingFlushTimer, clearRecomputeTimer, scheduleDockLockRelease]);

  const performStartFromMessage = useCallback(
    (message: any, snapshot?: ChatCaptureSnapshot | null) => {
      if (savingRef.current) return;

      if (captureBlockedBySecure) {
        showToast({
          message: t("capture.error.secureBlocked"),
          tone: "default",
        });
        return;
      }

      const id = extractMessageId(message);
      if (!id) {
        showToast({
          message: t("capture.error.messageNotFound"),
          tone: "default",
        });
        return;
      }

      closeTransientSurfaces();

      snapshotMapRef.current = new Map();
      itemContentFrameMapRef.current.clear();
      if (snapshot) snapshotMapRef.current.set(id, snapshot);

      rangeAnchorIdRef.current = id;
      rangeFocusIdRef.current = id;

      const next = buildRangeSelectedIdSet(itemsRef.current, id, id);
      selectedIdSetRef.current = next;
      setSelectedIdSet(next);
      setAnonymousLabelMap(buildAnonymousLabelMap(itemsRef.current, next, anonymousLabel));
      setSelectionFrame(null);
      setChromeVisible(true);
      setProcessingCoverVisible(false);
      setProcessingCoverUri(null);
      setAnonymize(false);
      setActive(true);
    },
    [anonymousLabel, captureBlockedBySecure, closeTransientSurfaces, showToast, t],
  );

  const performStartEmpty = useCallback(() => {
    if (savingRef.current) return;

    if (captureBlockedBySecure) {
      showToast({
        message: t("capture.error.secureBlocked"),
        tone: "default",
      });
      return;
    }

    closeTransientSurfaces();

    snapshotMapRef.current = new Map();
    itemContentFrameMapRef.current.clear();
    selectedIdSetRef.current = new Set();
    setSelectedIdSet(new Set());
    setAnonymousLabelMap({});
    setSelectionFrame(null);
    setChromeVisible(true);
    setProcessingCoverVisible(false);
    setProcessingCoverUri(null);
    setAnonymize(false);
    rangeAnchorIdRef.current = null;
    rangeFocusIdRef.current = null;
    measureSeqRef.current += 1;
    setActive(true);
  }, [captureBlockedBySecure, closeTransientSurfaces, showToast, t]);

  const flushPendingStart = useCallback(() => {
    if (savingRef.current) return;
    if (interactionLockedRef.current) return;

    const pending = pendingStartRef.current;
    if (!pending) return;
    pendingStartRef.current = null;

    if (pending.kind === "message") {
      performStartFromMessage(pending.message, pending.snapshot ?? null);
    } else {
      performStartEmpty();
    }
  }, [performStartEmpty, performStartFromMessage]);

  const queuePendingStart = useCallback(
    (pending: PendingStart) => {
      pendingStartRef.current = pending;
      clearPendingFlushTimer();
      pendingFlushTimerRef.current = setTimeout(() => {
        pendingFlushTimerRef.current = null;
        flushPendingStart();
      }, 80);
    },
    [clearPendingFlushTimer, flushPendingStart],
  );

  const startFromMessage = useCallback(
    (message: any, snapshot?: ChatCaptureSnapshot | null) => {
      if (savingRef.current) return;
      if (interactionLockedRef.current) {
        queuePendingStart({ kind: "message", message, snapshot: snapshot ?? null });
        closeTransientSurfaces();
        return;
      }
      performStartFromMessage(message, snapshot);
    },
    [closeTransientSurfaces, performStartFromMessage, queuePendingStart],
  );

  const startEmpty = useCallback(() => {
    if (savingRef.current) return;
    if (interactionLockedRef.current) {
      queuePendingStart({ kind: "empty" });
      closeTransientSurfaces();
      return;
    }
    performStartEmpty();
  }, [closeTransientSurfaces, performStartEmpty, queuePendingStart]);

  const toggleMessage = useCallback(
    (message: any, snapshot?: ChatCaptureSnapshot | null) => {
      if (savingRef.current) return;

      const id = extractMessageId(message);
      if (!id) return;

      if (snapshot) snapshotMapRef.current.set(id, snapshot);

      const currentSelected = selectedIdSetRef.current;
      const isSingleSelected = currentSelected.size === 1 && currentSelected.has(id);

      if (isSingleSelected) {
        selectedIdSetRef.current = new Set();
        setSelectedIdSet(new Set());
        setAnonymousLabelMap({});
        setSelectionFrame(null);
        rangeAnchorIdRef.current = null;
        rangeFocusIdRef.current = null;
        measureSeqRef.current += 1;
        return;
      }

      if (!rangeAnchorIdRef.current || currentSelected.size <= 0) {
        rangeAnchorIdRef.current = id;
        rangeFocusIdRef.current = id;
      } else {
        rangeFocusIdRef.current = id;
      }

      const next = buildRangeSelectedIdSet(
        itemsRef.current,
        rangeAnchorIdRef.current,
        rangeFocusIdRef.current,
      );
      selectedIdSetRef.current = next;
      setSelectedIdSet(next);
      setAnonymousLabelMap(buildAnonymousLabelMap(itemsRef.current, next, anonymousLabel));
      setSelectionFrame(null);
    },
    [anonymousLabel],
  );

  const onCaptureItemRef = useCallback((id: string, node: View | null) => {
    const key = String(id ?? "").trim();
    if (!key) return;

    if (node) {
      itemRefMapRef.current.set(key, node);
      requestAnimationFrame(() => {
        void (async () => {
          const [targetRect, rect] = await Promise.all([
            measureInWindowAsync(targetRef.current),
            measureInWindowAsync(node),
          ]);
          if (!targetRect || !rect) return;
          const localTop = rect.y - targetRect.y;
          const top = localTop + scrollYRef.current;
          const bottom = top + rect.height;
          itemContentFrameMapRef.current.set(key, {
            top,
            bottom,
            height: Math.max(0, bottom - top),
          });
        })();
      });
    } else {
      itemRefMapRef.current.delete(key);
    }
  }, []);

  const captureVisibleSelectionSegment = useCallback(
    async (target: View, targetRect: WindowRect, contentStart: number, contentEnd: number) => {
      const currentOffset = Math.max(0, Number(scrollYRef.current ?? 0) || 0);
      const viewportTop = currentOffset;
      const viewportBottom = currentOffset + targetRect.height;
      const visibleContentTop = Math.max(contentStart, viewportTop);
      const visibleContentBottom = Math.min(contentEnd, viewportBottom);
      const visibleHeight = Math.max(0, visibleContentBottom - visibleContentTop);
      if (visibleHeight < MIN_CROP_HEIGHT) return null;

      const uri = await captureRef(target as any, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        snapshotContentContainer: false,
      } as any);

      const imageSize = await getImageSize(uri);
      const scaleY = imageSize.height / Math.max(1, targetRect.height);
      const crop = normalizeCropRect(
        {
          originX: 0,
          originY: (visibleContentTop - viewportTop) * scaleY,
          width: imageSize.width,
          height: visibleHeight * scaleY,
        },
        imageSize.width,
        imageSize.height,
      );

      if (!crop) return null;

      const trimTop = crop.originY > 0 && crop.height > MIN_CROP_HEIGHT + CROP_EDGE_PIXEL_TRIM * 2
        ? CROP_EDGE_PIXEL_TRIM
        : 0;
      const trimBottom = crop.height > MIN_CROP_HEIGHT + trimTop + CROP_EDGE_PIXEL_TRIM
        ? CROP_EDGE_PIXEL_TRIM
        : 0;
      const finalCrop = {
        originX: crop.originX,
        originY: crop.originY + trimTop,
        width: crop.width,
        height: Math.max(MIN_CROP_HEIGHT, crop.height - trimTop - trimBottom),
      };

      const cropped = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: finalCrop.originX,
              originY: finalCrop.originY,
              width: finalCrop.width,
              height: finalCrop.height,
            },
          },
        ],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG },
      );

      const croppedSize = await getImageSize(cropped.uri);
      return {
        uri: cropped.uri,
        width: croppedSize.width,
        height: croppedSize.height,
        contentTop: visibleContentTop,
        contentBottom: visibleContentBottom,
      };
    },
    [],
  );

  const scrollCaptureListToOffset = useCallback(async (offset: number) => {
    const ref = listRefRef.current;
    const y = Math.max(0, Number(offset) || 0);
    const current = Math.max(0, Number(scrollYRef.current ?? 0) || 0);
    if (Math.abs(current - y) < 0.5) {
      scrollYRef.current = y;
      return;
    }
    scrollYRef.current = y;
    saveProgrammaticScrollRef.current = true;
    try {
      ref?.scrollToOffset?.({ offset: y, animated: false });
    } catch (error) {
      console.warn('[chat-capture] scrollToOffset failed', error);
    }
    await waitForNextPaint();
    await waitForNextPaint();
  }, []);

  const createCaptureImage = useCallback(async (): Promise<CaptureImageResult | null> => {
    const target = targetRef.current;
    if (!target) {
      showToast({ message: t("capture.error.areaNotFound"), tone: "default" });
      return null;
    }

    saveProgrammaticScrollRef.current = false;
    const originalScrollY = Math.max(0, Number(scrollYRef.current ?? 0) || 0);

    setChromeVisible(false);
    await waitForNextPaint();

    try {
      const coverUri = await captureRef(target as any, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        snapshotContentContainer: false,
      } as any);
      setProcessingCoverUri(String(coverUri || "") || null);
    } catch {
      setProcessingCoverUri(null);
    }
    setProcessingCoverVisible(true);
    await waitForNextPaint();

    const measured = await recomputeSelectionFrame();
    const contentFrame = measured?.frame ?? selectionFrameRef.current;
    const targetRect = measured?.targetRect ?? (await measureInWindowAsync(targetRef.current));
    if (!contentFrame || !targetRect || contentFrame.height < MIN_CROP_HEIGHT) {
      showToast({ message: t("capture.error.selectedAreaNotFound"), tone: "default" });
      return null;
    }

    const maxHeight = Math.max(
      targetRect.height,
      Math.min(LONG_CAPTURE_MAX_HEIGHT_DP, targetRect.height * LONG_CAPTURE_MAX_VIEWPORTS),
    );
    const contentStart = Math.max(0, contentFrame.top);
    const requestedContentEnd = Math.max(contentStart, contentFrame.bottom);
    const contentEnd = Math.min(requestedContentEnd, contentStart + maxHeight);
    if (contentEnd - contentStart < MIN_CROP_HEIGHT) {
      showToast({ message: t("capture.error.areaCalcFailed"), tone: "default" });
      return null;
    }

    const segments: CapturedSegment[] = [];
    const visibleTop = originalScrollY;
    const visibleBottom = originalScrollY + targetRect.height;
    const selectionAlreadyVisible = contentStart >= visibleTop && contentEnd <= visibleBottom;

    if (selectionAlreadyVisible) {
      const segment = await captureVisibleSelectionSegment(
        target,
        targetRect,
        contentStart,
        contentEnd,
      );
      if (segment) {
        segments.push({
          uri: segment.uri,
          width: segment.width,
          height: segment.height,
          contentTop: segment.contentTop,
          contentBottom: segment.contentBottom,
        });
      }
    } else {
      let cursor = contentStart;
      let safety = 0;

      while (cursor < contentEnd - 1 && safety < LONG_CAPTURE_MAX_VIEWPORTS + 2) {
        safety += 1;
        await scrollCaptureListToOffset(cursor);
        const nextTargetRect = (await measureInWindowAsync(targetRef.current)) ?? targetRect;
        await waitForNextPaint();

        const segment = await captureVisibleSelectionSegment(
          target,
          nextTargetRect,
          cursor,
          contentEnd,
        );

        if (!segment) break;
        segments.push({
          uri: segment.uri,
          width: segment.width,
          height: segment.height,
          contentTop: segment.contentTop,
          contentBottom: segment.contentBottom,
        });

        const nextCursor = segment.contentBottom;
        if (nextCursor <= cursor + LONG_CAPTURE_SEGMENT_GUARD) break;
        cursor = Math.max(cursor + 1, nextCursor - LONG_CAPTURE_SEGMENT_OVERLAP);
      }
    }

    if (segments.length <= 0) {
      showToast({ message: t("capture.error.outOfView"), tone: "default" });
      return null;
    }

    let outputUri = segments.length === 1 ? segments[0].uri : await composeSegmentsWithSkia(segments);
    let composedAllSegments = true;
    if (!outputUri) {
      composedAllSegments = false;
      outputUri = segments[0]?.uri ?? null;
    }
    if (!outputUri) {
      showToast({ message: t("capture.error.imageCreateFailed"), tone: "default" });
      return null;
    }

    return {
      outputUri,
      requestedContentEnd,
      contentEnd,
      composedAllSegments,
    };
  }, [
    captureVisibleSelectionSegment,
    recomputeSelectionFrame,
    scrollCaptureListToOffset,
    showToast,
    t,
  ]);

  const finishCaptureProcessing = useCallback(async (originalScrollY: number) => {
    if (saveProgrammaticScrollRef.current) {
      await scrollCaptureListToOffset(originalScrollY);
    }
    saveProgrammaticScrollRef.current = false;
    setProcessingCoverVisible(false);
    setProcessingCoverUri(null);
    setChromeVisible(true);
    setSaving(false);
    savingRef.current = false;
  }, [scrollCaptureListToOffset]);

  const save = useCallback(async () => {
    if (!active || savingRef.current) return;

    if (selectedIdSetRef.current.size <= 0) {
      showToast({ message: t("capture.error.emptySelection"), tone: "default" });
      return;
    }

    setSaving(true);
    savingRef.current = true;
    const originalScrollY = Math.max(0, Number(scrollYRef.current ?? 0) || 0);
    let didComplete = false;

    try {
      const result = await createCaptureImage();
      if (!result?.outputUri) return;

      const hasPermission = await ensureMediaPermission();
      if (!hasPermission) {
        showToast({ message: t("capture.error.permissionRequired"), tone: "default" });
        return;
      }

      await MediaLibrary.saveToLibraryAsync(result.outputUri);
      if (!result.composedAllSegments) {
        showToast({ message: t("capture.success.savedVisibleOnly"), tone: "default", showMark: true });
      } else if (result.requestedContentEnd > result.contentEnd + 1) {
        showToast({ message: t("capture.success.savedPartial"), tone: "default", showMark: true });
      } else {
        showToast({ message: t("capture.success.saved"), tone: "default", showMark: true });
      }
      didComplete = true;
    } catch (error) {
      console.warn('[chat-capture] save failed', error);
      showToast({ message: t("capture.error.saveFailed"), tone: "default" });
    } finally {
      await finishCaptureProcessing(originalScrollY);
      if (didComplete) exit();
    }
  }, [active, createCaptureImage, exit, finishCaptureProcessing, showToast, t]);

  const share = useCallback(async () => {
    if (!active || savingRef.current) return;

    if (selectedIdSetRef.current.size <= 0) {
      showToast({ message: t("capture.error.emptySelection"), tone: "default" });
      return;
    }

    setSaving(true);
    savingRef.current = true;
    const originalScrollY = Math.max(0, Number(scrollYRef.current ?? 0) || 0);
    let didComplete = false;

    try {
      const result = await createCaptureImage();
      if (!result?.outputUri) return;

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showToast({ message: t("capture.error.shareUnavailable"), tone: "default" });
        return;
      }

      await Sharing.shareAsync(result.outputUri, {
        mimeType: "image/png",
        dialogTitle: t("capture.shareCapture"),
      });
      didComplete = true;
    } catch (error) {
      console.warn('[chat-capture] share failed', error);
      showToast({ message: t("capture.error.shareFailed"), tone: "default" });
    } finally {
      await finishCaptureProcessing(originalScrollY);
      if (didComplete) exit();
    }
  }, [active, createCaptureImage, exit, finishCaptureProcessing, showToast, t]);

  useEffect(() => {
    itemsRef.current = Array.isArray(items) ? items : [];

    if (!active || !rangeAnchorIdRef.current) return;
    const next = buildRangeSelectedIdSet(
      itemsRef.current,
      rangeAnchorIdRef.current,
      rangeFocusIdRef.current ?? rangeAnchorIdRef.current,
    );
    selectedIdSetRef.current = next;
    setSelectedIdSet(next);
    setAnonymousLabelMap(buildAnonymousLabelMap(itemsRef.current, next, anonymousLabel));
    setSelectionFrame(null);
  }, [active, anonymousLabel, items]);

  useEffect(() => {
    selectedIdSetRef.current = selectedIdSet;
    if (active) {
      setAnonymousLabelMap(buildAnonymousLabelMap(itemsRef.current, selectedIdSet, anonymousLabel));
      setSelectionFrame(null);
    }
  }, [active, anonymousLabel, selectedIdSet]);

  useEffect(() => {
    if (!interactionLocked) flushPendingStart();
  }, [flushPendingStart, interactionLocked]);

  useEffect(() => {
    if (!active) return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      exit();
      return true;
    });

    return () => sub.remove();
  }, [active, exit]);

  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return;

    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      if (!active) return;
      e.preventDefault();
      exit();
    });

    return unsub;
  }, [active, exit, navigation]);

  useEffect(() => () => {
    clearRecomputeTimer();
    clearPendingFlushTimer();
  }, [clearPendingFlushTimer, clearRecomputeTimer]);

  const selection: ChatCaptureSelectionState = useMemo(
    () => ({
      selectedIdSet,
      count: selectedIdSet.size,
      exit,
      clear: clearSelection,
    }),
    [clearSelection, exit, selectedIdSet],
  );

  const targetProps = useMemo(
    () => ({
      ref: targetRef,
      onLayout: scheduleRecomputeSelectionFrame,
    }),
    [scheduleRecomputeSelectionFrame],
  );

  const messageListProps = useMemo(
    () => ({
      captureChromeVisible: chromeVisible,
      captureSelectionFrame: selectionFrame,
      onCaptureItemRef,
      onCaptureViewportChange,
      onCaptureScrollYChange,
      onCaptureListRef: registerCaptureListRef,
      captureAnonymousLabelMap: anonymousLabelMap,
    }),
    [anonymousLabelMap, chromeVisible, onCaptureItemRef, onCaptureScrollYChange, onCaptureViewportChange, registerCaptureListRef, selectionFrame],
  );

  return {
    targetRef,
    targetProps,
    messageListProps,

    active,
    anonymize,
    setAnonymize,
    interactionLocked: saving,
    chromeVisible,
    processingCoverVisible,
    processingCoverUri,

    selection,
    startFromMessage,
    startEmpty,
    toggleMessage,
    save,
    share,
    exit,

    captureSelection: selection,
    captureJob: null,
    captureAnonymize: anonymize,
    setCaptureAnonymize: setAnonymize,
    captureModeActive: active,
    captureInteractionLocked: saving,
    captureChromeVisible: chromeVisible,
    captureProcessingCoverVisible: processingCoverVisible,
    captureProcessingCoverUri: processingCoverUri,
    handleToggleCaptureMessage: toggleMessage,
    handleStartCaptureFromMessage: startFromMessage,
    handleStartCaptureEmpty: startEmpty,
    handleSaveCapture: save,
    handleShareCapture: share,
  };
}
