// src/lib/chatSync/chunkLoader.ts

import { Q } from '@nozbe/watermelondb';
import { database } from '../chatDB/database';
import Message from '../chatDB/models/Message';

export type LocalChunk = {
  messages: Message[];
  hasMore: boolean;
  nextCursor: number | null; // created_at timestamp ms 기준
};

const DEFAULT_CHUNK_SIZE = 50;

/**
 * 최신 메시지 chunk (DESC → UI에서는 inverted로 쓸 예정)
 */
export async function loadLatestChunk(
  roomId: number,
  limit: number = DEFAULT_CHUNK_SIZE,
): Promise<LocalChunk> {
  const messagesCollection = database.get<Message>('messages');

  const msgs = await messagesCollection
    .query(Q.where('room_id', roomId), Q.sortBy('created_at', 'desc'), Q.take(limit))
    .fetch();

  if (!msgs.length) {
    return {
      messages: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const oldest = msgs[msgs.length - 1];
  const nextCursor = oldest.createdAt;

  // 이 room에 더 오래된 메시지가 있는지 확인
  const olderExists = await messagesCollection
    .query(
      Q.where('room_id', roomId),
      Q.where('created_at', Q.lt(nextCursor)),
      Q.take(1),
    )
    .fetch();

  return {
    messages: msgs,
    hasMore: olderExists.length > 0,
    nextCursor,
  };
}

/**
 * 과거 chunk 로딩: cursor(=created_at ms) 보다 이전 메시지 DESC로 가져옴
 */
export async function loadOlderChunk(
  roomId: number,
  cursor: number,
  limit: number = DEFAULT_CHUNK_SIZE,
): Promise<LocalChunk> {
  const messagesCollection = database.get<Message>('messages');

  const msgs = await messagesCollection
    .query(
      Q.where('room_id', roomId),
      Q.where('created_at', Q.lt(cursor)),
      Q.sortBy('created_at', 'desc'),
      Q.take(limit),
    )
    .fetch();

  if (!msgs.length) {
    return {
      messages: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const oldest = msgs[msgs.length - 1];
  const nextCursor = oldest.createdAt;

  const olderExists = await messagesCollection
    .query(
      Q.where('room_id', roomId),
      Q.where('created_at', Q.lt(nextCursor)),
      Q.take(1),
    )
    .fetch();

  return {
    messages: msgs,
    hasMore: olderExists.length > 0,
    nextCursor,
  };
}
