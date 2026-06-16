import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { renderHighlightedText } from '../../../utils/textHighlight';
import { LinkPreviewCard } from './LinkPreviewCard';
import { Lock } from 'lucide-react-native';
import { ensureLinkPreviewThumbnailCached, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

type SecureState = 'locked' | 'unlocking' | 'unlocked' | 'error';

type Props = {
  isMe: boolean;
  maskOnly?: boolean;
  selectionMode?: boolean;
  interactionLocked?: boolean;
  theme: ChatTheme;
  searchQuery?: string;
  replyBlockNode?: React.ReactNode;
  dividerColor: string;
  displayText?: string | null;
  dispForText?: string | null;
  textIsOnlyUrl?: boolean;
  clickableUrlOnly?: boolean;
  shouldShowSkeleton?: boolean;
  showLPCard?: boolean;
  msgUrlFromText?: string | null;
  effectivePreview?: any;
  roomId?: number | string | null;
  isLoading?: boolean;
  isTranslating?: boolean;
  translatingIndicator?: React.ReactNode;
  secureState?: SecureState;
  lockedLabel?: string;
  renderBubbleShell: (
    children: React.ReactNode,
    radius?: number,
    maxWidth?: number,
    paddingH?: number,
    paddingV?: number,
    pill?: boolean,
    bgOverride?: string,
  ) => React.ReactNode;
  onLongPress?: () => void;
  onOpenUrl?: (url: string) => void | Promise<void>;
};

function hostFromUrl(u?: string | null) {
  try {
    return new URL(u || '').host || '';
  } catch {
    return '';
  }
}

function SecureFixedLinkCard({
  preview,
  isMe,
  maskOnly,
  theme,
  linkLabel,
}: {
  preview: any;
  isMe: boolean;
  maskOnly?: boolean;
  theme: ChatTheme;
  linkLabel: string;
}) {
  const url = String(preview?.url ?? '').trim();
  const host = String(preview?.site_name ?? '').trim() || hostFromUrl(url) || linkLabel;
  const title = String(preview?.title ?? '').trim() || host;
  const fg = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  const sub = maskOnly ? 'transparent' : 'rgba(100,116,139,0.86)';

  return (
    <View style={styles.secureLinkCard}>
      <View style={styles.secureLinkThumb}>
        <Text numberOfLines={1} style={styles.secureLinkThumbText}>{host}</Text>
      </View>
      <View style={styles.secureLinkBody}>
        <Text numberOfLines={1} style={[styles.secureLinkTitle, { color: fg }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.secureLinkHost, { color: sub }]}>{host}</Text>
      </View>
    </View>
  );
}

function SecurePlaceholder({
  isMe,
  dividerColor,
  replyBlockNode,
  renderBubbleShell,
  label,
  theme,
  fallbackLabel,
}: {
  isMe: boolean;
  dividerColor: string;
  replyBlockNode?: React.ReactNode;
  renderBubbleShell: Props['renderBubbleShell'];
  label: string;
  theme: ChatTheme;
  fallbackLabel: string;
}) {
  const tint = isMe ? theme.myText : theme.opponentText;
  const cleanLabel = String(label ?? '').replace(/^[\s🔐🔒]+/g, '').trim() || fallbackLabel;

  return renderBubbleShell(
    <>
      {!!replyBlockNode && (
        <>
          {replyBlockNode}
          <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />
        </>
      )}
      <View style={styles.secureWrap}>
        <View style={styles.secureTitleRow}>
          <Lock size={15} color={tint} strokeWidth={2} style={styles.secureLockIcon} />
          <Text style={[styles.secureTitle, { color: tint }]}>{cleanLabel}</Text>
        </View>
      </View>
    </>,
    18,
    undefined,
    12,
    8,
  );
}

export function MessageTextBody({
  isMe,
  maskOnly = false,
  selectionMode = false,
  interactionLocked = false,
  theme,
  searchQuery,
  replyBlockNode,
  dividerColor,
  displayText,
  dispForText,
  textIsOnlyUrl = false,
  clickableUrlOnly = false,
  shouldShowSkeleton = false,
  showLPCard = false,
  msgUrlFromText,
  effectivePreview,
  roomId,
  translatingIndicator,
  secureState,
  lockedLabel,
  renderBubbleShell,
  onLongPress,
  onOpenUrl,
}: Props) {
  const { t } = useTranslation();
  const linkLabel = t('chat:messageBody.link');
  const lockedDisplayLabel = lockedLabel ?? t('chat:messageBody.secureMessage');
  const textColor = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  const disp = String(displayText ?? '').trim();
  const showPreviewBlock = shouldShowSkeleton || showLPCard;
  const previewImageUrl = useMemo(() => {
    const raw = String(effectivePreview?.image ?? '').trim();
    return isRemoteHttpUrl(raw) ? raw : '';
  }, [effectivePreview?.image]);
  const [cachedPreviewImage, setCachedPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCachedPreviewImage(null);

    if (!previewImageUrl || maskOnly || secureState === 'locked' || secureState === 'unlocking' || secureState === 'error') {
      return () => {
        cancelled = true;
      };
    }

    ensureLinkPreviewThumbnailCached(previewImageUrl, {
      roomId,
      cacheKey: `link-preview:${previewImageUrl}`,
      assetType: 'link',
    })
      .then((localUri) => {
        if (!cancelled && localUri && localUri !== previewImageUrl) {
          setCachedPreviewImage(localUri);
        }
      })
      .catch(() => {
        // Link preview cache is a performance optimization only.
        // Remote preview image rendering must continue even if local caching fails.
      });

    return () => {
      cancelled = true;
    };
  }, [maskOnly, previewImageUrl, roomId, secureState]);

  const previewForRender = useMemo(() => {
    if (!effectivePreview || !cachedPreviewImage) return effectivePreview;
    return { ...effectivePreview, image: cachedPreviewImage, remote_image: previewImageUrl };
  }, [cachedPreviewImage, effectivePreview, previewImageUrl]);

  if (secureState === 'locked' || secureState === 'unlocking' || secureState === 'error') {
    const bubble = (
      <SecurePlaceholder
        isMe={isMe}
        dividerColor={dividerColor}
        replyBlockNode={replyBlockNode}
        renderBubbleShell={renderBubbleShell}
        label={lockedDisplayLabel}
        theme={theme}
        fallbackLabel={t('chat:messageBody.secureMessage')}
      />
    );
    if (selectionMode || maskOnly) return <View pointerEvents="none">{bubble}</View>;
    return (
      <Pressable
        onLongPress={interactionLocked ? undefined : onLongPress}
        delayLongPress={220}
        hitSlop={6}
      >
        {bubble}
      </Pressable>
    );
  }

  const innerBubble = showPreviewBlock
    ? renderBubbleShell(
        <>
          {(!textIsOnlyUrl || !!replyBlockNode) && (
            <View style={styles.paddedBlock}>
              {replyBlockNode}
              {!!replyBlockNode && <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />}
              {!textIsOnlyUrl && !!dispForText && (
                <View>
                  {renderHighlightedText(
                    dispForText,
                    searchQuery || '',
                    StyleSheet.flatten([
                      styles.txt,
                      { color: textColor, textDecorationLine: clickableUrlOnly ? 'underline' : 'none' },
                    ]),
                    theme.searchMatchBg,
                  )}
                  {!!translatingIndicator && <View style={styles.indicatorWrap}>{translatingIndicator}</View>}
                </View>
              )}
            </View>
          )}
          {(!textIsOnlyUrl || !!replyBlockNode) && (
            <View style={[styles.replyDivider, { backgroundColor: dividerColor, marginBottom: 0 }]} />
          )}
          {shouldShowSkeleton ? (
            <LinkPreviewCard
              preview={{
                url: msgUrlFromText!,
                title: hostFromUrl(msgUrlFromText!) || linkLabel,
                site_name: hostFromUrl(msgUrlFromText!) || null,
              }}
              skeleton
              maskOnly={maskOnly}
              isMe={isMe}
              theme={theme}
              interactionLocked={interactionLocked}
              onLongPress={onLongPress}
            />
          ) : effectivePreview?.__secureFixedLinkCard ? (
            <SecureFixedLinkCard
              preview={previewForRender}
              isMe={isMe}
              maskOnly={maskOnly}
              theme={theme}
              linkLabel={linkLabel}
            />
          ) : (
            <LinkPreviewCard
              preview={previewForRender!}
              maskOnly={maskOnly}
              isMe={isMe}
              theme={theme}
              interactionLocked={interactionLocked}
              onLongPress={onLongPress}
            />
          )}
        </>,
        18,
        undefined,
        0,
        0,
        false,
        maskOnly ? undefined : '#FFFFFF',
      )
    : renderBubbleShell(
        <>
          {replyBlockNode}
          {!!replyBlockNode && <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />}
          {!textIsOnlyUrl && !!dispForText && (
            <View>
              <Text style={[styles.txt, { color: textColor, textDecorationLine: clickableUrlOnly ? 'underline' : 'none' }]}>
                {dispForText}
              </Text>
              {!!translatingIndicator && <View style={styles.indicatorWrap}>{translatingIndicator}</View>}
            </View>
          )}
        </>,
        18,
        undefined,
        12,
        8,
      );

  if (selectionMode || maskOnly) return <View pointerEvents="none">{innerBubble}</View>;

  return (
    <Pressable
      onLongPress={interactionLocked ? undefined : onLongPress}
      delayLongPress={220}
      hitSlop={6}
      onPress={
        interactionLocked
          ? undefined
          : clickableUrlOnly && disp
            ? () => onOpenUrl?.(disp)
            : effectivePreview?.__secureFixedLinkCard && effectivePreview?.url
              ? () => onOpenUrl?.(String(effectivePreview.url))
              : undefined
      }
    >
      {innerBubble}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paddedBlock: { paddingHorizontal: 12, paddingVertical: 8 },
  txt: { fontSize: 15, lineHeight: 21 },
  indicatorWrap: { marginTop: 6 },
  replyDivider: { height: StyleSheet.hairlineWidth, marginBottom: 6, opacity: 0.9 },
  secureWrap: { alignSelf: 'flex-start' },
  secureTitleRow: { flexDirection: 'row', alignItems: 'center' },
  secureLockIcon: { marginRight: 5 },
  secureTitle: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '400' },
  secureLinkCard: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#FFFFFF' },
  secureLinkThumb: { height: 132, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECECEC' },
  secureLinkThumbText: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: 'rgba(100,116,139,0.72)' },
  secureLinkBody: { minHeight: 62, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  secureLinkTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  secureLinkHost: { marginTop: 8, fontSize: 13, lineHeight: 17, fontWeight: '700' },
});
