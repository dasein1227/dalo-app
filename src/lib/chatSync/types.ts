// src/lib/chatSync/types.ts

export type ChatMessageRow = {
  id: number;              // bigint
  room_id: number;
  sender_id: string;       // uuid

  // ✅ content = 최종 표시 텍스트 (번역 포함)
  //   - 기본적으로 화면에 찍히는 문자열
  //   - 원문만 있을 때는 원문과 동일할 수 있음
  content: string | null;

  // ✅ original = 사용자가 입력한 원문 (있을 때만)
  //   - mid/high 번역 기능에서 원문 보존용
  original: string | null;

  // ✅ 추가 번역/보조용 (지금은 거의 사용 안 함)
  translated_text: string | null;

  created_at: string;      // ISO string from Supabase
  kind: string | null;
  is_notice: boolean | null;
};

export type SyncDirection = 'pull' | 'push';

export type SyncResult = {
  direction: SyncDirection;
  roomId: number;
  added: number;
  updated: number;
  deleted: number;
  from?: string; // ISO
  to?: string;   // ISO
};
