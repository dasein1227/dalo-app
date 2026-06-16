import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import type { MessageLinkPreview } from '../utils/resolveLinkPreview';

type Props = {
  preview: MessageLinkPreview;
  skeleton?: boolean;
  maskOnly?: boolean;
  isMe?: boolean;
  theme: ChatTheme;
  interactionLocked?: boolean;
  onLongPress?: () => void;
};

function normalizeOneLine(s?: string | null) {
  const raw = String(s ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

function hostFromUrl(u?: string | null) {
  try {
    return new URL(u || '').host || '';
  } catch {
    return '';
  }
}

function extractSearchQueryFromUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    const keys = ['query', 'q', 'keyword', 'search', 'searchTerm', 'term', 'text', 'k', 'wd', 'word'];
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v && v.trim()) return v.trim();
    }
    const path = decodeURIComponent(url.pathname || '');
    const parts = path.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => /^(search|find|query|s)$/i.test(p));
    if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim();
    return '';
  } catch {
    return '';
  }
}

function looksLikeSearchResultUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return false;
  try {
    const url = new URL(s);
    const p = (url.pathname || '').toLowerCase();
    if (/(search|query|find|result)/i.test(p)) return true;
    return !!(
      url.searchParams.get('query') ||
      url.searchParams.get('q') ||
      url.searchParams.get('keyword') ||
      url.searchParams.get('search') ||
      url.searchParams.get('wd') ||
      url.searchParams.get('word')
    );
  } catch {
    return false;
  }
}

function serviceNameFromUrl(u: string | null | undefined, t: (key: string) => string) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    const host = (url.hostname || '').toLowerCase();
    if (host === 'naver.com' || host.endsWith('.naver.com')) return t('chat:linkPreview.provider.naver');
    if (host === 'google.com' || host.endsWith('.google.com')) return t('chat:linkPreview.provider.google');
    if (host === 'daum.net' || host.endsWith('.daum.net')) return t('chat:linkPreview.provider.daum');
    if (host === 'bing.com') return 'Bing';
    return hostFromUrl(s) || '';
  } catch {
    return '';
  }
}

async function openUrl(url: string) {
  const u = String(url ?? '').trim();
  if (!u) return;
  try {
    const can = await Linking.canOpenURL(u);
    if (can) await Linking.openURL(u);
  } catch {}
}

export function LinkPreviewCard({
  preview,
  skeleton = false,
  maskOnly = false,
  isMe = false,
  theme,
  interactionLocked = false,
  onLongPress,
}: Props) {
  void theme;
  const { t } = useTranslation();
  const { width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.min(294, Math.max(236, Math.floor(viewportWidth * 0.68)));
  const mediaHeight = Math.max(112, Math.min(126, Math.round(cardWidth * 0.43)));
  const titleBase =
    normalizeOneLine(preview.title ?? '') ||
    normalizeOneLine(preview.site_name ?? '') ||
    hostFromUrl(preview.url) ||
    t('chat:linkPreview.link')

  const isSearch = looksLikeSearchResultUrl(preview.url);
  const q = extractSearchQueryFromUrl(preview.url);
  const provider = serviceNameFromUrl(preview.url, t);

  const title = isSearch && q
    ? provider
      ? t('chat:linkPreview.searchTitleWithProvider', { query: q, provider })
      : t('chat:linkPreview.searchTitle', { query: q })
    : titleBase;
  const descBase = normalizeOneLine(preview.description ?? '');
  const desc = isSearch && q
    ? provider
      ? t('chat:linkPreview.searchResultWithProvider', { query: q, provider })
      : t('chat:linkPreview.searchResult', { query: q })
    : descBase;
  const site = hostFromUrl(preview.url) || normalizeOneLine(preview.site_name ?? '') || t('chat:linkPreview.web');

  const cardBg = maskOnly ? 'transparent' : '#FFFFFF';
  const textColor = maskOnly ? 'transparent' : '#0F1115';
  const subColor = maskOnly ? 'transparent' : 'rgba(15,17,21,0.72)';
  const siteColor = maskOnly ? 'transparent' : 'rgba(15,17,21,0.50)';
  const bubbleCorner = 18;
  const tailCorner = 8;
  const lpRadiusStyle = isMe
    ? { borderTopRightRadius: tailCorner, borderTopLeftRadius: bubbleCorner }
    : { borderTopLeftRadius: tailCorner, borderTopRightRadius: bubbleCorner };

  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    setImgOk(true);
  }, [preview.url, preview.image]);

  const hasImage = !skeleton && !!preview.image && imgOk && !maskOnly;

  return (
    <Pressable
      disabled={maskOnly || skeleton || interactionLocked}
      onPress={interactionLocked ? undefined : () => openUrl(preview.url)}
      onLongPress={maskOnly || skeleton || interactionLocked ? undefined : onLongPress}
      delayLongPress={220}
      hitSlop={6}
      style={[styles.lpCard, lpRadiusStyle, { width: cardWidth, backgroundColor: cardBg }]}
    >
      <View style={[styles.lpMedia, lpRadiusStyle, { width: cardWidth, height: mediaHeight }]}>
        {skeleton ? (
          <View style={styles.lpMediaSkeleton} />
        ) : hasImage ? (
          <Image
            source={{ uri: preview.image as string }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <View style={styles.lpMediaFallback}>
            <Text style={[styles.lpMediaFallbackText, { color: siteColor }]} numberOfLines={1} ellipsizeMode="tail">
              {site}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.lpTextArea}>
        <Text style={[styles.lpTitle, { color: textColor }]} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>

        {skeleton ? (
          <View style={styles.lpSkeletonLines}>
            <View style={styles.lpSkeletonLine} />
            <View style={[styles.lpSkeletonLine, { width: '70%' }]} />
          </View>
        ) : (
          <Text style={[styles.lpDesc, { color: subColor }, !desc ? { opacity: 0 } : null]} numberOfLines={2} ellipsizeMode="tail">
            {desc || ' '}
          </Text>
        )}

        <Text style={[styles.lpSite, { color: siteColor }]} numberOfLines={1} ellipsizeMode="tail">
          {site}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lpCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  lpMedia: {
    height: 126,
    backgroundColor: 'rgba(0,0,0,0.055)',
  },
  lpMediaSkeleton: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.055)',
  },
  lpMediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  lpMediaFallbackText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  lpTextArea: {
    minHeight: 92,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
  },
  lpTitle: {
    fontSize: 13.4,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: -0.12,
  },
  lpDesc: {
    marginTop: 5,
    fontSize: 12.2,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: -0.06,
    minHeight: 32,
  },
  lpSite: {
    marginTop: 7,
    fontSize: 11.2,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: -0.04,
  },
  lpSkeletonLines: {
    marginTop: 7,
    gap: 6,
  },
  lpSkeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
    width: '92%',
  },
});
