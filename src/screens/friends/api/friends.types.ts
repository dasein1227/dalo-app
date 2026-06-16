export type FriendRow = {
  user_id: string;
  nickname: string;
  email: string | null;
  avatar_url?: string | null;
  status_message?: string | null;
  is_favorite?: boolean;
  birthdate?: string | null;
  phone_number?: string | null;
  memo?: string | null;
};

export type FriendSectionKey = 'birthday' | 'favorites' | 'friends';

export type FriendSection = {
  key: FriendSectionKey;
  title: string;
  data: FriendRow[];
};

export type Label = {
  id: number;
  name: string;
  member_count: number;
};

export type GroupPreviewMember = {
  user_id?: string;
  friend_id?: string;
  nickname?: string | null;
  avatar_url?: string | null;
  follow_id?: string | null;
  friend_code?: string | null;
};

export type GroupSummary = Label & {
  preview_members?: GroupPreviewMember[];
  is_favorite?: boolean;
  search_text?: string;
  updated_at?: number;
};

export type FriendsHomeData = {
  me: string;
  requests_incoming_count: number;
  friends_total: number;
  sections: FriendSection[];
  groups: GroupSummary[];
};

export type SearchMode = 'id' | 'phone';

export type SearchUser = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  relation_status: 'none' | 'pending_in' | 'pending_out' | 'accepted' | 'blocked';
  friendship_id: string | null;
};

export type FriendRequestItem = {
  friendship_id: string;
  created_at: string;
  message: string | null;
  other_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

export type RequestsPayload = {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

export type MyProfile = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

export type FriendDetail = {
  friend_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  alias: string | null;
  memo: string | null;
  is_favorite: boolean;
  is_hidden: boolean;
  is_blocked_by_me: boolean;
  is_blocking_me: boolean;
  groups: { id: number; name: string; in_group: boolean }[];
};

export type GroupMemberRow = {
  friend_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  avatar_url?: string | null;
  alias: string | null;
  memo?: string | null;
  is_favorite: boolean;
};
