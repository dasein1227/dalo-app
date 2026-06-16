// src/screens/chat/types.ts
import { ChatRoomRow } from './components/ChatRoomCard';

export type Row = ChatRoomRow & {
  special?: boolean;
  owner_nickname?: string | null;
  subtype?: string | null;
  section?: 'mine' | 'joined';
  peer_id?: string | null;
  business_id?: string | null;
  business_name?: string | null;
  business_logo_url?: string | null;
  unread_count?: number | null;
};