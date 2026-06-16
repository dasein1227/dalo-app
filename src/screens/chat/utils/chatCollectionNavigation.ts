export const CHAT_COLLECTION_ROUTE_CANDIDATES = [
  "ChatCollection",
  "Collection",
  "ChatRoomCollection",
  "ChatCollectionScreen",
] as const;

export function navigateToChatCollectionNotices(
  navigation: any,
  params: Record<string, any>,
): boolean {
  let cursor = navigation;

  while (cursor) {
    try {
      const routeNames = cursor.getState?.()?.routeNames;
      if (Array.isArray(routeNames)) {
        for (const routeName of CHAT_COLLECTION_ROUTE_CANDIDATES) {
          if (routeNames.includes(routeName)) {
            cursor.navigate(routeName, params);
            return true;
          }
        }
      }
    } catch {}

    try {
      cursor = cursor.getParent?.();
    } catch {
      cursor = null;
    }
  }

  return false;
}
