// src/screens/business/components/businessTypes.ts

export type BusinessRow = {
  id: string;
  owner_id: string;

  name: string;
  category?: string | null;
  short_intro?: string | null;
  description?: string | null;

  phone?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  kakao_channel?: string | null;

  address?: string | null;
  lat?: number | null;
  lng?: number | null;

  is_open?: boolean | null;
  opening_hours?: any | null;

  last_order?: string | null;
  break_time?: string | null;

  hero_image_url?: string | null;
  logo_image_url?: string | null;
  is_active?: boolean | null;
  visitor_feed_count?: number | null;
  
  // ✅ AI 브리핑 필드 확인
  ai_briefing?: string | null;
  one_line_intro?: string | null;

  // 비즈니스 상세 정보
  minsaeng_coupon?: boolean | null;
  facilities?: string | null;
  parking_available?: boolean | null;
  parking_info?: string | null;
  seating_info?: string | null;
  payment_methods?: string | null;

  open_time?: string | null;
  close_time?: string | null;
  last_order_time?: string | null;
  has_break_time?: boolean | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  ai_briefing_updated_at?: string | null;
  detail_address?: string | null; 
};

export type BusinessRegistrationRow = {
  id: string;
  user_id: string;
  status: string;
  store_name?: string | null;
  owner_name?: string | null;
  contact?: string | null;
};

export type BusinessMenu = {
  id: string;
  business_id: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  category?: string | null;
};

export type BusinessMenuItem = {
  id: string;
  business_id: string;
  menu_id: string;
  name: string;
  price?: number | null;
  description?: string | null;
  image_url?: string | null;
  is_signature?: boolean | null;
  is_main_photo?: boolean | null;
  sort_order?: number | null;
};

export type MenuItemsByMenuId = Record<string, BusinessMenuItem[]>;

export type BusinessPhoto = {
  id: string;
  business_id?: string;
  image_url?: string | null;
  caption?: string | null;
  created_at?: string | null;
};

export type BusinessEvent = {
  id: string;
  business_id?: string;
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  created_at?: string | null;
  starts_at?: string | null; 
  ends_at?: string | null;
};

export type BusinessNotice = {
  id: string;
  business_id?: string;
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  created_at?: string | null;
};

// ✅ [유지] 리뷰 오류 수정 사항 적용됨
export type BusinessReview = {
  // id: string; // 삭제됨 (테이블에 없음)
  post_id: string;
  created_at: string;
  post: {
    id: string;
    caption: string;
    // ✅ post_media 테이블 (file_url 컬럼)
    post_media: {
      file_url: string | null; 
    }[] | null;
    created_at: string;
    user_id: string;
    user?: {
      nickname: string;
      avatar_url: string | null;
    };
  } | null;
};

export type TabKey =
  | 'home'
  | 'events'
  | 'menu'
  | 'photos'
  | 'notice'
  | 'feed'
  | 'info';

export type TimeFieldKey =
  | 'open'
  | 'close'
  | 'lastOrder'
  | 'breakStart'
  | 'breakEnd';