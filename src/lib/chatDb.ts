// src/lib/chatDb.ts
// 실제 단말 저장공간에 방별 JSON 파일로 메시지를 저장하는 로컬 DB 레이어.

import * as FileSystem from 'expo-file-system';

export type ChatDbMessage = {
  id: string;
  room_id: number;
  sender_id: string;
  content: string;
  original: string | null;
  created_at: string;
  kind: string | null;
};

// documentDirectory / cacheDirectory 타입 정의가 애매해서 any로 한 번 래핑
const FS: any = FileSystem;

// 기본 저장 폴더 (문서 디렉토리 없으면 cacheDirectory 사용)
const BASE_DIR: string =
  (FS.documentDirectory as string | null) ??
  (FS.cacheDirectory as string | null) ??
  '';

const CHAT_DIR = BASE_DIR + 'chat-cache/';

// 메모리 캐시 (앱 켜져 있는 동안)
const roomCache: Record<number, ChatDbMessage[]> = {};

let initPromise: Promise<void> | null = null;

// 내부용: 디렉토리 준비
async function ensureDir() {
  if (!BASE_DIR) return; // 웹 환경 등
  const info = await FileSystem.getInfoAsync(CHAT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CHAT_DIR, {
      intermediates: true,
    });
  }
}

// Chat.tsx에서 처음 한 번 호출
export async function initChatDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await ensureDir();
      } catch (e) {
        console.warn('initChatDb FileSystem error', e);
      }
    })();
  }
  return initPromise;
}

function roomPath(roomId: number) {
  return `${CHAT_DIR}room-${roomId}.json`;
}

// 방별 메시지 전체 가져오기
export async function getMessagesByRoom(
  roomId: number
): Promise<ChatDbMessage[]> {
  await initChatDb();

  // 1) 메모리 캐시 먼저
  if (roomCache[roomId]) {
    return roomCache[roomId];
  }

  // 2) 디스크에서 읽기
  try {
    const path = roomPath(roomId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return [];
    }

    const raw = await FileSystem.readAsStringAsync(path); // 기본 UTF-8

    if (!raw) return [];

    const parsed = JSON.parse(raw) as ChatDbMessage[];
    roomCache[roomId] = parsed;
    return parsed;
  } catch (e) {
    console.warn('getMessagesByRoom File error', e);
    return [];
  }
}

// 방별 메시지 전체 교체 (서버에서 fresh 데이터 받은 뒤 호출)
export async function replaceMessagesForRoom(
  roomId: number,
  rows: ChatDbMessage[]
): Promise<void> {
  await initChatDb();

  roomCache[roomId] = rows;

  if (!BASE_DIR) return;

  try {
    const path = roomPath(roomId);
    const json = JSON.stringify(rows);
    await FileSystem.writeAsStringAsync(path, json); // 기본 UTF-8
  } catch (e) {
    console.warn('replaceMessagesForRoom File error', e);
  }
}
