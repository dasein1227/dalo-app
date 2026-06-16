import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { ImageBundle } from '../ui/ImageBundle';
import { MessageAudioBubble } from '../ui/MessageAudioBubble';
import { useAudioMessageController } from '../hooks/useAudioMessageController';
import { MessageMapBubble } from '../ui/MessageMapBubble';
import { MessageTextBody } from '../ui/MessageTextBody';
import { useSecureMessageView } from '@/lib/chatSecurity/secureRuntimeStore';
import {
  MAX_BUBBLE_PX,
  buildSecureLinkPreview,
  isSecurePayloadRenderable,
  openUrl,
  safeSecureNum,
} from './MessageItemBody.shared';

type Props = {
  msg: any;
  singleAspect: number | null;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  searchQuery?: string;
  dividerColor: string;
  bubbleShadowStyle: any;
  roomIdNum: number;
  msgIdStr: string;
  rawContent: any;
  rawOriginal: any;
  meta: any;
  renderBubbleShell: any;
  openMessageActions: () => void;
  openMediaViewer: (type: 'image' | 'video', uri: string, bundleUris?: string[]) => void;
  onSingleImageLoad: (event: any) => void;
};


const MIN_STABLE_SECURE_IMAGE_ASPECT = 0.42;
const MAX_STABLE_SECURE_IMAGE_ASPECT = 3.2;

function clampSecureImageAspect(value: any): number | null {
  const n = safeSecureNum(value);
  if (n == null || n <= 0) return null;
  return Math.max(MIN_STABLE_SECURE_IMAGE_ASPECT, Math.min(MAX_STABLE_SECURE_IMAGE_ASPECT, n));
}

function buildSecureImageFrame(aspectLike: any) {
  const aspect = clampSecureImageAspect(aspectLike) ?? 1;
  const width = MAX_BUBBLE_PX;
  const height = Math.max(1, Math.round(width / aspect));
  return { width, height, aspect };
}

function normalizeSecureImageItem(item: any, frame: { width: number; height: number; aspect: number }) {
  const sourceWidth = safeSecureNum(item?.width);
  const sourceHeight = safeSecureNum(item?.height);
  return {
    ...item,
    width: sourceWidth ?? undefined,
    height: sourceHeight ?? undefined,
    aspect: frame.aspect,
    aspectRatio: frame.aspect,
    aspect_ratio: frame.aspect,
    displayWidth: frame.width,
    displayHeight: frame.height,
    renderWidth: frame.width,
    renderHeight: frame.height,
    cachePolicy: item?.cachePolicy ?? 'memory-disk',
    priority: item?.priority ?? 'high',
  };
}

type SecureAudioBodyProps = {
  uri: string;
  durationMs: number | null;
  msgIdStr: string;
  rawContent: any;
  rawOriginal: any;
  meta: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  bubbleShadowStyle: any;
  dividerColor: string;
  openMessageActions: () => void;
};

function SecureAudioBody({
  uri,
  durationMs,
  msgIdStr,
  rawContent,
  rawOriginal,
  meta,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  bubbleShadowStyle,
  dividerColor,
  openMessageActions,
}: SecureAudioBodyProps) {
  const { isPlaying, durMs, progress, toggleVoice } = useAudioMessageController({
    msgIdStr,
    rawContent,
    rawOriginal,
    maskOnly,
    meta,
  });

  return (
    <MessageAudioBubble
      uri={uri}
      isMe={isMe}
      maskOnly={maskOnly}
      selectionMode={selectionMode}
      interactionLocked={interactionLocked}
      theme={theme}
      bubbleShadowStyle={bubbleShadowStyle}
      replyBlockNode={null}
      dividerColor={dividerColor}
      durMs={durationMs ?? durMs}
      progress={progress}
      isPlaying={isPlaying}
      waveform={undefined}
      onToggleVoice={toggleVoice}
      onLongPress={openMessageActions}
    />
  );
}

function SecureMessageBody({
  msg,
  singleAspect,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  searchQuery,
  dividerColor,
  bubbleShadowStyle,
  roomIdNum,
  msgIdStr,
  rawContent,
  rawOriginal,
  meta,
  renderBubbleShell,
  openMessageActions,
  openMediaViewer,
  onSingleImageLoad,
}: Props) {
  const { t } = useTranslation();
  const secureView = useSecureMessageView(msg);
  const locationFallback = t('chat:messageBody.locationInfo');
  const secureFileFallback = t('chat:messageBody.secureFile');
  const linkFallback = t('chat:messageBody.link');

  const renderSecureLockedPlaceholder = () => (
    <MessageTextBody
      isMe={isMe}
      maskOnly={maskOnly}
      selectionMode={selectionMode}
      interactionLocked={interactionLocked}
      theme={theme}
      searchQuery={searchQuery}
      replyBlockNode={null}
      dividerColor={dividerColor}
      secureState="locked"
      lockedLabel={secureView.lockedLabel}
      roomId={roomIdNum}
      renderBubbleShell={renderBubbleShell}
      onLongPress={openMessageActions}
    />
  );

  const spRaw = secureView.payload;
  if (secureView.state !== 'unlocked' || !isSecurePayloadRenderable(spRaw)) {
    return renderSecureLockedPlaceholder();
  }
  const sp = spRaw;

  if (sp.kind === 'map' && sp.map) {
    return (
      <MessageMapBubble
        lat={Number(sp.map.lat)}
        lng={Number(sp.map.lng)}
        address={String(sp.map.label ?? locationFallback)}
        isMe={isMe}
        maskOnly={maskOnly}
        interactionLocked={interactionLocked || selectionMode}
        bubbleShadowStyle={bubbleShadowStyle}
        replyBlockNode={null}
        dividerColor={dividerColor}
        renderBubbleShell={renderBubbleShell}
      />
    );
  }

  if (sp.kind === 'image') {
    const items = (sp.attachments ?? [])
      .map((a: any) => ({
        uri: String(a.url ?? a.uri ?? '').trim(),
        width: safeSecureNum(a.width) ?? safeSecureNum(a.mediaWidth) ?? safeSecureNum(a.media_width) ?? undefined,
        height: safeSecureNum(a.height) ?? safeSecureNum(a.mediaHeight) ?? safeSecureNum(a.media_height) ?? undefined,
        aspect: safeSecureNum(a.aspect) ?? safeSecureNum(a.aspectRatio) ?? safeSecureNum(a.aspect_ratio) ?? undefined,
      }))
      .filter((a: any) => a.uri);
    if (items.length) {
      const first = items[0] as any;
      const payloadAspect =
        clampSecureImageAspect(first.aspect) ??
        (safeSecureNum(first.width) && safeSecureNum(first.height)
          ? clampSecureImageAspect(Number(first.width) / Number(first.height))
          : null) ??
        clampSecureImageAspect(singleAspect) ??
        1;
      const frame = buildSecureImageFrame(items.length === 1 ? payloadAspect : 1);
      const fixedItems = items.map((item: any) => normalizeSecureImageItem(item, frame));

      return (
        <View
          style={[
            styles.mediaContainer,
            styles.fixedMediaFrame,
            {
              width: frame.width,
              height: frame.height,
              maxWidth: frame.width,
            },
          ]}
        > 
          <ImageBundle
            items={fixedItems}
            maskOnly={maskOnly}
            interactionLocked={interactionLocked || selectionMode}
            theme={theme}
            bubbleShadowStyle={bubbleShadowStyle}
            onLongPress={openMessageActions}
            onOpenMediaViewer={openMediaViewer}
            singleAspect={frame.aspect}
            onSingleImageLoad={onSingleImageLoad}
          />
        </View>
      );
    }
  }

  if (sp.kind === 'audio' || sp.kind === 'file' || sp.kind === 'video') {
    const first = (sp.attachments ?? [])[0] as any;
    const uri = String(first?.url ?? '').trim();
    if (sp.kind === 'audio' && uri) {
      return (
        <SecureAudioBody
          uri={uri}
          durationMs={safeSecureNum(first?.durationMs)}
          msgIdStr={msgIdStr}
          rawContent={rawContent}
          rawOriginal={rawOriginal}
          meta={meta}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          bubbleShadowStyle={bubbleShadowStyle}
          dividerColor={dividerColor}
          openMessageActions={openMessageActions}
        />
      );
    }
    if (sp.kind === 'video' && uri) {
      const node = (
        <View style={[styles.mediaOuter, bubbleShadowStyle, { width: 300, height: 180, borderRadius: 18, backgroundColor: isMe ? theme.myBubble : theme.opponentBubble }]}> 
          <View style={[styles.mediaShell, { width: 300, height: 180, borderRadius: 18 }]} />
        </View>
      );
      return selectionMode || maskOnly ? node : (
        <Pressable onLongPress={interactionLocked ? undefined : openMessageActions} onPress={interactionLocked ? undefined : () => openMediaViewer('video', uri)}>
          {node}
        </Pressable>
      );
    }
    if (sp.kind === 'file' && uri) {
      return (
        <MessageTextBody
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          searchQuery={searchQuery}
          replyBlockNode={null}
          dividerColor={dividerColor}
          displayText={String(first?.fileName ?? secureFileFallback)}
          dispForText={String(first?.fileName ?? secureFileFallback)}
          textIsOnlyUrl={false}
          clickableUrlOnly={false}
          roomId={roomIdNum}
          renderBubbleShell={renderBubbleShell}
          onLongPress={openMessageActions}
        />
      );
    }
  }

  const firstLink = (sp.links ?? [])[0];
  const securePreview = buildSecureLinkPreview(firstLink?.url, firstLink?.title, linkFallback);
  return (
    <MessageTextBody
      isMe={isMe}
      maskOnly={maskOnly}
      selectionMode={selectionMode}
      interactionLocked={interactionLocked}
      theme={theme}
      searchQuery={searchQuery}
      replyBlockNode={null}
      dividerColor={dividerColor}
      secureState="unlocked"
      displayText={String(sp.text ?? '')}
      dispForText={String(sp.text ?? '')}
      textIsOnlyUrl={!!firstLink?.url && String(sp.text ?? '').trim() === String(firstLink?.url ?? '').trim()}
      clickableUrlOnly={!!firstLink?.url && String(sp.text ?? '').trim() === String(firstLink?.url ?? '').trim()}
      shouldShowSkeleton={false}
      showLPCard={!!securePreview}
      msgUrlFromText={firstLink?.url ?? null}
      effectivePreview={securePreview}
      roomId={roomIdNum}
      renderBubbleShell={renderBubbleShell}
      onLongPress={openMessageActions}
      onOpenUrl={openUrl}
    />
  );
}

const styles = StyleSheet.create({
  mediaContainer: { backgroundColor: 'transparent' },
  fixedMediaFrame: { overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-start' },
  mediaOuter: { overflow: 'visible' },
  mediaShell: { borderWidth: 0, overflow: 'hidden', padding: 2 },
});

export default React.memo(SecureMessageBody);
