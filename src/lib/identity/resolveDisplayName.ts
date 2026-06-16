export type DisplayNameContext = 'public' | 'friend' | 'chat' | 'business' | 'profile';

export type ResolveDisplayNameInput = {
  alias?: string | null;
  nickname?: string | null;
  followId?: string | null;
  follow_id?: string | null;
  /**
   * Compatibility only. friend_code is a private/search identifier and must never
   * be exposed as a display-name fallback.
   */
  friendCode?: string | null;
  friend_code?: string | null;
  isFriendByMe?: boolean | null;
  isSelf?: boolean | null;
  context?: DisplayNameContext;
  fallback?: string;
};

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
};

export function resolvePersonDisplayName(input: ResolveDisplayNameInput): string {
  const alias = clean(input.alias);
  const nickname = clean(input.nickname);
  const followId = clean(input.followId ?? input.follow_id);
  const fallback = clean(input.fallback) ?? '알 수 없음';

  if (input.isSelf) {
    return nickname ?? followId ?? fallback;
  }

  const isFriendContext = Boolean(
    input.isFriendByMe ||
      input.context === 'friend' ||
      input.context === 'chat',
  );

  if (isFriendContext) {
    return alias ?? nickname ?? followId ?? fallback;
  }

  return followId ?? nickname ?? fallback;
}

export function resolveBusinessDisplayName(input: {
  businessName?: string | null;
  authorName?: string | null;
  fallback?: string;
}): string {
  return clean(input.businessName) ?? clean(input.authorName) ?? clean(input.fallback) ?? '비즈니스';
}

export function getProfileObject<T extends Record<string, any>>(profile: T | T[] | null | undefined): T | null {
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile ?? null;
}
