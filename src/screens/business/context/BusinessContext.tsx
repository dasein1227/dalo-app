import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/useAppTheme';
import { useBusinessInfo, BusinessInfoState } from '../hooks/useBusinessInfo';
import { useBusinessMenu } from '../hooks/useBusinessMenu';
import { useBusinessPhotos } from '../hooks/useBusinessPhotos';
import { useBusinessEvents } from '../hooks/useBusinessEvents';
import { useBusinessNotices } from '../hooks/useBusinessNotices';
import { useBusinessReviews } from '../hooks/useBusinessReviews';
import { useBusinessTimePicker } from '../hooks/useBusinessTimePicker';
import { useBusinessAiBriefing } from '@/hooks/useBusinessAiBriefing';
import { useTranslation } from 'react-i18next';

import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import type { CoonnFloatingToastTone } from '@/components/feedback/CoonnFloatingToast.theme';

export type TabKey = 'home' | 'events' | 'menu' | 'photos' | 'notice' | 'feed' | 'info';

type BusinessProviderConfirmParams = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: CoonnAlertVariant;
  onConfirm: () => void | Promise<void>;
};

type BusinessProviderAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  variant: CoonnAlertVariant;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_PROVIDER_ALERT: BusinessProviderAlertState = {
  visible: false,
  title: '',
  message: undefined,
  confirmText: '',
  cancelText: '',
  variant: 'default',
  onConfirm: undefined,
};

interface BusinessContextType {
  businessId: string | null;
  
  infoState: {
    info: BusinessInfoState;
    loading: boolean;
    saving: boolean;
    isDirty: boolean;
  };
  infoActions: {
    updateField: <K extends keyof BusinessInfoState>(key: K, value: BusinessInfoState[K]) => void;
    saveInfo: () => Promise<any>;
  };

  menuState: ReturnType<typeof useBusinessMenu>;
  photosState: ReturnType<typeof useBusinessPhotos>;
  eventsState: ReturnType<typeof useBusinessEvents>;
  noticesState: ReturnType<typeof useBusinessNotices>;
  reviewsState: ReturnType<typeof useBusinessReviews>;
  
  timePickerState: ReturnType<typeof useBusinessTimePicker>;
  aiBriefingState: ReturnType<typeof useBusinessAiBriefing>;

  uiState: {
    activeTab: TabKey;
  };
  uiActions: {
    setActiveTab: (tab: TabKey) => void;
  };

  utils: {
    uploadImage: (folder: string) => Promise<string | null>;
  };
}

const BusinessContext = createContext<BusinessContextType | null>(null);

interface BusinessProviderProps {
  businessId: string | null;
  children: React.ReactNode;
}

export const BusinessProvider: React.FC<BusinessProviderProps> = ({ businessId, children }) => {
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [providerAlert, setProviderAlert] = useState<BusinessProviderAlertState>(EMPTY_PROVIDER_ALERT);

  const alertThemeName = useMemo<'coonn_light' | 'coonn_dark'>(
    () => ((appTheme as any)?.isDark ? 'coonn_dark' : 'coonn_light'),
    [appTheme],
  );

  const showProviderToast = useCallback(
    (message: string, tone: CoonnFloatingToastTone = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const closeProviderAlert = useCallback(() => {
    setProviderAlert((prev) => ({ ...prev, visible: false }));
  }, [t]);

  const showProviderConfirm = useCallback((params: BusinessProviderConfirmParams) => {
    setProviderAlert({
      visible: true,
      title: params.title,
      message: params.message,
      confirmText: params.confirmText ?? t('business:common.confirm'),
      cancelText: params.cancelText ?? t('business:common.cancel'),
      variant: params.variant ?? 'default',
      onConfirm: params.onConfirm,
    });
  }, [t]);

  const handleProviderAlertConfirm = useCallback(async () => {
    const action = providerAlert.onConfirm;
    closeProviderAlert();
    await action?.();
  }, [closeProviderAlert, providerAlert.onConfirm]);

  const businessFeedback = useMemo(
    () => ({
      showToast: showProviderToast,
      confirm: showProviderConfirm,
    }),
    [showProviderConfirm, showProviderToast],
  );

  const infoHook = useBusinessInfo(businessId, businessFeedback);
  const menuHook = useBusinessMenu(businessId, businessFeedback);
  const photosHook = useBusinessPhotos(businessId, businessFeedback);
  const eventsHook = useBusinessEvents(businessId, businessFeedback);
  const noticesHook = useBusinessNotices(businessId, businessFeedback);
  const reviewsHook = useBusinessReviews(businessId);
  
  const timePickerHook = useBusinessTimePicker();

  const aiBriefingHook = useBusinessAiBriefing(businessId, {
    auto: false, 
    initialBriefing: infoHook.info?.ai_briefing || null,
    skipAutoIfHasBriefing: true,
  });

  const [activeTab, setActiveTab] = useState<TabKey>('home');

  const uploadImage = useCallback(async (folder: string): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showProviderToast(t('business:provider.photoPermission'), 'warning');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.68,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets[0]) return null;
      if (!businessId) {
        showProviderToast(t('business:provider.saveBusinessFirst'), 'warning');
        return null;
      }

      const localUri = result.assets[0].uri;
      const fileRes = await fetch(localUri);
      const blob = await fileRes.blob();
      const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
      const contentType = blob.type || 'image/jpeg';

      const { data, error } = await supabase.functions.invoke('business-upload', {
        body: {
          folder: `businesses/${businessId}/${folder}`,
          ext,
          contentType,
        },
      });

      if (error || !data) {
        console.error('business-upload init failed:', error, data);
        throw error || new Error('Upload init failed');
      }

      const payload = {
        uploadUrl: data.uploadUrl || data.upload_url,
        publicUrl: data.publicUrl || data.public_url,
      };

      if (!payload.uploadUrl || !payload.publicUrl) {
        console.error('Invalid business-upload payload:', data);
        throw new Error('Invalid upload payload');
      }

      const uploadRes = await fetch(payload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '');
        console.error('R2 business upload failed:', uploadRes.status, text);
        throw new Error('R2 upload failed');
      }

      return payload.publicUrl;
    } catch (e: any) {
      console.error('Upload Failed:', e);
      showProviderToast(t('business:provider.imageUploadFail'), 'danger');
      return null;
    }
  }, [businessId, showProviderToast, t]);

  const value = useMemo<BusinessContextType>(() => ({
    businessId,
    infoState: {
      info: infoHook.info,
      loading: infoHook.loading,
      saving: infoHook.saving,
      isDirty: infoHook.isDirty,
    },
    infoActions: {
      updateField: infoHook.updateField,
      saveInfo: infoHook.saveInfo,
    },
    menuState: menuHook,
    photosState: photosHook,
    eventsState: eventsHook,
    noticesState: noticesHook,
    reviewsState: reviewsHook,
    
    timePickerState: timePickerHook,
    aiBriefingState: aiBriefingHook,

    uiState: { activeTab },
    uiActions: { setActiveTab },
    utils: { uploadImage },
  }), [
    businessId,
    infoHook.info,
    infoHook.loading,
    infoHook.saving,
    infoHook.isDirty,
    infoHook.updateField,
    infoHook.saveInfo,
    menuHook,
    photosHook,
    eventsHook,
    noticesHook,
    reviewsHook,
    timePickerHook,
    aiBriefingHook,
    activeTab,
    uploadImage,
  ]);

  return (
    <BusinessContext.Provider value={value}>
      {children}

      <CoonnAlert
        visible={providerAlert.visible}
        theme={alertThemeName}
        variant={providerAlert.variant}
        title={providerAlert.title}
        message={providerAlert.message}
        confirmText={providerAlert.confirmText}
        cancelText={providerAlert.cancelText}
        onConfirm={handleProviderAlertConfirm}
        onCancel={closeProviderAlert}
        dismissOnBackdrop
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Math.max(insets.bottom + 28, 36)}
        onHidden={hideToast}
      />
    </BusinessContext.Provider>
  );
};

export const useBusinessContext = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusinessContext must be used within a BusinessProvider');
  }
  return context;
};
