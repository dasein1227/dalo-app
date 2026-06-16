import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BusinessNotice } from '../components/businessTypes';
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

const BUSINESS_NOTICE_SELECT = 'id, business_id, title, body, image_url, created_at';

export function useBusinessNotices(businessId: string | null, feedback?: BusinessFeedback) {
  const { t } = useTranslation();
  const [notices, setNotices] = useState<BusinessNotice[]>([]);
  const [loading, setLoading] = useState(false);

  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeBody, setNewNoticeBody] = useState('');
  const [newNoticeImageUrl, setNewNoticeImageUrl] = useState<string | null>(null);
  
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const showFeedbackToast = useCallback(
    (message: string, tone: BusinessFeedbackToastTone = 'default', showMark = false) => {
      feedback?.showToast?.(message, tone, showMark);
    },
    [feedback],
  );

  const requestConfirm = useCallback((params: BusinessConfirmParams) => {
    if (!feedback?.confirm) {
      console.warn('[useBusinessNotices] confirm feedback is not configured.');
      return;
    }
    feedback.confirm(params);
  }, [feedback]);

  const fetchNotices = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_notices')
        .select(BUSINESS_NOTICE_SELECT)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotices(data as BusinessNotice[]);
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:notices.fetchFail'), 'danger');
    } finally {
      setLoading(false);
    }
  }, [businessId, showFeedbackToast, t]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const resetForm = useCallback(() => {
    setNewNoticeTitle('');
    setNewNoticeBody('');
    setNewNoticeImageUrl(null);
    setEditingId(null);
  }, []);

  const submitNotice = useCallback(async () => {
    if (!businessId) return;
    if (!newNoticeTitle.trim() && !newNoticeBody.trim() && !newNoticeImageUrl) {
      showFeedbackToast(t('business:notices.contentRequired'), 'warning');
      return;
    }

    try {
      setPosting(true);
      const payload = {
        business_id: businessId,
        title: newNoticeTitle.trim() || '',
        body: newNoticeBody.trim() || null,
        image_url: newNoticeImageUrl,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('business_notices')
          .update(payload)
          .eq('id', editingId)
          .select(BUSINESS_NOTICE_SELECT)
          .single();
        if (error) throw error;

        setNotices(prev => prev.map(n => n.id === editingId ? (data as BusinessNotice) : n));
        showFeedbackToast(t('business:notices.updateDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_notices')
          .insert(payload)
          .select(BUSINESS_NOTICE_SELECT)
          .single();
        if (error) throw error;

        setNotices(prev => [data as BusinessNotice, ...prev]);
        showFeedbackToast(t('business:notices.createDone'), 'success', true);
      }

      resetForm();
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:notices.saveFail'), 'danger');
    } finally {
      setPosting(false);
    }
  }, [businessId, newNoticeTitle, newNoticeBody, newNoticeImageUrl, editingId, resetForm, showFeedbackToast, t]);

  const deleteNotice = useCallback((noticeId: string) => {
    requestConfirm({
      title: t('business:notices.deleteTitle'),
      message: t('business:notices.deleteConfirm'),
      confirmText: t('business:common.delete'),
      cancelText: t('business:common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('business_notices')
            .delete()
            .eq('id', noticeId);
          if (error) throw error;

          setNotices(prev => prev.filter(n => n.id !== noticeId));
          
          if (editingId === noticeId) {
            resetForm();
          }
        } catch (e) {
          console.error(e);
          showFeedbackToast(t('business:notices.deleteFail'), 'danger');
        }
      },
    });
  }, [editingId, resetForm, requestConfirm, showFeedbackToast, t]);

  const startEdit = useCallback((notice: BusinessNotice) => {
    setEditingId(notice.id);
    setNewNoticeTitle(notice.title ?? '');
    setNewNoticeBody(notice.body ?? '');
    setNewNoticeImageUrl(notice.image_url ?? null);
  }, []);

  return {
    notices,
    loading,
    newNoticeTitle, setNewNoticeTitle,
    newNoticeBody, setNewNoticeBody,
    newNoticeImageUrl, setNewNoticeImageUrl,
    posting,
    editingId,
    submitNotice,
    deleteNotice,
    startEdit,
    resetForm,
    refreshNotices: fetchNotices,
  };
}
