import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

type ChatPushNavParams = {
  roomId: number;
  title?: string;
  roomType?: string;
  beaconId?: string;
};

type PendingNavigation =
  | {
      name: 'Chat';
      params: ChatPushNavParams;
    }
  | {
      name: 'FriendList';
      params?: {
        source?: string;
      };
    }
  | {
      name: 'PostDetail';
      params: {
        postId: string;
      };
    }
  | {
      name: 'BeaconDetail';
      params: {
        beaconId: string;
      };
    }
  | {
      name: 'MembersBeacon';
      params: {
        beaconId: string;
      };
    };

export const navigationRef = createNavigationContainerRef<any>();

let pendingNavigation: PendingNavigation | null = null;

function trimText(value: unknown): string {
  return String(value ?? '').trim();
}

function decodeSafe(value: string | null | undefined): string {
  const raw = trimText(value);
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeRoomType(roomType: string | undefined): string | undefined {
  const value = trimText(roomType).toLowerCase();
  if (!value) return undefined;
  if (value === 'dm' || value === 'direct' || value === 'personal' || value === 'private') {
    return 'dm';
  }
  if (value === 'group' || value === 'grp') {
    return 'group';
  }
  if (value === 'open' || value === 'public') {
    return 'open';
  }
  if (value === 'beacon') {
    return 'beacon';
  }
  if (value === 'self') {
    return 'self';
  }
  return roomType;
}

function dispatchNavigation(next: PendingNavigation) {
  navigationRef.dispatch(
    CommonActions.navigate({
      name: next.name,
      ...(next.params ? { params: next.params } : {}),
    }),
  );
}

function navigateOrQueue(next: PendingNavigation) {
  if (navigationRef.isReady()) {
    dispatchNavigation(next);
    return;
  }

  pendingNavigation = next;
}

export function navigateToChatFromPush(params: ChatPushNavParams) {
  if (!Number.isFinite(Number(params.roomId)) || Number(params.roomId) <= 0) return;

  const nextParams: ChatPushNavParams = {
    roomId: Number(params.roomId),
    title: params.title ?? '채팅',
    roomType: normalizeRoomType(params.roomType),
    ...(params.beaconId ? { beaconId: params.beaconId } : {}),
  };

  navigateOrQueue({
    name: 'Chat',
    params: nextParams,
  });
}

export function navigateToPostDetailFromPush(postId: string | number) {
  const normalized = trimText(postId);
  if (!normalized) return;

  navigateOrQueue({
    name: 'PostDetail',
    params: {
      postId: normalized,
    },
  });
}

export function navigateToBeaconDetailFromPush(beaconId: string | number) {
  const normalized = trimText(beaconId);
  if (!normalized) return;

  navigateOrQueue({
    name: 'BeaconDetail',
    params: {
      beaconId: normalized,
    },
  });
}


export function navigateToFriendRequestsFromPush() {
  navigateOrQueue({
    name: 'FriendList',
    params: {
      source: 'push',
    },
  });
}

function parsePositiveInt(value: string | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function readFirstSearchParam(params: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && trimText(value)) return trimText(value);
  }
  return '';
}

function pathSegments(parsed: URL): string[] {
  return parsed.pathname
    .split('/')
    .map((segment) => decodeSafe(segment))
    .filter(Boolean);
}

function parseChatDeepLink(parsed: URL): PendingNavigation | null {
  const host = trimText(parsed.host).toLowerCase();
  const segments = pathSegments(parsed);
  const firstPath = trimText(segments[0]).toLowerCase();

  const isChatHost = host === 'chat';
  const isPushChat = host === 'push' && firstPath === 'chat';
  if (!isChatHost && !isPushChat) return null;

  const roomIdCandidate = isPushChat
    ? trimText(segments[1]) || readFirstSearchParam(parsed.searchParams, ['roomId', 'room_id', 'id'])
    : trimText(segments[0]) || readFirstSearchParam(parsed.searchParams, ['roomId', 'room_id', 'id']);

  const roomId = parsePositiveInt(roomIdCandidate);
  if (!roomId) return null;

  const beaconId = readFirstSearchParam(parsed.searchParams, ['beaconId', 'beacon_id']);

  return {
    name: 'Chat',
    params: {
      roomId,
      title: readFirstSearchParam(parsed.searchParams, ['title']) || '채팅',
      roomType: normalizeRoomType(readFirstSearchParam(parsed.searchParams, ['roomType', 'room_type']) || undefined),
      ...(beaconId ? { beaconId } : {}),
    },
  };
}

function parsePostDeepLink(parsed: URL): PendingNavigation | null {
  const host = trimText(parsed.host).toLowerCase();
  const segments = pathSegments(parsed);
  const firstPath = trimText(segments[0]).toLowerCase();

  const isPostHost = host === 'post';
  const isPushPost = host === 'push' && firstPath === 'post';
  if (!isPostHost && !isPushPost) return null;

  const postId = isPushPost
    ? trimText(segments[1]) || readFirstSearchParam(parsed.searchParams, ['postId', 'post_id', 'id'])
    : trimText(segments[0]) || readFirstSearchParam(parsed.searchParams, ['postId', 'post_id', 'id']);

  if (!postId) return null;

  return {
    name: 'PostDetail',
    params: { postId },
  };
}

function parseBeaconDeepLink(parsed: URL): PendingNavigation | null {
  const host = trimText(parsed.host).toLowerCase();
  const segments = pathSegments(parsed);
  const firstPath = trimText(segments[0]).toLowerCase();

  const isBeaconHost = host === 'beacon';
  const isPushBeacon = host === 'push' && firstPath === 'beacon';
  if (!isBeaconHost && !isPushBeacon) return null;

  const beaconId = isPushBeacon
    ? trimText(segments[1]) || readFirstSearchParam(parsed.searchParams, ['beaconId', 'beacon_id', 'id'])
    : trimText(segments[0]) || readFirstSearchParam(parsed.searchParams, ['beaconId', 'beacon_id', 'id']);

  if (!beaconId) return null;

  const membersSegment = isPushBeacon ? trimText(segments[2]).toLowerCase() : trimText(segments[1]).toLowerCase();
  if (membersSegment === 'members') {
    return {
      name: 'MembersBeacon',
      params: { beaconId },
    };
  }

  return {
    name: 'BeaconDetail',
    params: { beaconId },
  };
}

function parseFriendDeepLink(parsed: URL): PendingNavigation | null {
  const host = trimText(parsed.host).toLowerCase();
  const segments = pathSegments(parsed).map((segment) => segment.toLowerCase());

  const isLegacyFriendRequestLink =
    (host === 'friends' && segments[0] === 'requests') ||
    (host === 'push' && segments[0] === 'friends' && segments[1] === 'requests');

  if (!isLegacyFriendRequestLink) return null;

  return {
    name: 'FriendList',
    params: {
      source: 'push',
    },
  };
}

function parseDeepLink(url: string | null | undefined): PendingNavigation | null {
  const rawUrl = trimText(url);
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (scheme !== 'coonn') return null;

    return (
      parseChatDeepLink(parsed) ||
      parsePostDeepLink(parsed) ||
      parseBeaconDeepLink(parsed) ||
      parseFriendDeepLink(parsed)
    );
  } catch {
    return null;
  }
}

export function navigateByDeepLink(url: string | null | undefined): boolean {
  const parsed = parseDeepLink(url);
  if (!parsed) return false;

  navigateOrQueue(parsed);
  return true;
}

export function flushPendingPushNavigation() {
  if (!pendingNavigation) return;
  if (!navigationRef.isReady()) return;

  const next = pendingNavigation;
  pendingNavigation = null;
  dispatchNavigation(next);
}
