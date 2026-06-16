import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

type BusinessFeedbackToastTone = 'default' | 'success' | 'info' | 'warning' | 'danger';

type BusinessConfirmParams = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
};

type BusinessFeedback = {
  showToast?: (message: string, tone?: BusinessFeedbackToastTone, showMark?: boolean) => void;
  confirm?: (params: BusinessConfirmParams) => void;
};

const BUSINESS_INFO_SELECT = `
  id,
  name,
  description,
  one_line_intro,
  phone,
  address,
  detail_address,
  default_currency,
  is_open,
  profile_json,
  lat,
  lng,
  open_time,
  close_time,
  last_order_time,
  has_break_time,
  break_start_time,
  break_end_time,
  is_open_now,
  category,
  category_major,
  category_minor,
  is_adult,
  minsaeng_coupon,
  local_giftcard,
  facilities,
  parking_available,
  parking_info,
  seating_info,
  payment_methods,
  website_url,
  instagram_url,
  kakao_channel,
  hero_image_url,
  logo_image_url,
  ai_briefing,
  ai_briefing_updated_at,
  ai_category_top3
`;

// DB 컬럼 타입 정의
export type BusinessInfoState = {
  name: string;
  description: string;
  one_line_intro: string;
  phone: string;
  address: string;
  detail_address: string;
  default_currency: string;

  // 영업 노출 상태
  is_open: boolean;
  is_open_auto: boolean;
  profile_json: Record<string, any> | null;
  
  // 위치
  lat: number | null;
  lng: number | null;

  // 운영 시간 (HH:mm string)
  open_time: string;
  close_time: string;
  last_order_time: string;
  has_break_time: boolean;
  break_start_time: string;
  break_end_time: string;
  is_open_now: boolean;

  // 카테고리
  category: string;
  category_major: string;
  category_minor: string;
  is_adult: boolean;

  // 부가 정보
  minsaeng_coupon: boolean;
  local_giftcard: boolean;
  facilities: string;
  parking_available: boolean;
  parking_info: string;
  seating_info: string;
  payment_methods: string;
  
  // 링크
  website_url: string;
  instagram_url: string;
  kakao_channel: string;

  // 이미지
  hero_image_url: string | null;
  logo_image_url: string | null;
  
  // AI 관련 필드
  ai_briefing: string | null;
  ai_briefing_updated_at: string | null;
  ai_category_top3: string[];
};

// 초기값 설정
const INITIAL_INFO: BusinessInfoState = {
  name: '',
  description: '',
  one_line_intro: '',
  phone: '',
  address: '',
  detail_address: '',
  default_currency: 'KRW',
  is_open: true,
  is_open_auto: false,
  profile_json: null,
  lat: null,
  lng: null,
  open_time: '',
  close_time: '',
  last_order_time: '',
  has_break_time: false,
  break_start_time: '',
  break_end_time: '',
  is_open_now: true,
  category: '',
  category_major: '',
  category_minor: '',
  is_adult: false,
  minsaeng_coupon: false,
  local_giftcard: false,
  facilities: '',
  parking_available: false,
  parking_info: '',
  seating_info: '',
  payment_methods: '',
  website_url: '',
  instagram_url: '',
  kakao_channel: '',
  hero_image_url: null,
  logo_image_url: null,
  ai_briefing: '',
  ai_briefing_updated_at: null,
  ai_category_top3: [],
};

export function useBusinessInfo(businessId: string | null, feedback?: BusinessFeedback) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<BusinessInfoState>(INITIAL_INFO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const showFeedbackToast = useCallback(
    (message: string, tone: BusinessFeedbackToastTone = 'default', showMark = false) => {
      feedback?.showToast?.(message, tone, showMark);
    },
    [feedback],
  );

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    const fetchBusiness = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('businesses')
          .select(BUSINESS_INFO_SELECT)
          .eq('id', businessId)
          .single();

        if (error) throw error;

        if (data) {
          const profileJson =
            data.profile_json && typeof data.profile_json === 'object' && !Array.isArray(data.profile_json)
              ? data.profile_json as Record<string, any>
              : null;
          const openStatusProfile =
            profileJson?.open_status && typeof profileJson.open_status === 'object' && !Array.isArray(profileJson.open_status)
              ? profileJson.open_status as Record<string, any>
              : null;

          setInfo({
            name: data.name ?? '',
            description: data.description ?? '',
            one_line_intro: data.one_line_intro ?? '',
            phone: data.phone ?? '',
            address: data.address ?? '',
            detail_address: data.detail_address ?? '',
            default_currency: String(data.default_currency ?? 'KRW').toUpperCase(),
            is_open: data.is_open ?? true,
            is_open_auto: openStatusProfile?.is_auto === true,
            profile_json: profileJson,
            lat: data.lat,
            lng: data.lng,
            open_time: data.open_time ?? '',
            close_time: data.close_time ?? '',
            last_order_time: data.last_order_time ?? '',
            has_break_time: data.has_break_time ?? false,
            break_start_time: data.break_start_time ?? '',
            break_end_time: data.break_end_time ?? '',
            is_open_now: data.is_open_now ?? true,
            category: data.category ?? '',
            category_major: data.category_major ?? '',
            category_minor: data.category_minor ?? '',
            is_adult: data.is_adult ?? false,
            minsaeng_coupon: data.minsaeng_coupon ?? false,
            local_giftcard: data.local_giftcard ?? false,
            facilities: data.facilities ?? '',
            parking_available: data.parking_available ?? false,
            parking_info: data.parking_info ?? '',
            seating_info: data.seating_info ?? '',
            payment_methods: data.payment_methods ?? '',
            website_url: data.website_url ?? '',
            instagram_url: data.instagram_url ?? '',
            kakao_channel: data.kakao_channel ?? '',
            hero_image_url: data.hero_image_url ?? null,
            logo_image_url: data.logo_image_url ?? null,
            ai_briefing: data.ai_briefing ?? '',
            ai_briefing_updated_at: data.ai_briefing_updated_at ?? null,
            ai_category_top3: data.ai_category_top3 ?? [],
          });
        }
      } catch (e) {
        console.error(e);
        showFeedbackToast(t('business:info.loadFail'), 'danger');
      } finally {
        setLoading(false);
      }
    };

    fetchBusiness();
  }, [businessId, showFeedbackToast, t]);

  const updateField = useCallback(<K extends keyof BusinessInfoState>(key: K, value: BusinessInfoState[K]) => {
    setInfo((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const saveInfo = useCallback(async () => {
    if (!info.name.trim()) {
      showFeedbackToast(t('business:info.nameRequired'), 'warning');
      return null;
    }
    if (!info.category) {
      showFeedbackToast(t('business:info.categoryRequired'), 'warning');
      return null;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('business:info.loginRequired'));

      const {
        is_open_auto,
        profile_json,
        ...dbInfo
      } = info;

      const profileJson: Record<string, any> =
        profile_json && typeof profile_json === 'object' && !Array.isArray(profile_json)
          ? { ...profile_json }
          : {};

      const previousOpenStatus =
        profileJson.open_status && typeof profileJson.open_status === 'object' && !Array.isArray(profileJson.open_status)
          ? profileJson.open_status
          : {};

      const payload: any = {
        ...dbInfo,
        is_open: info.is_open ?? true,
        is_open_now: info.is_open ?? true,
        profile_json: {
          ...profileJson,
          open_status: {
            ...previousOpenStatus,
            is_auto: !!is_open_auto,
          },
        },
        default_currency: String(info.default_currency || 'KRW').toUpperCase(),
        owner_id: user.id,
        description: info.description || null,
        detail_address: info.detail_address || null,
        logo_image_url: info.logo_image_url || null,
        break_start_time: info.has_break_time ? info.break_start_time : null,
        break_end_time: info.has_break_time ? info.break_end_time : null,
        ai_category_top3: Array.from(new Set([info.category, ...info.ai_category_top3])).slice(0, 3),
      };

      let result;
      if (businessId) {
        const { data, error } = await supabase
          .from('businesses')
          .update(payload)
          .eq('id', businessId)
          .select(BUSINESS_INFO_SELECT)
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('businesses')
          .insert(payload)
          .select(BUSINESS_INFO_SELECT)
          .single();
        if (error) throw error;
        result = data;
      }

      setIsDirty(false);
      showFeedbackToast(t('business:info.saveDone'), 'success', true);
      return result;

    } catch (e: any) {
      console.error(e);
      showFeedbackToast(e.message || t('business:info.saveFail'), 'danger');
      return null;
    } finally {
      setSaving(false);
    }
  }, [info, businessId, showFeedbackToast, t]);

  return {
    info,
    loading,
    saving,
    isDirty,
    updateField,
    saveInfo,
  };
}
