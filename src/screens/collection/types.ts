import type { Dispatch, SetStateAction } from 'react';
import type {
  DetailedPost,
  MediaRow,
  ProfileLite,
  TranslateFn,
} from '../profile/postDetail/types';

export type CollectionMode = 'business' | 'user' | 'feed';

export type CollectionSeedPost = DetailedPost;

export type CollectionRouteParams = {
  businessId?: string;
  user_id?: string;
  collectionTitle?: string;
  entryTabId?: string | null;
  mode?: CollectionMode;
  seedPost?: CollectionSeedPost;
  seedPosts?: CollectionSeedPost[];
  seedPostId?: string;
  seedMediaIndex?: number;
  sourcePostIds?: string[];

  /** Upload handoff from CreatePost/PostDetail-compatible flow. */
  postId?: string;
  uploadPostId?: string;
  isUploading?: boolean;
  total?: number;
  uploadTotal?: number;
  refreshToken?: number;
};

export type CollectionPostQueryRow = {
  id: string;
  user_id: string;
  tab_id?: string | null;
  caption: string | null;
  visibility: unknown;
  created_at: string;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  business_id?: string | null;
  profiles: ProfileLite | ProfileLite[] | null;
  post_media: MediaRow[] | null;
};

export type CollectionDataParams = {
  params: CollectionRouteParams;
  t: TranslateFn;
};

export type CollectionDataResult = {
  myId: string | null;
  myProfile: ProfileLite | null;
  loading: boolean;
  posts: DetailedPost[];
  setPosts: Dispatch<SetStateAction<DetailedPost[]>>;
  title: string;
  tabs: Array<{ id: string; name: string }>;
  currentTabId: string | null;
  changeTab: (tabId: string) => Promise<void>;
  refresh: (targetTabId?: string | null) => Promise<void>;
};
