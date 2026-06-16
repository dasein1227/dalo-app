// src/utils/chat/resolveChatDisplayName.ts

const clean = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
};

export type ChatRoomKindForDisplayName =
  | 'dm'
  | 'direct'
  | 'group'
  | 'open'
  | 'open_group'
  | 'open_chat'
  | 'public'
  | 'public_group'
  | 'business'
  | string
  | null
  | undefined;

export type ResolveChatDisplayNameInput = {
  roomType?: ChatRoomKindForDisplayName;
  roomSubtype?: ChatRoomKindForDisplayName;
  roomKind?: ChatRoomKindForDisplayName;
  viewerUserId?: string | null;
  targetUserId?: string | null;
  followId?: string | null;
  friendAlias?: string | null;
  profileNickname?: string | null;
  profileFollowId?: string | null;
  roomNickname?: string | null;
};

export function isOpenRoomKind(roomType?: ChatRoomKindForDisplayName, roomSubtype?: ChatRoomKindForDisplayName): boolean {
  const values = [roomType, roomSubtype]
    .map((value) => clean(value)?.toLowerCase())
    .filter(Boolean);

  return values.some((value) =>
    value === 'open' ||
    value === 'open_group' ||
    value === 'open_chat' ||
    value === 'public' ||
    value === 'public_group' ||
    value === 'beacon' ||
    value === 'map',
  );
}

export function isBusinessRoomKind(roomType?: ChatRoomKindForDisplayName, roomSubtype?: ChatRoomKindForDisplayName): boolean {
  const values = [roomType, roomSubtype]
    .map((value) => clean(value)?.toLowerCase())
    .filter(Boolean);

  return values.some((value) => value === 'business' || value === 'biz' || value === 'business_dm');
}

export function resolveChatDisplayName(input: ResolveChatDisplayNameInput): string {
  if (isOpenRoomKind(input.roomType, input.roomSubtype) || isOpenRoomKind(input.roomKind)) {
    return clean(input.roomNickname) || '참가자';
  }

  if (isBusinessRoomKind(input.roomType, input.roomSubtype) || isBusinessRoomKind(input.roomKind)) {
    return clean(input.roomNickname) || '참가자';
  }

  return (
    clean(input.friendAlias) ||
    clean(input.profileNickname) ||
    clean(input.profileFollowId) ||
    '사용자'
  );
}

export type ResolveChatAvatarInput = {
  roomType?: ChatRoomKindForDisplayName;
  roomSubtype?: ChatRoomKindForDisplayName;
  roomKind?: ChatRoomKindForDisplayName;
  viewerUserId?: string | null;
  targetUserId?: string | null;
  followId?: string | null;
  profileAvatarUrl?: string | null;
  roomAvatarUrl?: string | null;
  roomAvatarVisible?: boolean | null;
};

export function resolveChatAvatarUrl(input: ResolveChatAvatarInput): string | null {
  if (isOpenRoomKind(input.roomType, input.roomSubtype) || isOpenRoomKind(input.roomKind)) {
    if (input.roomAvatarVisible === false) return null;
    return clean(input.roomAvatarUrl);
  }

  if (isBusinessRoomKind(input.roomType, input.roomSubtype)) {
    return clean(input.roomAvatarUrl) || null;
  }

  return clean(input.profileAvatarUrl);
}
