import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

export type SenderProfileLite = {
  nickname: string | null;
  avatarUrl: string | null;
};

const PROFILE_TTL_MS = 5 * 60_000;

const __profileCache = new Map<string, { v: SenderProfileLite; at: number }>();
const __profileInflight = new Map<string, Promise<SenderProfileLite | null>>();

function normText(v: any): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function normalizeProfile(input: Partial<SenderProfileLite> | null | undefined): SenderProfileLite | null {
  if (!input) return null;
  const nickname = normText(input.nickname);
  const avatarUrl = normText(input.avatarUrl);
  if (!nickname && !avatarUrl) return null;
  return { nickname, avatarUrl };
}

function mergeProfiles(
  base: SenderProfileLite | null | undefined,
  incoming: SenderProfileLite | null | undefined,
): SenderProfileLite | null {
  const b = normalizeProfile(base);
  const i = normalizeProfile(incoming);
  if (!b && !i) return null;
  return {
    nickname: i?.nickname ?? b?.nickname ?? null,
    avatarUrl: i?.avatarUrl ?? b?.avatarUrl ?? null,
  };
}

function getCachedProfile(userId: string): SenderProfileLite | null {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  const hit = __profileCache.get(uid);
  if (!hit) return null;

  if (Date.now() - hit.at > PROFILE_TTL_MS) {
    __profileCache.delete(uid);
    return null;
  }

  return hit.v;
}

function setCachedProfile(userId: string, profile: SenderProfileLite | null) {
  const uid = String(userId ?? '').trim();
  const normalized = normalizeProfile(profile);
  if (!uid || !normalized) return;
  __profileCache.set(uid, { v: normalized, at: Date.now() });
}

function safeJsonParse(v?: any) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function pickStringDeep(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null;

  for (const key of keys) {
    const v = normText(obj?.[key]);
    if (v) return v;
  }

  const nestedCandidates = [
    obj?.sender,
    obj?.profile,
    obj?.user,
    obj?.owner,
    obj?.author,
    obj?.payload,
    obj?.data,
    obj?.meta,
    obj?.metadata,
    obj?.original,
  ];

  for (const nested of nestedCandidates) {
    if (!nested || typeof nested !== 'object') continue;
    for (const key of keys) {
      const v = normText(nested?.[key]);
      if (v) return v;
    }
  }

  return null;
}

export function pickNameFromMsg(msg: any, meta: any): string | null {
  const nameKeys = [
    'roomNickname',
    'room_nickname',
    'senderRoomNickname',
    'sender_room_nickname',
    'senderName',
    'sender_name',
    'nickname',
    'name',
    'display_name',
    'displayName',
    'user_name',
    'username',
  ];

  const candidates = [
    msg,
    msg?._raw,
    meta,
    safeJsonParse(msg?.meta),
    safeJsonParse(msg?.metadata),
    safeJsonParse(msg?.original),
  ];

  for (const candidate of candidates) {
    const hit = pickStringDeep(candidate, nameKeys);
    if (hit) return hit;
  }

  return null;
}

export function pickAvatarFromMsg(msg: any, meta: any): string | null {
  const avatarKeys = [
    'roomAvatarUrl',
    'room_avatar_url',
    'senderRoomAvatarUrl',
    'sender_room_avatar_url',
    'avatarUrl',
    'avatar_url',
    'photo_url',
    'profile_image',
    'profileImage',
    'image_url',
    'imageUrl',
    'avatar',
  ];

  const candidates = [
    msg,
    msg?._raw,
    meta,
    safeJsonParse(msg?.meta),
    safeJsonParse(msg?.metadata),
    safeJsonParse(msg?.original),
  ];

  for (const candidate of candidates) {
    const hit = pickStringDeep(candidate, avatarKeys);
    if (hit) return hit;
  }

  return null;
}

export function initialFromName(name?: string | null) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
}

export function readSenderProfileCache(userId: string): SenderProfileLite | null {
  return getCachedProfile(userId);
}

export function primeSenderProfileCache(userId: string, profile: SenderProfileLite | null) {
  setCachedProfile(userId, profile);
}

export async function fetchSenderProfileLiteCached(userId: string): Promise<SenderProfileLite | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  const cached = getCachedProfile(uid);
  if (cached) return cached;

  const inflight = __profileInflight.get(uid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      // roomSync.ts와 같은 스키마만 사용
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url')
        .eq('user_id', uid)
        .maybeSingle();

      if (error || !data) return null;

      const profile = normalizeProfile({
        nickname: data.nickname,
        avatarUrl: data.avatar_url,
      });

      if (profile) setCachedProfile(uid, profile);
      return profile;
    } catch {
      return null;
    } finally {
      __profileInflight.delete(uid);
    }
  })();

  __profileInflight.set(uid, p);
  return p;
}

type UseSenderIdentityArgs = {
  msg: any;
  meta: any;
  senderIdStr: string;
  isMe: boolean;
  maskOnly: boolean;
  scrollingRef?: React.MutableRefObject<boolean>;
  injectedProfile?: SenderProfileLite | null;
  disableFetch?: boolean;
};

export function useSenderIdentity(opts: UseSenderIdentityArgs) {
  const { t } = useTranslation('chat');
  const { msg, meta, senderIdStr, isMe, maskOnly, injectedProfile, disableFetch } = opts;

  const embeddedProfile = useMemo<SenderProfileLite | null>(() => {
    return normalizeProfile({
      nickname: pickNameFromMsg(msg, meta),
      avatarUrl: pickAvatarFromMsg(msg, meta),
    });
  }, [msg, meta]);

  const injectedNormalized = useMemo(
    () => normalizeProfile(injectedProfile ?? null),
    [injectedProfile],
  );

  const cachedProfile = useMemo(() => {
    if (!senderIdStr) return null;
    return getCachedProfile(senderIdStr);
  }, [senderIdStr]);

  const initialProfile = useMemo(
    () => mergeProfiles(cachedProfile, mergeProfiles(embeddedProfile, injectedNormalized)),
    [cachedProfile, embeddedProfile, injectedNormalized],
  );

  const [resolvedProfile, setResolvedProfile] = useState<SenderProfileLite | null>(initialProfile);

  useEffect(() => {
    setResolvedProfile((prev) => mergeProfiles(prev, initialProfile));
  }, [initialProfile]);

  useEffect(() => {
    if (!senderIdStr) return;
    const bestKnown = mergeProfiles(embeddedProfile, injectedNormalized);
    if (bestKnown) {
      setCachedProfile(senderIdStr, bestKnown);
    }
  }, [senderIdStr, embeddedProfile, injectedNormalized]);

  useEffect(() => {
    if (isMe) return;
    if (maskOnly) return;
    if (!senderIdStr) return;

    // injectedProfile가 null인데 disableFetch=true로 들어오는 케이스도 살린다
    const hardDisableFetch =
      disableFetch === true &&
      injectedProfile !== undefined &&
      injectedProfile !== null;

    if (hardDisableFetch) return;

    const current = mergeProfiles(
      getCachedProfile(senderIdStr),
      mergeProfiles(embeddedProfile, injectedNormalized),
    );

    const hasEnough =
      !!current?.nickname &&
      !!current?.avatarUrl;

    if (hasEnough) {
      setResolvedProfile((prev) => mergeProfiles(prev, current));
      return;
    }

    let cancelled = false;

    (async () => {
      const fetched = await fetchSenderProfileLiteCached(senderIdStr);
      if (cancelled || !fetched) return;
      setResolvedProfile((prev) => mergeProfiles(prev, fetched));
    })();

    return () => {
      cancelled = true;
    };
  }, [
    senderIdStr,
    isMe,
    maskOnly,
    disableFetch,
    injectedProfile,
    embeddedProfile,
    injectedNormalized,
  ]);

  const senderDisplayName = useMemo(() => {
    if (isMe) return null;
    return (
      normText(resolvedProfile?.nickname) ||
      normText(embeddedProfile?.nickname) ||
      t('replyPreview.peer')
    );
  }, [isMe, resolvedProfile, embeddedProfile, t]);

  const senderAvatarUri = useMemo(() => {
    if (isMe) return null;
    return (
      normText(resolvedProfile?.avatarUrl) ||
      normText(embeddedProfile?.avatarUrl) ||
      null
    );
  }, [isMe, resolvedProfile, embeddedProfile]);

  const senderAvatarInitial = useMemo(
    () => initialFromName(senderDisplayName),
    [senderDisplayName],
  );

  return { senderDisplayName, senderAvatarUri, senderAvatarInitial };
}