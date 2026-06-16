import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, HelpCircle, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import CoonnAlert from '@/components/CoonnAlert';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import { createProfileSetupTheme } from './ProfileSetup.theme';

const NICKNAME_MAX_LENGTH = 30;
const COONN_ID_MIN_LENGTH = 3;
const COONN_ID_MAX_LENGTH = 30;
const STATUS_MESSAGE_MAX_LENGTH = 80;
const COONN_ID_PATTERN = /^[a-z0-9_]{3,30}$/;

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: 'default' | 'danger';
};

const EMPTY_ALERT: AlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

function sanitizeCoonnId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_]/g, '');
}

function getImageContentType(ext: string) {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

async function uploadProfileImage(uri: string | null, userId: string) {
  if (!uri || !uri.startsWith('file://')) return uri;

  const rawExt = uri.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = rawExt === 'jpeg' ? 'jpg' : rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
  const finalExt = safeExt === 'heif' ? 'heic' : safeExt;
  const fileName = `profiles/${userId}/avatar_${Date.now()}.${finalExt}`;

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: getImageContentType(finalExt),
  } as any);

  const { error } = await supabase.storage
    .from('profile-images')
    .upload(fileName, formData, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('profile-images')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

const PROFILE_SETUP_SELECT = 'id, user_id, nickname, avatar_url, private_avatar_url, follow_id, status_message' as const;

async function loadProfileByUserId(userId: string) {
  const byId = await supabase
    .from('profiles')
    .select(PROFILE_SETUP_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (byId.error) throw byId.error;
  if (byId.data) return byId.data;

  const byUserId = await supabase
    .from('profiles')
    .select(PROFILE_SETUP_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (byUserId.error) return null;
  return byUserId.data ?? null;
}

async function saveProfilePatch(userId: string, patch: Record<string, any>) {
  const byId = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (byId.error) throw byId.error;
  if (byId.data) return;

  const byUserId = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (!byUserId.error && byUserId.data) return;

  const upsertWithUserId = await supabase
    .from('profiles')
    .upsert({ id: userId, user_id: userId, ...patch }, { onConflict: 'id' });

  if (!upsertWithUserId.error) return;

  const upsertById = await supabase
    .from('profiles')
    .upsert({ id: userId, ...patch }, { onConflict: 'id' });

  if (upsertById.error) throw upsertById.error;
}

async function checkCoonnIdAvailable(userId: string, value: string) {
  const rpc = await supabase.rpc('check_profile_identifier_available', {
    p_field: 'follow_id',
    p_value: value,
  });

  if (!rpc.error) return !!rpc.data;

  const existing = await supabase
    .from('profiles')
    .select('id')
    .eq('follow_id', value)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw rpc.error;
  if (!existing.data) return true;
  return existing.data.id === userId;
}

export default function ProfileSetup() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = useMemo(() => createProfileSetupTheme(appTheme), [appTheme]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [coonnId, setCoonnId] = useState('');
  const [originalCoonnId, setOriginalCoonnId] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);

  const avatarInitial = useMemo(() => {
    return (nickname.trim() || coonnId.trim() || 'C').slice(0, 1).toUpperCase();
  }, [coonnId, nickname]);

  const showAlert = useCallback((next: Omit<AlertState, 'visible'>) => {
    setAlertState({ ...next, visible: true });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(EMPTY_ALERT);
  }, []);

  const complete = useCallback(() => {
    const nextRoute = route.params?.nextRoute;

    if (typeof nextRoute === 'string' && nextRoute.length > 0) {
      navigation.reset({ index: 0, routes: [{ name: nextRoute }] });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }, [navigation, route.params?.nextRoute]);

  const handleLater = useCallback(async () => {
    if (saving) return;

    try {
      setSaving(true);

      if (meId) {
        await saveProfilePatch(meId, {
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      complete();
    } catch (e: any) {
      showAlert({
        title: t('common:error'),
        message: e?.message || t('auth:profileSetup.errorSaveFailed'),
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  }, [complete, meId, saving, showAlert, t]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const uid = data.user?.id;
      if (!uid) throw new Error(t('auth:profileSetup.errorLoginRequired'));

      setMeId(uid);

      const profile = await loadProfileByUserId(uid);
      const currentNickname = String(profile?.nickname ?? '').trim();
      const currentCoonnId = String(profile?.follow_id ?? '').trim().toLowerCase();
      const currentStatusMessage = String(profile?.status_message ?? '').trim();
      const currentAvatarUrl = profile?.avatar_url ?? profile?.private_avatar_url ?? null;

      setNickname(currentNickname);
      setCoonnId(currentCoonnId);
      setOriginalCoonnId(currentCoonnId);
      setStatusMessage(currentStatusMessage);
      setAvatarUrl(currentAvatarUrl);
    } catch (e: any) {
      showAlert({
        title: t('common:error'),
        message: e?.message || t('auth:profileSetup.errorLoadFailed'),
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [showAlert, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openPicker = useCallback(() => {
    if (saving) return;
    setPickerVisible(true);
  }, [saving]);

  const handleMediaSelect = useCallback((images: SimplePickedImage[]) => {
    const selected = images[0];
    if (!selected?.uri) return;
    setTempImageUri(selected.uri);
    setPickerVisible(false);
    setTimeout(() => setEditorVisible(true), 180);
  }, []);

  const handleEditorSave = useCallback((uri: string) => {
    setEditorVisible(false);
    setTempImageUri(null);
    setAvatarUrl(uri);
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    if (saving) return;
    setAvatarUrl(null);
  }, [saving]);

  const openHelp = useCallback((key: 'photo' | 'nickname' | 'coonnId' | 'statusMessage') => {
    showAlert({
      title: t(`auth:profileSetup.help.${key}.title`),
      message: t(`auth:profileSetup.help.${key}.message`),
      variant: 'default',
    });
  }, [showAlert, t]);

  const handleSave = useCallback(async () => {
    if (!meId) return;

    const normalizedNickname = nickname.trim();
    const normalizedCoonnId = sanitizeCoonnId(coonnId);
    const normalizedStatusMessage = statusMessage.trim();

    if (!normalizedNickname) {
      showAlert({
        title: t('auth:profileSetup.errorTitle'),
        message: t('auth:profileSetup.errorNicknameRequired'),
        variant: 'default',
      });
      return;
    }

    if (normalizedNickname.length > NICKNAME_MAX_LENGTH) {
      showAlert({
        title: t('auth:profileSetup.errorTitle'),
        message: t('auth:profileSetup.errorNicknameTooLong'),
        variant: 'default',
      });
      return;
    }

    if (!normalizedCoonnId) {
      showAlert({
        title: t('auth:profileSetup.errorTitle'),
        message: t('auth:profileSetup.errorCoonnIdRequired'),
        variant: 'default',
      });
      return;
    }

    if (!COONN_ID_PATTERN.test(normalizedCoonnId)) {
      showAlert({
        title: t('auth:profileSetup.errorTitle'),
        message: t('auth:profileSetup.errorCoonnIdInvalid'),
        variant: 'default',
      });
      return;
    }

    try {
      Keyboard.dismiss();
      setSaving(true);

      if (normalizedCoonnId !== originalCoonnId) {
        const available = await checkCoonnIdAvailable(meId, normalizedCoonnId);
        if (!available) {
          showAlert({
            title: t('auth:profileSetup.errorTitle'),
            message: t('auth:profileSetup.errorCoonnIdTaken'),
            variant: 'default',
          });
          return;
        }
      }

      const finalAvatarUrl = await uploadProfileImage(avatarUrl, meId);

      await saveProfilePatch(meId, {
        nickname: normalizedNickname,
        follow_id: normalizedCoonnId,
        status_message: normalizedStatusMessage || null,
        avatar_url: finalAvatarUrl,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      setNickname(normalizedNickname);
      setCoonnId(normalizedCoonnId);
      setOriginalCoonnId(normalizedCoonnId);
      setStatusMessage(normalizedStatusMessage);
      setAvatarUrl(finalAvatarUrl);
      complete();
    } catch (e: any) {
      showAlert({
        title: t('common:error'),
        message: e?.message || t('auth:profileSetup.errorSaveFailed'),
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  }, [avatarUrl, complete, coonnId, meId, nickname, originalCoonnId, showAlert, statusMessage, t]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <StatusBar translucent={false} backgroundColor={colors.background} barStyle={colors.statusBarStyle} />
        <ActivityIndicator color={colors.textPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar translucent={false} backgroundColor={colors.background} barStyle={colors.statusBarStyle} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 10) + 116 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('auth:profileSetup.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth:profileSetup.subtitle')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
            <View style={styles.avatarArea}>
              <Pressable onPress={openPicker} disabled={saving} style={styles.avatarPressable}>
                <View style={[styles.avatar, { backgroundColor: colors.avatarBg, borderColor: colors.avatarBorder }]}> 
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <Text style={[styles.avatarInitial, { color: colors.avatarText }]}>{avatarInitial}</Text>
                  )}
                </View>
                <View style={[styles.cameraBadge, { backgroundColor: colors.cameraBadgeBg, borderColor: colors.cameraBadgeBorder }]}> 
                  <Camera size={15} color={colors.cameraBadgeIcon} />
                </View>
              </Pressable>

              {avatarUrl ? (
                <Pressable onPress={handleRemoveAvatar} disabled={saving} style={[styles.avatarRemove, { backgroundColor: colors.clearBg }]}> 
                  <X size={13} color={colors.clearIcon} />
                </Pressable>
              ) : null}

              <View style={styles.photoLabelRow}>
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>{t('auth:profileSetup.photo')}</Text>
                <HelpButton colors={colors} onPress={() => openHelp('photo')} />
              </View>
            </View>

            <ProfileInput
              colors={colors}
              label={t('auth:profileSetup.nickname')}
              value={nickname}
              onChangeText={setNickname}
              placeholder={t('auth:profileSetup.nicknamePlaceholder')}
              maxLength={NICKNAME_MAX_LENGTH}
              onHelp={() => openHelp('nickname')}
              editable={!saving}
            />

            <ProfileInput
              colors={colors}
              label={t('auth:profileSetup.coonnId')}
              value={coonnId}
              onChangeText={(value) => setCoonnId(sanitizeCoonnId(value))}
              placeholder={t('auth:profileSetup.coonnIdPlaceholder')}
              maxLength={COONN_ID_MAX_LENGTH}
              onHelp={() => openHelp('coonnId')}
              editable={!saving}
              autoCapitalize="none"
              autoCorrect={false}
              prefix="@"
              caption={t('auth:profileSetup.coonnIdGuide', {
                min: COONN_ID_MIN_LENGTH,
                max: COONN_ID_MAX_LENGTH,
              })}
            />

            <ProfileInput
              colors={colors}
              label={t('auth:profileSetup.statusMessage')}
              value={statusMessage}
              onChangeText={setStatusMessage}
              placeholder={t('auth:profileSetup.statusPlaceholder')}
              maxLength={STATUS_MESSAGE_MAX_LENGTH}
              onHelp={() => openHelp('statusMessage')}
              editable={!saving}
              multiline
              numberOfLines={3}
              caption={`${statusMessage.length}/${STATUS_MESSAGE_MAX_LENGTH}`}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.footerBg, borderTopColor: colors.footerBorder }]}> 
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.primaryButton, { backgroundColor: colors.primaryButtonBg }, saving && styles.disabled]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryButtonText} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.primaryButtonText }]}>{t('auth:profileSetup.start')}</Text>
            )}
          </Pressable>
          <Pressable onPress={handleLater} disabled={saving} style={styles.secondaryButton}>
            <Text style={[styles.secondaryButtonText, { color: colors.secondaryButtonText }]}>{t('auth:profileSetup.later')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleMediaSelect}
        maxSelect={1}
        headerTitle={t('auth:profileSetup.pickerPhoto')}
        themeColor={colors.primaryButtonBg}
      />

      <UniversalImageEditor
        visible={editorVisible}
        sourceUri={tempImageUri || ''}
        onClose={() => {
          setEditorVisible(false);
          setTempImageUri(null);
        }}
        onSave={handleEditorSave}
        themeColor={colors.primaryButtonBg}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={colors.alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={t('common:ok')}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />
    </SafeAreaView>
  );
}

function HelpButton({ colors, onPress }: { colors: ReturnType<typeof createProfileSetupTheme>; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      style={[styles.helpButton, { backgroundColor: colors.helpBg, borderColor: colors.helpBorder }]}
    >
      <HelpCircle size={13} color={colors.helpIcon} />
    </Pressable>
  );
}

function ProfileInput({
  colors,
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  onHelp,
  editable,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  prefix,
  caption,
  multiline = false,
  numberOfLines = 1,
}: {
  colors: ReturnType<typeof createProfileSetupTheme>;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  maxLength: number;
  onHelp: () => void;
  editable: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  prefix?: string;
  caption?: string;
  multiline?: boolean;
  numberOfLines?: number;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.inputBlock}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        <HelpButton colors={colors} onPress={onHelp} />
      </View>

      <View
        style={[
          styles.inputShell,
          multiline && styles.inputShellMultiline,
          {
            backgroundColor: focused ? colors.inputFocusedBg : colors.inputBg,
            borderColor: focused ? colors.inputFocusedBorder : colors.inputBorder,
          },
        ]}
      >
        {prefix ? <Text style={[styles.prefix, { color: colors.textMuted }]}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          style={[
            styles.input,
            multiline && styles.multilineInput,
            { color: colors.textPrimary },
          ]}
          maxLength={maxLength}
          editable={editable}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {value.length > 0 ? (
          <Pressable onPress={() => onChangeText('')} hitSlop={8} style={[styles.clearButton, { backgroundColor: colors.clearBg }]}> 
            <X size={12} color={colors.clearIcon} />
          </Pressable>
        ) : null}
      </View>

      {caption ? <Text style={[styles.caption, { color: colors.textMuted }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  keyboardAvoid: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 28 },
  hero: { paddingHorizontal: 2, marginBottom: 20 },
  title: { fontSize: 26, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, fontWeight: '400', letterSpacing: -0.1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 },
  avatarArea: { alignItems: 'center', marginBottom: 22 },
  avatarPressable: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 36, lineHeight: 42, fontWeight: '600' },
  cameraBadge: { position: 'absolute', right: 7, bottom: 9, width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  avatarRemove: { position: 'absolute', top: 2, right: '50%', marginRight: -60, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  photoLabelRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  inputBlock: { marginTop: 15 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  helpButton: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  inputShell: { minHeight: 50, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  inputShellMultiline: { minHeight: 86, alignItems: 'flex-start', paddingTop: 13, paddingBottom: 10 },
  prefix: { fontSize: 15, lineHeight: 20, fontWeight: '600', marginRight: 2 },
  input: { flex: 1, minHeight: 44, paddingVertical: 0, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  multilineInput: { minHeight: 58, paddingTop: 0, paddingBottom: 0 },
  clearButton: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  caption: { marginTop: 6, fontSize: 12, lineHeight: 17, fontWeight: '400' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  primaryButton: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.1 },
  secondaryButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  disabled: { opacity: 0.58 },
});
