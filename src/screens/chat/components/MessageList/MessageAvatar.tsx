import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const AVATAR_SIZE = 34;
const AVATAR_GAP = 8;
const AVATAR_SLOT_W = AVATAR_SIZE + AVATAR_GAP;
const MAX_AVATAR_SOURCE_CACHE = 420;
const MAX_AVATAR_PREFETCH_CACHE = 420;

type AvatarSource = { uri: string };

const sourceCache = new Map<string, AvatarSource>();
const prefetchedUris = new Set<string>();

function normalizeUri(uri: string | null | undefined): string | null {
  const next = typeof uri === 'string' ? uri.trim() : '';
  return next.length > 0 ? next : null;
}

function getCachedAvatarSource(uri: string): AvatarSource {
  const cached = sourceCache.get(uri);
  if (cached) {
    sourceCache.delete(uri);
    sourceCache.set(uri, cached);
    return cached;
  }

  const next = { uri };
  sourceCache.set(uri, next);
  while (sourceCache.size > MAX_AVATAR_SOURCE_CACHE) {
    const oldest = sourceCache.keys().next().value;
    if (!oldest) break;
    sourceCache.delete(oldest);
  }
  return next;
}

function rememberPrefetchedUri(uri: string): boolean {
  if (prefetchedUris.has(uri)) return false;
  prefetchedUris.add(uri);
  while (prefetchedUris.size > MAX_AVATAR_PREFETCH_CACHE) {
    const oldest = prefetchedUris.values().next().value;
    if (!oldest) break;
    prefetchedUris.delete(oldest);
  }
  return true;
}

export type MessageAvatarProps = {
  maskOnly?: boolean;
  uri?: string | null;
  initial?: string | null;
  textColor: string;
};

function MessageAvatar({ maskOnly, uri, initial, textColor }: MessageAvatarProps) {
  const normalizedUri = normalizeUri(uri);
  const source = useMemo(() => (normalizedUri ? getCachedAvatarSource(normalizedUri) : null), [normalizedUri]);
  const label = useMemo(() => {
    const trimmed = typeof initial === 'string' ? initial.trim() : '';
    return trimmed.length > 0 ? trimmed.slice(0, 1) : '?';
  }, [initial]);

  useEffect(() => {
    if (!normalizedUri) return;
    if (!rememberPrefetchedUri(normalizedUri)) return;
    Image.prefetch(normalizedUri).catch(() => undefined);
  }, [normalizedUri]);

  if (maskOnly) {
    return <View style={styles.avatarSpacer} />;
  }

  if (source) {
    return <Image source={source} style={styles.avatarImg} fadeDuration={0} />;
  }

  return (
    <View style={styles.avatarFallback}>
      <Text style={[styles.avatarInitial, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export default React.memo(MessageAvatar, (prev, next) => (
  !!prev.maskOnly === !!next.maskOnly &&
  normalizeUri(prev.uri) === normalizeUri(next.uri) &&
  (prev.initial ?? '') === (next.initial ?? '') &&
  prev.textColor === next.textColor
));

const styles = StyleSheet.create({
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: '900',
  },
  avatarSpacer: {
    width: AVATAR_SLOT_W,
    height: AVATAR_SIZE,
  },
});
