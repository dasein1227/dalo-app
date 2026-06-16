// src/screens/profile/postDetail/types.ts

export type ProfileLite = {
  nickname: string | null;
  avatar_url: string | null;
  follow_id: string | null;
};

export type MediaRow = {
  id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
};

export type DetailedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: any;
  created_at: string;
  profiles: ProfileLite | null;
  post_media: MediaRow[];
  like_count?: number;
  is_liked?: boolean;
  comment_count?: number;
  share_count?: number;
};

export type UploadBannerState = {
  postId: string;
  total: number;
  uploaded: number;
  status: 'uploading' | 'done' | 'error';
  message?: string;
  caption?: string;
};

export type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  root_comment_id?: string | null;
  depth?: number | null;
  status?: 'visible' | 'deleted' | 'hidden_by_author' | 'hidden_by_system' | 'restricted_pending' | string | null;
  deleted_at?: string | null;
  reply_count?: number | null;
  mention_user_id?: string | null;
  profiles: ProfileLite | null;
  like_count?: number;
  is_liked?: boolean;
  temp?: boolean;
};

export type TabRow = {
  id: string;
  name: string;
};

export type CommentNode = CommentRow & { replies: CommentNode[] };

export type PostLikeUserRow = {
  user_id: string;
  profiles: ProfileLite | null;
};

export type CommentLikeRow = {
  comment_id: string;
  user_id: string;
};

export type TranslateFn = (key: string, options?: any) => string;
