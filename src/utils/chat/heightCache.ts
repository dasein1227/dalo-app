// src/utils/chat/heightCache.ts

/**
 * 메시지 버블 높이 캐싱 → 스크롤 튐 방지
 * createdAt + sender + content hash 기반 key
 */

const heightMap = new Map<string, number>();

function hashMessage(msg: {
  id: string;
  content: string;
  senderId: string;
  createdAt: number;
}) {
  return `${msg.id}_${msg.senderId}_${msg.createdAt}`;
}

export function storeHeight(
  msg: { id: string; content: string; senderId: string; createdAt: number },
  height: number,
) {
  const key = hashMessage(msg);
  heightMap.set(key, height);
}

export function getHeight(
  msg: { id: string; content: string; senderId: string; createdAt: number },
): number | null {
  const key = hashMessage(msg);
  return heightMap.get(key) ?? null;
}

export function clearHeightCache() {
  heightMap.clear();
}
