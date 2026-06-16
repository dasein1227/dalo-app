// src/lib/chatSync/types.ts

export type ChatMessageRow = {
  id: number | string;
  room_id: number;
  sender_id: string;

  // ✅ content = 최종 표시 텍스트 (번역 포함)
  content: string | null;

  // ✅ original = 사용자가 입력한 원문
  original: string | null;

  // 보조용
  translated_text: string | null;
  
  // ✅ [NEW] 번역 수행 등급
  translated_by_tier: string | null;

  created_at: string;      // ISO string from Supabase
  kind: string | null;
  is_notice: boolean | null;
  notice_pinned_at?: string | null;
  
  // 기타 필드들
  client_msg_id?: string | null;
  delete_at?: string | null;
  moment_config?: any | null;
  link_preview?: any | null;
  link_preview_url?: string | null;
  link_preview_status?: string | null;
  
  room_seq?: number | null;
  
  // Context용 (Insert시 사용되는 필드들이지만 select시에도 올 수 있음)
  source_lang?: string | null;
  sender_selected_tier?: string | null;
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