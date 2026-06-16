// src/screens/chat/hooks/useMediaViewerChatBridge.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { DeviceEventEmitter } from 'react-native';
import i18next from 'i18next';

import type { PickedAsset } from '../utils/chatHelpers';
import {
  type MediaViewerOpenMessagePayload,
  type MediaViewerEditedImagePayload,
  type MediaViewerTargetAnchor,
  type MessageFocusRequest,
  buildMessageFocusRequestKey,
  buildRouteTargetAnchor,
  getBridgeOpenRoomId,
  normalizeBridgeRoomId,
} from '../utils/messageAnchor';


function chatText(key: string, defaultValue: string, options?: Record<string, any>): string {
  return String(i18next.t(key, { defaultValue, ...(options ?? {}) }));
}

type UseMediaViewerChatBridgeArgs = {
  navigation: any;
  routeParams: Record<string, any>;
  isFocused: boolean;
  resolvedRoomId: number | null;
  resolvedRoomIdOk: boolean;
  ensureAnchorInWindow?: ((anchor: any) => Promise<any>) | null;
  onInitialBottomDone?: (() => void) | null;
  showSecureStatus: (message: string) => void;
  setFocusAutoBottomLock: (durationMs?: number) => void;
  messageFocusRequestRef: MutableRefObject<MessageFocusRequest | null>;
  setMessageFocusRequest: Dispatch<SetStateAction<MessageFocusRequest | null>>;
  focusFailureTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  handleSendSelectedMedia: (assets: PickedAsset[], bundleSend: boolean) => Promise<any>;
};

export function useMediaViewerChatBridge({
  navigation,
  routeParams,
  isFocused,
  resolvedRoomId,
  resolvedRoomIdOk,
  ensureAnchorInWindow,
  onInitialBottomDone,
  showSecureStatus,
  setFocusAutoBottomLock,
  messageFocusRequestRef,
  setMessageFocusRequest,
  focusFailureTimerRef,
  handleSendSelectedMedia,
}: UseMediaViewerChatBridgeArgs) {
  const mediaViewerOpenMessageRef = useRef<MediaViewerOpenMessagePayload | null>(null);
  const mediaViewerOpenAttemptRef = useRef(0);
  const mediaViewerOpenAnchorRef = useRef<MediaViewerTargetAnchor | null>(null);
  const mediaViewerEditedImageRef = useRef<MediaViewerEditedImagePayload | null>(null);
  const mediaViewerEditedImageDedupeRef = useRef('');
  const [mediaViewerBridgeTick, setMediaViewerBridgeTick] = useState(0);

  useEffect(() => {
    const openSub = DeviceEventEmitter.addListener('chat:mediaViewer:openMessage', (payload: MediaViewerOpenMessagePayload) => {
      mediaViewerOpenMessageRef.current = payload ?? null;
      mediaViewerOpenAttemptRef.current = 0;
      mediaViewerOpenAnchorRef.current = null;
      setMediaViewerBridgeTick((v) => v + 1);
    });

    const editedSub = DeviceEventEmitter.addListener('chat:mediaViewer:sendEditedImage', (payload: MediaViewerEditedImagePayload) => {
      mediaViewerEditedImageRef.current = payload ?? null;
      setMediaViewerBridgeTick((v) => v + 1);
    });

    return () => {
      try { openSub.remove(); } catch {}
      try { editedSub.remove(); } catch {}
    };
  }, []);

  const getBridgeOpenRoomIdForCurrentRoute = useCallback(() => {
    return getBridgeOpenRoomId(mediaViewerOpenMessageRef.current, routeParams as any);
  }, [mediaViewerBridgeTick, routeParams]);

  const getRouteTargetAnchor = useCallback((): MediaViewerTargetAnchor | null => {
    return buildRouteTargetAnchor(mediaViewerOpenMessageRef.current, routeParams as any);
  }, [mediaViewerBridgeTick, routeParams]);

  const clearMediaViewerNavigationParams = useCallback(() => {
    try {
      (navigation as any).setParams?.({
        messageId: undefined,
        targetMessageId: undefined,
        focusMessageId: undefined,
        highlightMessageId: undefined,
        initialMessageId: undefined,
        messageUid: undefined,
        initialMessageUid: undefined,
        roomSeq: undefined,
        initialRoomSeq: undefined,
        createdAt: undefined,
        targetCreatedAt: undefined,
        initialCreatedAt: undefined,
        highlightKeyword: undefined,
        pendingImageUri: undefined,
        pendingEditedImageUri: undefined,
        pendingImageWidth: undefined,
        pendingImageHeight: undefined,
        sourceMessageId: undefined,
        sourceMessageUid: undefined,
        sourceRoomSeq: undefined,
        sourceCreatedAt: undefined,
        source: undefined,
      });
    } catch {}
  }, [navigation]);

  useEffect(() => {
    if (!isFocused || !resolvedRoomIdOk || !resolvedRoomId) return;

    const bridgeRoomId = getBridgeOpenRoomIdForCurrentRoute();
    if (bridgeRoomId && bridgeRoomId !== Number(resolvedRoomId)) return;

    const anchor = getRouteTargetAnchor();
    if (!anchor) return;

    const source = typeof (routeParams as any)?.source === 'string' ? String((routeParams as any).source) : null;
    const highlightKeyword = typeof (routeParams as any)?.highlightKeyword === 'string' ? String((routeParams as any).highlightKeyword) : null;
    const requestKey = buildMessageFocusRequestKey(Number(resolvedRoomId), anchor, source, highlightKeyword);
    if (!requestKey) return;

    const currentKey = messageFocusRequestRef.current?.requestKey ?? null;
    if (currentKey === requestKey) return;

    const nextRequest: MessageFocusRequest = {
      ...anchor,
      requestKey,
      roomId: Number(resolvedRoomId),
      highlightKeyword,
      source,
    };

    if (focusFailureTimerRef.current) {
      clearTimeout(focusFailureTimerRef.current);
      focusFailureTimerRef.current = null;
    }

    mediaViewerOpenMessageRef.current = null;
    mediaViewerOpenAttemptRef.current = 0;
    mediaViewerOpenAnchorRef.current = null;

    setFocusAutoBottomLock(2600);

    messageFocusRequestRef.current = nextRequest;
    setMessageFocusRequest(nextRequest);

    let cancelled = false;

    void (async () => {
      const result = await ensureAnchorInWindow?.(nextRequest as any);
      if (cancelled) return;

      if (!result?.ok) {
        focusFailureTimerRef.current = setTimeout(() => {
          const stillCurrent = messageFocusRequestRef.current?.requestKey === requestKey;
          if (!stillCurrent) return;
          messageFocusRequestRef.current = null;
          setMessageFocusRequest(null);
          clearMediaViewerNavigationParams();
          onInitialBottomDone?.();
          showSecureStatus(chatText('chat:bridge.messageNotFound', '로컬에서 해당 메시지를 찾지 못했습니다.'));
        }, 900);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearMediaViewerNavigationParams,
    ensureAnchorInWindow,
    getBridgeOpenRoomIdForCurrentRoute,
    getRouteTargetAnchor,
    isFocused,
    mediaViewerBridgeTick,
    onInitialBottomDone,
    resolvedRoomId,
    resolvedRoomIdOk,
    routeParams,
    setFocusAutoBottomLock,
    showSecureStatus,
    messageFocusRequestRef,
    setMessageFocusRequest,
    focusFailureTimerRef,
  ]);

  const handleMessageFocusHandled = useCallback((requestKey: string) => {
    if (!requestKey) return;
    const currentKey = messageFocusRequestRef.current?.requestKey ?? null;
    if (currentKey !== requestKey) return;

    if (focusFailureTimerRef.current) {
      clearTimeout(focusFailureTimerRef.current);
      focusFailureTimerRef.current = null;
    }

    setFocusAutoBottomLock(1700);
    onInitialBottomDone?.();
    messageFocusRequestRef.current = null;
    setMessageFocusRequest(null);
    clearMediaViewerNavigationParams();
  }, [clearMediaViewerNavigationParams, focusFailureTimerRef, messageFocusRequestRef, onInitialBottomDone, setFocusAutoBottomLock, setMessageFocusRequest]);

  const getPendingEditedImagePayload = useCallback((): MediaViewerEditedImagePayload | null => {
    const eventPayload = mediaViewerEditedImageRef.current;
    const eventUri = String(eventPayload?.uri ?? '').trim();

    if (eventUri) return eventPayload;

    const routeUri = String((routeParams as any)?.pendingEditedImageUri ?? '').trim();
    const routeSource = String((routeParams as any)?.source ?? '').trim();

    if (!routeUri || routeSource !== 'media_viewer_edit_resend') return null;

    return {
      roomId: (routeParams as any)?.roomId,
      uri: routeUri,
      width: (routeParams as any)?.pendingImageWidth,
      height: (routeParams as any)?.pendingImageHeight,
      sourceMessageId: (routeParams as any)?.sourceMessageId,
      sourceMessageUid: (routeParams as any)?.sourceMessageUid,
      sourceRoomSeq: (routeParams as any)?.sourceRoomSeq,
      sourceCreatedAt: (routeParams as any)?.sourceCreatedAt,
    };
  }, [
    mediaViewerBridgeTick,
    routeParams,
  ]);

  useEffect(() => {
    if (!isFocused || !resolvedRoomIdOk || !resolvedRoomId) return;

    const payload = getPendingEditedImagePayload();
    const uri = String(payload?.uri ?? '').trim();
    if (!payload || !uri) return;

    const bridgeRoomId = normalizeBridgeRoomId(payload.roomId);
    if (bridgeRoomId && bridgeRoomId !== Number(resolvedRoomId)) return;

    const width = Number(payload.width ?? 0);
    const height = Number(payload.height ?? 0);
    const sourceMessageId = String(payload.sourceMessageId ?? '').trim();
    const dedupeKey = `${resolvedRoomId}:${uri}:${sourceMessageId}:${width}:${height}`;

    if (mediaViewerEditedImageDedupeRef.current === dedupeKey) return;
    mediaViewerEditedImageDedupeRef.current = dedupeKey;
    mediaViewerEditedImageRef.current = null;
    clearMediaViewerNavigationParams();

    const rawName = uri.split('/').pop()?.split('?')[0] || 'edited_image.jpg';
    const filename = rawName.includes('.') ? rawName : `${rawName}.jpg`;

    const picked: PickedAsset = {
      uri,
      filename,
      fileName: filename,
      type: 'image',
      mimeType: 'image/jpeg',
      width: Number.isFinite(width) && width > 0 ? width : undefined,
      height: Number.isFinite(height) && height > 0 ? height : undefined,
      isVideo: false,
      durationSec: null,
    } as any;

    requestAnimationFrame(() => {
      handleSendSelectedMedia([picked], false)
        .then(() => {
          showSecureStatus(chatText('chat:bridge.editedImageSent', '편집한 이미지를 전송했습니다.'));
        })
        .catch((error: unknown) => {
          console.warn('[media-viewer/edit-resend] failed', error);
          mediaViewerEditedImageDedupeRef.current = '';
          showSecureStatus(chatText('chat:bridge.editedImageSendFail', '편집한 이미지를 전송하지 못했습니다.'));
        });
    });
  }, [
    clearMediaViewerNavigationParams,
    getPendingEditedImagePayload,
    handleSendSelectedMedia,
    isFocused,
    resolvedRoomId,
    resolvedRoomIdOk,
    showSecureStatus,
  ]);

  return {
    handleMessageFocusHandled,
  } as const;
}
