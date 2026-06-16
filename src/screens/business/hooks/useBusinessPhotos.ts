import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BusinessPhoto } from '../components/businessTypes';
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

const BUSINESS_PHOTO_SELECT = 'id, business_id, image_url, caption, created_at';

export function useBusinessPhotos(businessId: string | null, feedback?: BusinessFeedback) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | null>(null);
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
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
      console.warn('[useBusinessPhotos] confirm feedback is not configured.');
      return;
    }
    feedback.confirm(params);
  }, [feedback]);

  const fetchPhotos = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_photos')
        .select(BUSINESS_PHOTO_SELECT)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data as BusinessPhoto[]);
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:photos.fetchFail'), 'danger');
    } finally {
      setLoading(false);
    }
  }, [businessId, showFeedbackToast, t]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const resetForm = useCallback(() => {
    setNewPhotoUrl(null);
    setNewPhotoCaption('');
    setEditingId(null);
  }, []);

  const submitPhoto = useCallback(async () => {
    if (!businessId) return;
    if (!newPhotoUrl && !newPhotoCaption.trim()) {
      showFeedbackToast(t('business:photos.contentRequired'), 'warning');
      return;
    }

    try {
      setPosting(true);
      const payload = {
        business_id: businessId,
        image_url: newPhotoUrl,
        caption: newPhotoCaption.trim() || null,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('business_photos')
          .update(payload)
          .eq('id', editingId)
          .select(BUSINESS_PHOTO_SELECT)
          .single();
        if (error) throw error;

        setPhotos(prev => prev.map(p => p.id === editingId ? (data as BusinessPhoto) : p));
        showFeedbackToast(t('business:photos.updateDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_photos')
          .insert(payload)
          .select(BUSINESS_PHOTO_SELECT)
          .single();
        if (error) throw error;

        setPhotos(prev => [data as BusinessPhoto, ...prev]);
        showFeedbackToast(t('business:photos.createDone'), 'success', true);
      }

      resetForm();
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:photos.saveFail'), 'danger');
    } finally {
      setPosting(false);
    }
  }, [businessId, newPhotoUrl, newPhotoCaption, editingId, resetForm, showFeedbackToast, t]);

  const deletePhoto = useCallback((photoId: string) => {
    requestConfirm({
      title: t('business:photos.deleteTitle'),
      message: t('business:photos.deleteConfirm'),
      confirmText: t('business:common.delete'),
      cancelText: t('business:common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('business_photos')
            .delete()
            .eq('id', photoId);
          if (error) throw error;
          
          setPhotos(prev => prev.filter(p => p.id !== photoId));
          
          if (editingId === photoId) {
            resetForm();
          }
        } catch (e) {
          console.error(e);
          showFeedbackToast(t('business:photos.deleteFail'), 'danger');
        }
      },
    });
  }, [editingId, resetForm, requestConfirm, showFeedbackToast, t]);

  const startEdit = useCallback((photo: BusinessPhoto) => {
    setEditingId(photo.id);
    setNewPhotoUrl(photo.image_url ?? null);
    setNewPhotoCaption(photo.caption ?? '');
  }, []);

  return {
    photos,
    loading,
    newPhotoUrl,
    setNewPhotoUrl,
    newPhotoCaption,
    setNewPhotoCaption,
    posting,
    editingId,
    submitPhoto,
    deletePhoto,
    startEdit,
    resetForm,
    refreshPhotos: fetchPhotos,
  };
}
