import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BusinessEvent } from '../components/businessTypes';
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

const BUSINESS_EVENT_SELECT = 'id, business_id, title, body, image_url, starts_at, created_at';

export function useBusinessEvents(businessId: string | null, feedback?: BusinessFeedback) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventBody, setNewEventBody] = useState('');
  const [newEventImageUrl, setNewEventImageUrl] = useState<string | null>(null);
  
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
      console.warn('[useBusinessEvents] confirm feedback is not configured.');
      return;
    }
    feedback.confirm(params);
  }, [feedback]);

  const fetchEvents = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_events')
        .select(BUSINESS_EVENT_SELECT)
        .eq('business_id', businessId)
        .order('starts_at', { ascending: false });

      if (error) throw error;
      setEvents(data as BusinessEvent[]);
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:events.fetchFail'), 'danger');
    } finally {
      setLoading(false);
    }
  }, [businessId, showFeedbackToast, t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const resetForm = useCallback(() => {
    setNewEventTitle('');
    setNewEventBody('');
    setNewEventImageUrl(null);
    setEditingId(null);
  }, []);

  const submitEvent = useCallback(async () => {
    if (!businessId) return;
    if (!newEventTitle.trim() && !newEventBody.trim() && !newEventImageUrl) {
      showFeedbackToast(t('business:events.contentRequired'), 'warning');
      return;
    }

    try {
      setPosting(true);
      const payload = {
        business_id: businessId,
        title: newEventTitle.trim() || null,
        body: newEventBody.trim() || null,
        image_url: newEventImageUrl,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('business_events')
          .update(payload)
          .eq('id', editingId)
          .select(BUSINESS_EVENT_SELECT)
          .single();
        if (error) throw error;

        setEvents(prev => prev.map(e => e.id === editingId ? (data as BusinessEvent) : e));
        showFeedbackToast(t('business:events.updateDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_events')
          .insert(payload)
          .select(BUSINESS_EVENT_SELECT)
          .single();
        if (error) throw error;

        setEvents(prev => [data as BusinessEvent, ...prev]);
        showFeedbackToast(t('business:events.createDone'), 'success', true);
      }

      resetForm();
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:events.saveFail'), 'danger');
    } finally {
      setPosting(false);
    }
  }, [businessId, newEventTitle, newEventBody, newEventImageUrl, editingId, resetForm, showFeedbackToast, t]);

  const deleteEvent = useCallback((eventId: string) => {
    requestConfirm({
      title: t('business:events.deleteTitle'),
      message: t('business:events.deleteConfirm'),
      confirmText: t('business:common.delete'),
      cancelText: t('business:common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('business_events')
            .delete()
            .eq('id', eventId);
          if (error) throw error;

          setEvents(prev => prev.filter(e => e.id !== eventId));
          
          if (editingId === eventId) {
            resetForm();
          }
        } catch (e) {
          console.error(e);
          showFeedbackToast(t('business:events.deleteFail'), 'danger');
        }
      },
    });
  }, [editingId, resetForm, requestConfirm, showFeedbackToast, t]);

  const startEdit = useCallback((event: BusinessEvent) => {
    setEditingId(event.id);
    setNewEventTitle(event.title ?? '');
    setNewEventBody(event.body ?? '');
    setNewEventImageUrl(event.image_url ?? null);
  }, []);

  return {
    events,
    loading,
    newEventTitle, setNewEventTitle,
    newEventBody, setNewEventBody,
    newEventImageUrl, setNewEventImageUrl,
    posting,
    editingId,
    submitEvent,
    deleteEvent,
    startEdit,
    resetForm,
    refreshEvents: fetchEvents,
  };
}
