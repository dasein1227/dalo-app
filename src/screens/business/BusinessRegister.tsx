// src/screens/business/BusinessRegister.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Building2,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createBusinessOwnerTheme, type BusinessOwnerTheme } from './BusinessOwner.theme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

type RegisterAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  singleButton: boolean;
  confirmText: string;
  cancelText: string;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_REGISTER_ALERT: RegisterAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  confirmText: '',
  cancelText: '',
};

export default function BusinessRegister() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessOwnerTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [registerAlert, setRegisterAlert] = useState<RegisterAlertState>(EMPTY_REGISTER_ALERT);

  const alertThemeName = useMemo<'coonn_light' | 'coonn_dark'>(
    () => ((appTheme as any)?.isDark ? 'coonn_dark' : 'coonn_light'),
    [appTheme],
  );

  const showRegisterToast = useCallback(
    (message: string, tone: 'default' | 'success' | 'warning' | 'danger' = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const closeRegisterAlert = useCallback(() => {
    setRegisterAlert((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  }, []);

  const showRegisterAlert = useCallback((params: {
    title: string;
    message?: string;
    variant?: CoonnAlertVariant;
    singleButton?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
  }) => {
    setRegisterAlert({
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

  const handleRegisterAlertConfirm = useCallback(async () => {
    const action = registerAlert.onConfirm;
    closeRegisterAlert();
    await action?.();
  }, [closeRegisterAlert, registerAlert.onConfirm]);

  const [meId, setMeId] = useState<string>('');
  const [licenseImgUri, setLicenseImgUri] = useState<string | null>(null);
  const [licenseStoragePath, setLicenseStoragePath] = useState<string | null>(null);
  const [licenseNum, setLicenseNum] = useState('');
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [contact, setContact] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) throw new Error(t('business:register.loginRequired'));
      setMeId(user.id);
    } catch (e: any) {
      showRegisterAlert({
        title: t('business:common.error'),
        message: e?.message ?? String(e),
        variant: 'danger',
        singleButton: true,
        onConfirm: () => navigation.goBack(),
      });
    }
  }, [navigation, showRegisterAlert, t]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handlePickLicense = async () => {
    try {
      if (!meId) return;

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showRegisterAlert({
          title: t('business:register.permissionTitle'),
          message: t('business:register.permissionDesc'),
          singleButton: true,
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploading(true);
      const uri = asset.uri;
      const fileExt = asset.fileName?.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `licenses/${meId}/${fileName}`;
      const resp = await fetch(uri);
      const blob = await resp.blob();

      const { error } = await supabase.storage.from('business_licenses').upload(filePath, blob, {
        upsert: true,
        contentType: asset.mimeType ?? 'image/jpeg',
      });

      if (error) throw error;

      setLicenseImgUri(uri);
      setLicenseStoragePath(filePath);
    } catch {
      showRegisterToast(t('business:register.uploadFail'), 'danger');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!licenseStoragePath || !licenseImgUri) {
      showRegisterToast(t('business:register.licenseRequired'), 'warning');
      return;
    }

    if (!licenseNum.trim() || !storeName.trim() || !ownerName.trim()) {
      showRegisterToast(t('business:register.requiredFields'), 'warning');
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.from('business_registrations').insert({
        user_id: meId,
        license_path: licenseStoragePath,
        license_num: licenseNum.trim(),
        store_name: storeName.trim(),
        owner_name: ownerName.trim(),
        contact: contact.trim() || null,
        status: 'pending',
      });

      if (error) throw error;

      showRegisterAlert({
        title: t('business:register.successTitle'),
        message: t('business:register.successDesc'),
        singleButton: true,
        onConfirm: () => navigation.goBack(),
      });
    } catch (e: any) {
      showRegisterToast(e?.message ?? t('business:register.submitFail'), 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = !!licenseStoragePath && !!licenseNum.trim() && !!storeName.trim() && !!ownerName.trim();

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
            <Text style={styles.headerTitle}>{t('business:register.title')}</Text>
          </View>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <View style={styles.heroIconBox}>
              <ShieldCheck size={22} color={ui.icon} strokeWidth={1.8} />
            </View>
            <Text style={styles.heroTitle}>{t('business:register.heroTitle')}</Text>
            <Text style={styles.heroDesc}>{t('business:register.heroDesc')}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('business:register.license')}</Text>
              <Text style={styles.required}>{t('business:common.required')}</Text>
            </View>

            <Pressable style={({ pressed }) => [styles.uploadBox, licenseImgUri && styles.uploadBoxActive, pressed && styles.pressed]} onPress={uploading ? undefined : handlePickLicense}>
              {uploading ? (
                <View style={styles.uploadPlaceholder}>
                  <ActivityIndicator color={ui.textPrimary} />
                  <Text style={styles.uploadTitle}>{t('business:register.uploadingImage')}</Text>
                  <Text style={styles.uploadDesc}>{t('business:register.wait')}</Text>
                </View>
              ) : licenseImgUri ? (
                <>
                  <Image source={{ uri: licenseImgUri }} style={styles.previewImage} resizeMode="cover" />
                  <View style={styles.reuploadBadge}>
                    <Camera size={14} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.reuploadText}>{t('business:register.pickAgain')}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <View style={styles.iconCircle}>
                    <Camera size={23} color={ui.icon} strokeWidth={1.8} />
                  </View>
                  <Text style={styles.uploadTitle}>{t('business:register.pickImage')}</Text>
                  <Text style={styles.uploadDesc}>{t('business:register.licenseGuide')}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('business:register.businessInfo')}</Text>

            <View style={styles.inputGroup}>
              <FileText size={18} color={ui.iconMuted} strokeWidth={1.8} />
              <TextInput
                style={styles.input}
                placeholder={t('business:register.licenseNum')}
                placeholderTextColor={ui.textDisabled}
                keyboardType="numeric"
                value={licenseNum}
                onChangeText={(t) => setLicenseNum(t.replace(/[^0-9]/g, ''))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Building2 size={18} color={ui.iconMuted} strokeWidth={1.8} />
              <TextInput
                style={styles.input}
                placeholder={t('business:register.storeName')}
                placeholderTextColor={ui.textDisabled}
                value={storeName}
                onChangeText={setStoreName}
              />
            </View>

            <View style={styles.inputGroup}>
              <User size={18} color={ui.iconMuted} strokeWidth={1.8} />
              <TextInput
                style={styles.input}
                placeholder={t('business:register.ownerName')}
                placeholderTextColor={ui.textDisabled}
                value={ownerName}
                onChangeText={setOwnerName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Phone size={18} color={ui.iconMuted} strokeWidth={1.8} />
              <TextInput
                style={styles.input}
                placeholder={t('business:register.contact')}
                placeholderTextColor={ui.textDisabled}
                keyboardType="phone-pad"
                value={contact}
                onChangeText={(t) => setContact(t.replace(/[^0-9]/g, ''))}
              />
            </View>
          </View>

          <View style={styles.noticeBox}>
            <View style={styles.noticeRow}>
              <CheckCircle2 size={16} color={ui.info} strokeWidth={2} />
              <Text style={styles.noticeText}>{t('business:register.reviewTime')}</Text>
            </View>
            <View style={styles.noticeRow}>
              <AlertCircle size={16} color={ui.iconMuted} strokeWidth={2} />
              <Text style={styles.noticeText}>{t('business:register.matchGuide')}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.submitButton, (!isValid || submitting) && styles.submitButtonDisabled, pressed && isValid && !submitting && styles.pressed]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
        >
          {submitting ? <ActivityIndicator color={ui.primaryButtonText} /> : <Text style={[styles.submitButtonText, (!isValid || submitting) && styles.submitButtonTextDisabled]}>{t('business:register.submit')}</Text>}
        </Pressable>
      </View>

      <CoonnAlert
        visible={registerAlert.visible}
        theme={alertThemeName}
        variant={registerAlert.variant}
        title={registerAlert.title}
        message={registerAlert.message}
        confirmText={registerAlert.confirmText}
        cancelText={registerAlert.cancelText}
        singleButton={registerAlert.singleButton}
        onConfirm={handleRegisterAlertConfirm}
        onCancel={closeRegisterAlert}
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
    flex: { flex: 1 },
    pressed: { opacity: ui.pressedOpacity },
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
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 28,
    },
    heroCard: {
      padding: 18,
      borderRadius: ui.radius.container,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginBottom: 22,
      ...ui.shadowSoft,
    },
    heroIconBox: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginBottom: 14,
    },
    heroTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
      color: ui.textPrimary,
      letterSpacing: -0.6,
      marginBottom: 8,
    },
    heroDesc: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    section: { marginBottom: 24 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: ui.textPrimary,
      letterSpacing: -0.2,
      marginBottom: 10,
    },
    required: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: ui.radius.pill,
      overflow: 'hidden',
      backgroundColor: ui.dangerSoft,
      color: ui.danger,
      fontSize: 11,
      fontWeight: '700',
    },
    uploadBox: {
      minHeight: 178,
      borderRadius: ui.radius.container,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      borderStyle: 'dashed',
      backgroundColor: ui.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    uploadBoxActive: {
      borderStyle: 'solid',
      backgroundColor: ui.surface,
    },
    uploadPlaceholder: { alignItems: 'center', paddingHorizontal: 22 },
    iconCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginBottom: 12,
    },
    uploadTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: ui.textPrimary,
      marginTop: 8,
      marginBottom: 4,
    },
    uploadDesc: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
      color: ui.textSecondary,
      textAlign: 'center',
    },
    previewImage: { width: '100%', height: '100%' },
    reuploadBadge: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: ui.radius.pill,
      backgroundColor: 'rgba(0, 0, 0, 0.62)',
    },
    reuploadText: {
      marginLeft: 4,
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    inputGroup: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      borderRadius: ui.radius.md,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      backgroundColor: ui.surface,
      marginBottom: 10,
    },
    input: {
      flex: 1,
      paddingVertical: 0,
      fontSize: 15,
      fontWeight: '500',
      color: ui.textPrimary,
    },
    noticeBox: {
      padding: 15,
      borderRadius: ui.radius.container,
      borderWidth: ui.hairline,
      borderColor: ui.borderSoft,
      backgroundColor: ui.infoSoft,
      gap: 9,
    },
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    noticeText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: ui.background,
      borderTopWidth: ui.hairline,
      borderTopColor: ui.divider,
    },
    submitButton: {
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.container,
      backgroundColor: ui.primaryButtonBackground,
    },
    submitButtonDisabled: { backgroundColor: ui.disabledButtonBackground },
    submitButtonText: {
      fontSize: 16,
      fontWeight: '800',
      color: ui.primaryButtonText,
      letterSpacing: -0.2,
    },
    submitButtonTextDisabled: { color: ui.disabledButtonText },
  });
}
