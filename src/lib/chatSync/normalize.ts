// src/lib/chatSync/normalize.ts
import type { ChatMessageRow } from './types';

export type NormalizedRow = {
  id: string;
  roomId: number;
  senderId: string;
  original: string | null;
  content: string | null;
  kind: string | null;
  createdAt: number;
  isNotice: boolean | null;
};

// Supabase → LocalDB 정상화
export function normalizeRow(row: ChatMessageRow): NormalizedRow {
  const original = row.original ?? null;

  // content: 최종 표시 텍스트
  // supabase row.content가 이미 번역된 상태일 수 있음.
  // 만약 null이면 original로 fallback
  const content = row.content ?? original ?? '';

  // created_at은 무조건 number(ms)
  const createdAt =
    typeof row.created_at === 'number'
      ? row.created_at
      : new Date(row.created_at).getTime();

  return {
    id: String(row.id),
    roomId: row.room_id,
    senderId: row.sender_id,
    original,
    content,
    kind: row.kind ?? 'text',
    createdAt,
    isNotice: row.is_notice ?? null,
  };
}
