// src/screens/business/BusinessUnregister.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, CheckCircle2, ChevronLeft, XCircle } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createBusinessOwnerTheme, type BusinessOwnerTheme } from './BusinessOwner.theme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

type UnregisterAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  singleButton: boolean;
  confirmText: string;
  cancelText: string;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_UNREGISTER_ALERT: UnregisterAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  confirmText: '',
  cancelText: '',
};

export default function BusinessUnregister() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessOwnerTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [unregisterAlert, setUnregisterAlert] = useState<UnregisterAlertState>(EMPTY_UNREGISTER_ALERT);

  const alertThemeName = useMemo<'coonn_light' | 'coonn_dark'>(
    () => ((appTheme as any)?.isDark ? 'coonn_dark' : 'coonn_light'),
    [appTheme],
  );

  const showUnregisterToast = useCallback(
    (message: string, tone: 'default' | 'success' | 'warning' | 'danger' = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const closeUnregisterAlert = useCallback(() => {
    setUnregisterAlert((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  }, [showUnregisterToast, t]);

  const showUnregisterAlert = useCallback((params: {
    title: string;
    message?: string;
    variant?: CoonnAlertVariant;
    singleButton?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
  }) => {
    setUnregisterAlert({
      visible: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? 'default',
      singleButton: params.singleButton ?? true,
      confirmText: params.confirmText ?? t('business:common.confirm'),
      cancelText: params.cancelText ?? t('business:common.cancel'),
      onConfirm: params.onConfirm,
    });
  }, [t]);

  const handleUnregisterAlertConfirm = useCallback(async () => {
    const action = unregisterAlert.onConfirm;
    closeUnregisterAlert();
    await action?.();
  }, [closeUnregisterAlert, unregisterAlert.onConfirm]);

  const [meId, setMeId] = useState<string>('');
  const [isBusiness, setIsBusiness] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) throw new Error(t('business:register.loginRequired'));

      setMeId(user.id);
      const { data } = await supabase.from('profiles').select('is_business').eq('id', user.id).maybeSingle();
      setIsBusiness(data?.is_business ?? false);
    } catch (e: any) {
      showUnregisterToast(e?.message ?? t('business:unregister.loadFail'), 'danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitUnregister = useCallback(async () => {
    try {
      setSubmitting(true);
      const { error } = await supabase.from('profiles').update({ is_business: false }).eq('id', meId);
      if (error) throw error;

      setIsBusiness(false);
      showUnregisterAlert({
        title: t('business:unregister.successTitle'),
        message: t('business:unregister.successDesc'),
        singleButton: true,
        onConfirm: () => navigation.goBack(),
      });
    } catch (e: any) {
      showUnregisterToast(e?.message ?? t('business:unregister.submitFail'), 'danger');
    } finally {
      setSubmitting(false);
    }
  }, [meId, navigation, showUnregisterAlert, showUnregisterToast, t]);

  const handleUnregister = useCallback(() => {
    showUnregisterAlert({
      title: t('business:unregister.confirmTitle'),
      message: t('business:unregister.confirmDesc'),
      variant: 'danger',
      singleButton: false,
      confirmText: t('business:unregister.action'),
      cancelText: t('business:common.cancel'),
      onConfirm: submitUnregister,
    });
  }, [showUnregisterAlert, submitUnregister, t]);

  if (loading) {
    return (
      <SafeScreen
        backgroundColor={ui.background}
        includeTopInset={false}
        includeBottomInset
        contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
      >
        <GlobalHeader
          style={{
            backgroundColor: ui.headerBg,
            borderBottomColor: ui.headerBorder,
          }}
          titleComponent={
            <View style={styles.headerTitleRow}>
              <HeaderIconButton onPress={() => navigation.goBack()}>
                <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2.1} />
              </HeaderIconButton>
              <Text style={styles.headerTitle}>{t('business:unregister.title')}</Text>
            </View>
          }
        />
        <View style={styles.center}>
          <ActivityIndicator color={ui.textPrimary} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.headerBorder,
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2.1} />
            </HeaderIconButton>
            <Text style={styles.headerTitle}>{t('business:unregister.title')}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 10) + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <Text style={styles.cardLabel}>{t('business:unregister.accountState')}</Text>
          <View style={styles.statusRow}>
            {isBusiness ? (
              <>
                <CheckCircle2 size={20} color={ui.success} strokeWidth={2} />
                <Text style={styles.statusTextActive}>{t('business:status.verifiedBusiness')}</Text>
              </>
            ) : (
              <>
                <XCircle size={20} color={ui.iconMuted} strokeWidth={2} />
                <Text style={styles.statusTextInactive}>{t('business:status.normalAccount')}</Text>
              </>
            )}
          </View>
          <Text style={styles.statusDescription}>
            {isBusiness ? t('business:unregister.activeDesc') : t('business:unregister.inactiveDesc')}
          </Text>
        </View>

        {isBusiness ? (
          <>
            <View style={styles.warningBox}>
              <View style={styles.warningHeader}>
                <View style={styles.warningIconBox}>
                  <AlertTriangle size={22} color={ui.danger} strokeWidth={2} />
                </View>
                <View style={styles.warningTitleBox}>
                  <Text style={styles.warningTitle}>{t('business:unregister.warningTitle')}</Text>
                  <Text style={styles.warningSubtitle}>{t('business:unregister.warningDesc')}</Text>
                </View>
              </View>

              <View style={styles.bulletList}>
                <Text style={styles.bulletItem}>• {t('business:unregister.bulletBeacon')}</Text>
                <Text style={styles.bulletItem}>• {t('business:unregister.bulletTools')}</Text>
                <Text style={styles.bulletItem}>• {t('business:unregister.bulletData')}</Text>
              </View>
            </View>

            <Pressable style={({ pressed }) => [styles.dangerButton, submitting && styles.disabledButton, pressed && !submitting && styles.pressed]} onPress={handleUnregister} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerButtonText}>{t('business:unregister.action')}</Text>}
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('business:unregister.emptyTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('business:unregister.emptyDesc')}</Text>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => navigation.goBack()}>
              <Text style={styles.secondaryButtonText}>{t('business:unregister.back')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <CoonnAlert
        visible={unregisterAlert.visible}
        theme={alertThemeName}
        variant={unregisterAlert.variant}
        title={unregisterAlert.title}
        message={unregisterAlert.message}
        confirmText={unregisterAlert.confirmText}
        cancelText={unregisterAlert.cancelText}
        singleButton={unregisterAlert.singleButton}
        onConfirm={handleUnregisterAlertConfirm}
        onCancel={closeUnregisterAlert}
        dismissOnBackdrop={false}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Math.max(insets.bottom + 28, 36)}
        onHidden={hideToast}
      />
    </SafeScreen>
  );
}

function createStyles(ui: BusinessOwnerTheme) {
  return StyleSheet.create({
    pressed: { opacity: ui.pressedOpacity },
    container: { flex: 1, backgroundColor: ui.background },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.background,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: ui.textPrimary,
      letterSpacing: -0.2,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    statusCard: {
      padding: 18,
      borderRadius: ui.radius.container,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginBottom: 14,
      ...ui.shadowSoft,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: ui.textSecondary,
      marginBottom: 8,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusTextActive: {
      fontSize: 19,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.4,
    },
    statusTextInactive: {
      fontSize: 19,
      fontWeight: '800',
      color: ui.textSecondary,
      letterSpacing: -0.4,
    },
    statusDescription: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    warningBox: {
      padding: 18,
      borderRadius: ui.radius.container,
      backgroundColor: ui.dangerSoft,
      borderWidth: ui.hairline,
      borderColor: ui.isDark ? 'rgba(239, 68, 68, 0.28)' : '#FECACA',
      marginBottom: 18,
    },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    warningIconBox: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.isDark ? 'rgba(239, 68, 68, 0.10)' : '#FFFFFF',
      borderWidth: ui.hairline,
      borderColor: ui.isDark ? 'rgba(239, 68, 68, 0.22)' : '#FECACA',
      marginRight: 12,
    },
    warningTitleBox: { flex: 1 },
    warningTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.3,
    },
    warningSubtitle: {
      marginTop: 3,
      fontSize: 12,
      fontWeight: '600',
      color: ui.textSecondary,
    },
    bulletList: {
      padding: 14,
      borderRadius: ui.radius.md,
      backgroundColor: ui.isDark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.62)',
      borderWidth: ui.hairline,
      borderColor: ui.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.12)',
      gap: 7,
    },
    bulletItem: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    dangerButton: {
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.container,
      backgroundColor: ui.danger,
    },
    disabledButton: { opacity: 0.72 },
    dangerButtonText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.2,
    },
    emptyCard: {
      alignItems: 'center',
      padding: 22,
      borderRadius: ui.radius.container,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: ui.textPrimary,
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    emptyDescription: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
      textAlign: 'center',
      color: ui.textSecondary,
      marginBottom: 18,
    },
    secondaryButton: {
      height: 44,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.md,
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: ui.textPrimary,
    },
  });
}
