import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  AtSign,
  Hash,
  Eye,
  Smartphone,
  Mail,
  HelpCircle,
  Camera,
  X,
  User,
  Trash2,
  LucideIcon
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

import { useAppTheme } from '@/theme/useAppTheme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import { createAccountSettingsTheme } from './AccountSettings.theme';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import AccountWithdrawalNoticeModal from './components/AccountWithdrawalNoticeModal';
import AccountWithdrawalSurveyModal from './components/AccountWithdrawalSurveyModal';
import AccountWithdrawalConfirmModal from './components/AccountWithdrawalConfirmModal';
import type { AccountWithdrawalPayload, AccountWithdrawalReasonOption } from './components/accountWithdrawal.types';


const ACCOUNT_PROFILE_SELECT =
  'user_id, nickname, avatar_url, private_avatar_url, follow_id, friend_code, phone_number, phone_verified, show_nickname_to_friends' as const;

type IdentifierStatus = 'none' | 'success' | 'duplicate' | 'invalid';

type AccountAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_ACCOUNT_ALERT: AccountAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

const IDENTIFIER_MIN_LENGTH = 3;
const IDENTIFIER_MAX_LENGTH = 30;
const IDENTIFIER_GUIDE_TEXT = `${IDENTIFIER_MIN_LENGTH}~${IDENTIFIER_MAX_LENGTH} · a-z, 0-9, _`;
const IDENTIFIER_PATTERN = /^[a-z0-9_]{3,30}$/;
const NICKNAME_MAX_LENGTH = 30;

const uploadProfileImage = async (uri: string | null, userId: string) => {
  if (!uri || !uri.startsWith('file://')) return uri;

  const ext = uri.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ext === 'jpeg' ? 'jpg' : ext.replace(/[^a-z0-9]/g, '') || 'jpg';
  const contentType = safeExt === 'png'
    ? 'image/png'
    : safeExt === 'webp'
      ? 'image/webp'
      : safeExt === 'heic' || safeExt === 'heif'
        ? 'image/heic'
        : 'image/jpeg';
  const fileName = `profiles/${userId}/avatar_${Date.now()}.${safeExt === 'heif' ? 'heic' : safeExt}`;

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: contentType,
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
};


const BouncyPressable = ({ onPress, style, children, disabled }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleValue, { toValue: 0.96, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={disabled ? undefined : onPressIn} onPressOut={disabled ? undefined : onPressOut} disabled={disabled}>
      <Animated.View style={[style, { transform: [{ scale: scaleValue }] }]}>{children}</Animated.View>
    </Pressable>
  );
};


const CoonnSwitch = ({
  value,
  onValueChange,
  colors,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  colors: any;
}) => {
  const trackBg = value ? colors.switchTrackOn : colors.switchTrackOff;
  const trackBorder = value ? colors.switchTrackOnBorder : colors.switchTrackOffBorder;
  const thumbBg = value ? colors.switchThumbOn : colors.switchThumbOff;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => onValueChange(!value)}
      style={[
        styles.coonnSwitchTrack,
        {
          backgroundColor: trackBg,
          borderColor: trackBorder,
        },
      ]}
    >
      <View
        style={[
          styles.coonnSwitchThumb,
          value && styles.coonnSwitchThumbOn,
          { backgroundColor: thumbBg },
        ]}
      />
    </Pressable>
  );
};

const InteractiveInput = React.memo(({
  value,
  onChangeText,
  onBlur,
  onCheckDuplicate,
  checkDisabled,
  checkLabel,
  checkingLabel,
  availableLabel,
  duplicateLabel,
  placeholder,
  loading,
  status,
  colors,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onBlur: () => void;
  onCheckDuplicate: () => void;
  checkDisabled: boolean;
  checkLabel: string;
  checkingLabel: string;
  availableLabel: string;
  duplicateLabel: string;
  placeholder: string;
  loading: boolean;
  status: IdentifierStatus;
  colors: any;
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const isSuccess = status === 'success';
  const isDuplicate = status === 'duplicate';
  const isInvalid = status === 'invalid';
  const hasErrorState = isDuplicate || isInvalid;
  const isBlocked = checkDisabled || loading || isSuccess;

  const actionLabel = loading
    ? checkingLabel
    : isSuccess
      ? availableLabel
      : isDuplicate
        ? duplicateLabel
        : checkLabel;

  return (
    <View
      style={[
        styles.inputWrapper,
        {
          backgroundColor: colors.inputBg,
          borderColor: colors.inputBorder,
        },
        isFocused && {
          backgroundColor: colors.inputFocusedBg,
          borderColor: colors.inputFocusedBorder,
        },
        isSuccess && {
          borderColor: colors.inputSuccessBorder,
        },
        hasErrorState && {
          backgroundColor: colors.inputErrorBg,
          borderColor: colors.inputErrorBorder,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={() => {
          setIsFocused(false);
          onBlur();
        }}
        onFocus={() => setIsFocused(true)}
        style={[styles.textInput, { color: colors.textPrimary }]}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        onPress={onCheckDuplicate}
        disabled={isBlocked}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [
          styles.inputActionBtn,
          {
            backgroundColor: isSuccess
              ? colors.inputActionSuccessBg
              : isDuplicate
                ? colors.inputActionDuplicateBg
                : isBlocked
                  ? colors.inputActionDisabledBg
                  : colors.inputActionBg,
            borderColor: isSuccess
              ? colors.inputActionSuccessBorder
              : isDuplicate
                ? colors.inputActionDuplicateBorder
                : isBlocked
                  ? colors.inputActionDisabledBorder
                  : colors.inputActionBorder,
            opacity: pressed && !isBlocked ? 0.72 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.inputActionText,
            {
              color: isSuccess
                ? colors.inputActionSuccessText
                : isDuplicate
                  ? colors.inputActionDuplicateText
                  : isBlocked
                    ? colors.inputActionDisabledText
                    : colors.inputActionText,
            },
          ]}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
});

const SectionIcon = ({ icon: Icon, colors }: { icon: LucideIcon, colors: any }) => (
  <View
    style={[
      styles.miniIcon,
      {
        backgroundColor: colors.iconBoxBg,
        borderColor: colors.iconBoxBorder,
      },
    ]}
  >
    <Icon size={17} color={colors.icon} strokeWidth={1.9} />
  </View>
);

export default function AccountSettings() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createAccountSettingsTheme(appTheme);
  const isDark = Boolean((appTheme as any)?.isDark);
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';

  const [meId, setMeId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [nickname, setNickname] = useState('');
  const [originalNickname, setOriginalNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);

  const [followId, setFollowId] = useState('');
  const [originalFollowId, setOriginalFollowId] = useState('');
  const [checkingFollow, setCheckingFollow] = useState(false);
  const [followIdStatus, setFollowIdStatus] = useState<IdentifierStatus>('none');

  const [friendCode, setFriendCode] = useState('');
  const [originalFriendCode, setOriginalFriendCode] = useState('');
  const [checkingFriend, setCheckingFriend] = useState(false);
  const [friendCodeStatus, setFriendCodeStatus] = useState<IdentifierStatus>('none');

  const [showNickname, setShowNickname] = useState(true);
  const [originalShowNickname, setOriginalShowNickname] = useState(true);

  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [alertState, setAlertState] = useState<AccountAlertState>(EMPTY_ACCOUNT_ALERT);
  const [withdrawalNoticeVisible, setWithdrawalNoticeVisible] = useState(false);
  const [withdrawalSurveyVisible, setWithdrawalSurveyVisible] = useState(false);
  const [withdrawalConfirmVisible, setWithdrawalConfirmVisible] = useState(false);
  const [withdrawalReasons, setWithdrawalReasons] = useState<AccountWithdrawalReasonOption[]>([]);
  const [withdrawalReasonsLoading, setWithdrawalReasonsLoading] = useState(false);
  const [withdrawalPayload, setWithdrawalPayload] = useState<AccountWithdrawalPayload | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const toastTheme = createCoonnFloatingToastTheme(
    {
      isDark,
      surface: (colors as any).toastBg ?? colors.card,
      textPrimary: (colors as any).toastText ?? colors.textPrimary,
      border: (colors as any).toastBorder ?? colors.cardBorder,
      accentColor: (colors as any).controlSelected ?? (colors as any).accent,
      dangerColor: (colors as any).dangerText ?? undefined,
      shadowColor: (colors as any).controlSelected ?? '#0A0A0A',
    },
    toast.tone,
  );

  const withdrawalTone = {
    cardBg: isDark ? 'rgba(128, 70, 70, 0.16)' : 'rgba(164, 80, 80, 0.075)',
    cardBorder: isDark ? 'rgba(224, 150, 150, 0.24)' : 'rgba(164, 80, 80, 0.18)',
    iconBg: isDark ? 'rgba(224, 150, 150, 0.15)' : 'rgba(164, 80, 80, 0.10)',
    iconBorder: isDark ? 'rgba(224, 150, 150, 0.24)' : 'rgba(164, 80, 80, 0.16)',
    icon: isDark ? '#E6AAA6' : '#A24F4F',
    text: isDark ? '#E6AAA6' : '#944747',
    subText: isDark ? 'rgba(230, 170, 166, 0.68)' : 'rgba(148, 71, 71, 0.64)',
  };

  const showAlert = useCallback((next: Omit<AccountAlertState, 'visible'>) => {
    setAlertState({
      visible: true,
      title: next.title,
      message: next.message,
      variant: next.variant,
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  const applyStatusBar = useCallback(() => {
    try {
      navigation.setOptions?.({
        headerShown: false,
        statusBarColor: 'transparent',
        statusBarStyle: colors.navigationStatusBarStyle,
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS === 'android') {
      try {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
        StatusBar.setBarStyle(colors.statusBarStyle);
      } catch {}
    } else {
      try { StatusBar.setBarStyle(colors.statusBarStyle); } catch {}
    }
  }, [navigation, colors.navigationStatusBarStyle, colors.statusBarStyle]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let t1: any, t2: any;
      try { requestAnimationFrame(() => applyStatusBar()); } catch {}
      t1 = setTimeout(() => applyStatusBar(), 0);
      t2 = setTimeout(() => applyStatusBar(), 60);
      return () => { if(t1) clearTimeout(t1); if(t2) clearTimeout(t2); };
    }, [applyStatusBar])
  );

  useEffect(() => { applyStatusBar(); }, [applyStatusBar]);

  const load = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('errors:auth.loginRequired'));
      setMeId(user.id);
      setEmail(user.email ?? '');

      const { data: row, error } = await supabase.from('profiles').select(ACCOUNT_PROFILE_SELECT).eq('user_id', user.id).maybeSingle();
      if (error) throw error;

      if (row) {
        const nextNickname = String(row.nickname ?? '').trim();
        const nextAvatarUrl = (row.avatar_url ?? row.private_avatar_url ?? null) as string | null;
        const fId = (row.follow_id ?? '').toLowerCase();
        const fCode = (row.friend_code ?? '').toLowerCase();
        setNickname(nextNickname); setOriginalNickname(nextNickname);
        setAvatarUrl(nextAvatarUrl); setOriginalAvatarUrl(nextAvatarUrl);
        setFollowId(fId); setOriginalFollowId(fId);
        setFriendCode(fCode); setOriginalFriendCode(fCode);
        setPhoneNumber(row.phone_number ?? null);
        setPhoneVerified(!!row.phone_verified);
        setShowNickname(row.show_nickname_to_friends ?? true);
        setOriginalShowNickname(row.show_nickname_to_friends ?? true);
      }
    } catch (e: any) {
      showAlert({ title: t('common:error'), message: e?.message, variant: 'danger' });
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [showAlert, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openAvatarPicker = useCallback(() => {
    if (saving) return;
    setPickerVisible(true);
  }, [saving]);

  const handleAvatarSelect = useCallback((images: SimplePickedImage[]) => {
    const selected = images[0];
    if (!selected?.uri) return;
    setTempImageUri(selected.uri);
    setPickerVisible(false);
    setTimeout(() => setEditorVisible(true), 180);
  }, []);

  const handleEditorSave = useCallback((uri: string, _width?: number, _height?: number) => {
    setEditorVisible(false);
    setTempImageUri(null);
    setAvatarUrl(uri);
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    if (saving) return;
    setAvatarUrl(null);
  }, [saving]);

  const identifierPattern = IDENTIFIER_PATTERN;

  const normalizeIdentifier = useCallback((value: string) => value.trim().toLowerCase(), []);

  const getIdentifierErrorMessage = useCallback((field: 'follow_id' | 'friend_code') => {
    return field === 'follow_id'
      ? t('settings:account.error.invalid_id')
      : t('settings:account.error.invalid_friend_code');
  }, [t]);

  const isChangedIdentifier = useCallback((field: 'follow_id' | 'friend_code', value: string) => {
    const normalized = normalizeIdentifier(value);
    const original = field === 'follow_id' ? originalFollowId : originalFriendCode;
    return normalized !== original;
  }, [normalizeIdentifier, originalFollowId, originalFriendCode]);

  const canRunDuplicateCheck = useCallback((field: 'follow_id' | 'friend_code', value: string) => {
    void field;
    const normalized = normalizeIdentifier(value);
    return !!normalized;
  }, [normalizeIdentifier]);

  const checkDuplication = async (field: 'follow_id' | 'friend_code', value: string) => {
    const trimmed = normalizeIdentifier(value);
    const setStatus = field === 'follow_id' ? setFollowIdStatus : setFriendCodeStatus;
    const setLoadingStatus = field === 'follow_id' ? setCheckingFollow : setCheckingFriend;

    if (!trimmed) {
      setStatus('none');
      return;
    }

    if (!isChangedIdentifier(field, trimmed)) {
      setStatus('success');
      return;
    }

    if (!identifierPattern.test(trimmed)) {
      setStatus('invalid');
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: getIdentifierErrorMessage(field),
        variant: 'default',
      });
      return;
    }

    try {
      setLoadingStatus(true);
      const { data, error } = await supabase.rpc('check_profile_identifier_available', {
        p_field: field,
        p_value: trimmed,
      });
      if (error) throw error;
      setStatus(data ? 'success' : 'duplicate');
    } catch (e: any) {
      setStatus('invalid');
      showAlert({
        title: t('common:error'),
        message: e?.message || t('settings:account.error.check_failed'),
        variant: 'danger',
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const getCurrentLocale = useCallback(() => {
    const raw = String(i18n.language || 'en').replace('_', '-');
    const lower = raw.toLowerCase();
    if (lower === 'zh-cn' || lower === 'zh-hans') return 'zh-Hans';
    if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant') return 'zh-Hant';
    return lower.split('-')[0] || 'en';
  }, [i18n.language]);

  const loadWithdrawalReasons = useCallback(async () => {
    try {
      setWithdrawalReasonsLoading(true);
      const { data, error } = await supabase.rpc('get_account_withdrawal_reasons_v1', {
        p_lang: getCurrentLocale(),
      });
      if (error) throw error;
      const next = Array.isArray(data)
        ? data.map((item: any) => ({
            reasonCode: String(item.reason_code ?? ''),
            label: String(item.label ?? ''),
            sortOrder: Number(item.sort_order ?? 0),
          })).filter((item) => item.reasonCode && item.label)
        : [];
      setWithdrawalReasons(next);
    } catch (e: any) {
      setWithdrawalReasons([]);
      showAlert({
        title: t('common:error'),
        message: e?.message || t('settings:account.withdrawal.failed'),
        variant: 'danger',
      });
    } finally {
      setWithdrawalReasonsLoading(false);
    }
  }, [getCurrentLocale, showAlert, t]);

  const openWithdrawalNotice = useCallback(() => {
    if (saving || withdrawing) return;
    setWithdrawalNoticeVisible(true);
    void loadWithdrawalReasons();
  }, [loadWithdrawalReasons, saving, withdrawing]);

  const handleContinueWithdrawalNotice = useCallback(() => {
    setWithdrawalNoticeVisible(false);
    setWithdrawalSurveyVisible(true);
  }, []);

  const handleSubmitWithdrawalSurvey = useCallback((payload: AccountWithdrawalPayload) => {
    setWithdrawalPayload(payload);
    setWithdrawalSurveyVisible(false);
    setWithdrawalConfirmVisible(true);
  }, []);

  const handleConfirmWithdrawal = useCallback(async () => {
    if (!withdrawalPayload || withdrawing) return;
    try {
      setWithdrawing(true);
      const { error } = await supabase.functions.invoke('account-withdrawal', {
        body: {
          reason_code: withdrawalPayload.reasonCode,
          reason_text: withdrawalPayload.reasonText,
          locale: getCurrentLocale(),
          confirmed: true,
        },
      });
      if (error) throw error;
      setWithdrawalConfirmVisible(false);
      setWithdrawalPayload(null);
      showToast({
        message: t('settings:account.withdrawal.completed'),
        tone: 'success',
        showMark: true,
      });
      await supabase.auth.signOut();
    } catch (e: any) {
      showAlert({
        title: t('common:error'),
        message: e?.message || t('settings:account.withdrawal.failed'),
        variant: 'danger',
      });
    } finally {
      setWithdrawing(false);
    }
  }, [getCurrentLocale, showAlert, showToast, t, withdrawalPayload, withdrawing]);

  const handleSave = async () => {
    const normalizedNickname = nickname.trim();
    const normalizedFollowId = normalizeIdentifier(followId);
    const normalizedFriendCode = normalizeIdentifier(friendCode);

    const followIdChanged = normalizedFollowId !== originalFollowId;
    const friendCodeChanged = normalizedFriendCode !== originalFriendCode;

    if (!normalizedNickname) {
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: t('settings:account.error.nickname_required', { defaultValue: '닉네임을 입력해주세요.' }),
        variant: 'default',
      });
      return;
    }

    if (normalizedNickname.length > NICKNAME_MAX_LENGTH) {
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: t('settings:account.error.nickname_too_long', { defaultValue: '닉네임은 30자까지 입력할 수 있습니다.' }),
        variant: 'default',
      });
      return;
    }

    if (normalizedFollowId && !identifierPattern.test(normalizedFollowId)) {
      setFollowIdStatus('invalid');
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: getIdentifierErrorMessage('follow_id'),
        variant: 'default',
      });
      return;
    }

    if (normalizedFriendCode && !identifierPattern.test(normalizedFriendCode)) {
      setFriendCodeStatus('invalid');
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: getIdentifierErrorMessage('friend_code'),
        variant: 'default',
      });
      return;
    }

    const followIdNeedsCheck = followIdChanged && !!normalizedFollowId && followIdStatus !== 'success';
    const friendCodeNeedsCheck = friendCodeChanged && !!normalizedFriendCode && friendCodeStatus !== 'success';

    if (followIdNeedsCheck || friendCodeNeedsCheck) {
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: t('settings:account.error.duplicate_check_required'),
        variant: 'default',
      });
      return;
    }

    if (followIdStatus === 'duplicate' || friendCodeStatus === 'duplicate' || followIdStatus === 'invalid' || friendCodeStatus === 'invalid') {
      showAlert({
        title: t('settings:account.alert.check_required'),
        message: t('settings:account.error.duplicate_check_retry'),
        variant: 'default',
      });
      return;
    }

    if (!meId) return;

    try {
      setSaving(true);
      const finalAvatarUrl = await uploadProfileImage(avatarUrl, meId);
      const { error } = await supabase.from('profiles').update({
        nickname: normalizedNickname,
        avatar_url: finalAvatarUrl,
        follow_id: normalizedFollowId || null,
        friend_code: normalizedFriendCode || null,
        show_nickname_to_friends: showNickname,
        updated_at: new Date(),
      }).eq('user_id', meId);
      if (error) throw error;

      setNickname(normalizedNickname);
      setOriginalNickname(normalizedNickname);
      setAvatarUrl(finalAvatarUrl);
      setOriginalAvatarUrl(finalAvatarUrl);
      setOriginalFollowId(normalizedFollowId);
      setOriginalFriendCode(normalizedFriendCode);
      setOriginalShowNickname(showNickname);
      setFollowIdStatus('none'); setFriendCodeStatus('none');

      showToast({
        message: t('settings:account.alert.save_success_desc'),
        tone: 'success',
        showMark: true,
      });
    } catch (e: any) {
      if (e?.code === '23505') {
        showAlert({
          title: t('settings:account.alert.check_required'),
          message: t('settings:account.error.duplicate_value_retry'),
          variant: 'default',
        });
        return;
      }
      showAlert({ title: t('settings:account.alert.save_fail_title'), message: e?.message, variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    nickname.trim() !== originalNickname ||
    avatarUrl !== originalAvatarUrl ||
    followId.trim().toLowerCase() !== originalFollowId ||
    friendCode.trim().toLowerCase() !== originalFriendCode ||
    showNickname !== originalShowNickname;

  const avatarInitial = (nickname.trim() || followId.trim() || 'C').slice(0, 1).toUpperCase();

  if (loading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <SafeScreen
      backgroundColor={colors.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >

      <GlobalHeader
        style={{
          backgroundColor: colors.headerBg,
          borderBottomColor: colors.headerBorder,
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={colors.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.accountHeaderTitle, { color: colors.headerText }]}>
              {t('settings:account.header_title')}
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 118 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >

          <Text style={[styles.sectionLabel, { color: colors.sectionTitle }]}>
            {t('settings:account.section.profile', { defaultValue: '프로필' })}
          </Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.profilePhotoArea}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings:account.field.profile_photo', { defaultValue: '프로필 사진' })}
                onPress={openAvatarPicker}
                disabled={saving}
                style={({ pressed }) => [
                  styles.avatarButton,
                  {
                    borderColor: colors.profileAvatarBorder,
                    backgroundColor: colors.profileAvatarBg,
                    opacity: pressed && !saving ? 0.84 : 1,
                  },
                ]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.profileAvatarBg }]}>
                    {avatarInitial ? (
                      <Text style={[styles.avatarInitial, { color: colors.profileAvatarText }]}>
                        {avatarInitial}
                      </Text>
                    ) : (
                      <User size={34} color={colors.profileAvatarText} strokeWidth={1.6} />
                    )}
                  </View>
                )}

                <View
                  style={[
                    styles.avatarCameraBadge,
                    {
                      backgroundColor: colors.cameraBadgeBg,
                      borderColor: colors.cameraBadgeBorder,
                    },
                  ]}
                >
                  <Camera size={16} color={colors.cameraBadgeIcon} strokeWidth={2} />
                </View>
              </Pressable>

              {avatarUrl ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings:account.action.remove_photo', { defaultValue: '사진 삭제' })}
                  onPress={handleRemoveAvatar}
                  disabled={saving}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.avatarRemoveButton,
                    {
                      backgroundColor: colors.avatarRemoveBg,
                      borderColor: colors.avatarRemoveBorder,
                      opacity: pressed && !saving ? 0.72 : 1,
                    },
                  ]}
                >
                  <X size={13} color={colors.avatarRemoveIcon} strokeWidth={2.4} />
                </Pressable>
              ) : null}

              <Text style={[styles.profilePhotoCaption, { color: colors.textSecondary }]}>
                {t('settings:account.action.change_photo', { defaultValue: '사진 변경' })}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <View style={styles.fieldRow}>
              <View style={styles.labelRowBetween}>
                <Text style={[styles.labelLarge, { color: colors.textPrimary }]}>
                  {t('settings:account.field.nickname', { defaultValue: '닉네임' })}
                </Text>
                <Text style={[styles.counterText, { color: colors.textMuted }]}>
                  {nickname.length}/{NICKNAME_MAX_LENGTH}
                </Text>
              </View>

              <View
                style={[
                  styles.simpleInputWrapper,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
              >
                <TextInput
                  value={nickname}
                  onChangeText={setNickname}
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder={t('settings:account.placeholder.nickname', { defaultValue: '닉네임' })}
                  placeholderTextColor={colors.placeholder}
                  maxLength={NICKNAME_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  editable={!saving}
                />
                {nickname.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common:clear', { defaultValue: 'Clear' })}
                    onPress={() => setNickname('')}
                    disabled={saving}
                    hitSlop={10}
                    style={styles.inputClearButton}
                  >
                    <View style={[styles.inputClearIconBg, { backgroundColor: colors.inputClearBg }]}>
                      <X size={12} color={colors.inputClearIcon} strokeWidth={2.4} />
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.sectionTitle }]}>{t('settings:account.section.contact')}</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SectionIcon icon={Smartphone} colors={colors} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('settings:account.field.phone')}</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{phoneNumber || t('settings:account.value.not_registered')}</Text>
                </View>
              </View>
              <BouncyPressable onPress={() => navigation.navigate('PhoneVerification', { entry: 'settings' })}>
                <View style={[
                  styles.badge,
                  {
                    backgroundColor: phoneVerified ? colors.successBg : colors.dangerBg,
                  }
                ]}>
                  <Text style={[
                    styles.badgeText,
                    { color: phoneVerified ? colors.successText : colors.dangerText }
                  ]}>
                    {phoneVerified ? t('settings:account.badge.verified') : t('settings:account.badge.verify')}
                  </Text>
                </View>
              </BouncyPressable>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SectionIcon icon={Mail} colors={colors} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('settings:account.field.email')}</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{email}</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.sectionTitle }]}>{t('settings:account.section.identity')}</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.fieldRow}>
              <View style={styles.labelRow}>
                <SectionIcon icon={AtSign} colors={colors} />
                <Text style={[styles.labelLarge, { color: colors.textPrimary }]}>{t('settings:account.field.id_label')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Identifier rule"
                  onPress={() => showAlert({
                    title: 'CO·ONN ID',
                    message: IDENTIFIER_GUIDE_TEXT,
                    variant: 'default',
                  })}
                  hitSlop={10}
                  style={styles.helpIconButton}
                >
                  <HelpCircle size={15} color={colors.textSecondary} strokeWidth={1.8} />
                </Pressable>
              </View>
              <InteractiveInput
                value={followId}
                onChangeText={(next) => { setFollowId(next); setFollowIdStatus('none'); }}
                onBlur={() => {}}
                onCheckDuplicate={() => checkDuplication('follow_id', followId)}
                checkDisabled={!canRunDuplicateCheck('follow_id', followId) || saving}
                checkLabel={t('settings:account.action.check_duplicate_short')}
                checkingLabel={t('settings:account.action.checking_short')}
                availableLabel={t('settings:account.status.available_short')}
                duplicateLabel={t('settings:account.status.duplicate_short')}
                placeholder={t('settings:account.placeholder.id')}
                loading={checkingFollow}
                status={followIdStatus}
                colors={colors}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <View style={styles.fieldRow}>
              <View style={styles.labelRow}>
                <SectionIcon icon={Hash} colors={colors} />
                <Text style={[styles.labelLarge, { color: colors.textPrimary }]}>{t('settings:account.field.friend_code')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Identifier rule"
                  onPress={() => showAlert({
                    title: 'Friend code',
                    message: IDENTIFIER_GUIDE_TEXT,
                    variant: 'default',
                  })}
                  hitSlop={10}
                  style={styles.helpIconButton}
                >
                  <HelpCircle size={15} color={colors.textSecondary} strokeWidth={1.8} />
                </Pressable>
              </View>
              <InteractiveInput
                value={friendCode}
                onChangeText={(next) => { setFriendCode(next); setFriendCodeStatus('none'); }}
                onBlur={() => {}}
                onCheckDuplicate={() => checkDuplication('friend_code', friendCode)}
                checkDisabled={!canRunDuplicateCheck('friend_code', friendCode) || saving}
                checkLabel={t('settings:account.action.check_duplicate_short')}
                checkingLabel={t('settings:account.action.checking_short')}
                availableLabel={t('settings:account.status.available_short')}
                duplicateLabel={t('settings:account.status.duplicate_short')}
                placeholder={t('settings:account.placeholder.friend_code')}
                loading={checkingFriend}
                status={friendCodeStatus}
                colors={colors}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.sectionTitle }]}>{t('settings:account.section.visibility')}</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SectionIcon icon={Eye} colors={colors} />
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.labelLarge, { color: colors.textPrimary }]}>{t('settings:account.field.show_nickname')}</Text>
                  <Text style={[styles.subLabel, { color: colors.textSecondary }]}>{t('settings:account.help.show_nickname_desc')}</Text>
                </View>
              </View>
              <CoonnSwitch
                value={showNickname}
                onValueChange={setShowNickname}
                colors={colors}
              />
            </View>
          </View>

          <View
            style={[
              styles.cardGroup,
              styles.withdrawalCard,
              {
                backgroundColor: withdrawalTone.cardBg,
                borderColor: withdrawalTone.cardBorder,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={openWithdrawalNotice}
              disabled={saving || withdrawing}
              style={({ pressed }) => [
                styles.row,
                { opacity: pressed && !saving && !withdrawing ? 0.76 : saving || withdrawing ? 0.54 : 1 },
              ]}
            >
              <View style={styles.rowLeft}>
                <View
                  style={[
                    styles.miniIcon,
                    {
                      backgroundColor: withdrawalTone.iconBg,
                      borderColor: withdrawalTone.iconBorder,
                    },
                  ]}
                >
                  <Trash2 size={17} color={withdrawalTone.icon} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.labelLarge, { color: withdrawalTone.text }]}>
                    {t('settings:account.withdrawal.entryTitle')}
                  </Text>
                  <Text style={[styles.subLabel, { color: withdrawalTone.subText }]}>
                    {t('settings:account.withdrawal.entryDescription')}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>

        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 10, backgroundColor: colors.footerBg, borderTopColor: colors.footerBorder }]}>
        <BouncyPressable
          disabled={!hasChanges || saving}
          onPress={handleSave}
          style={[
            styles.saveBtn,
            { backgroundColor: (!hasChanges || saving) ? colors.saveDisabledBg : colors.controlSelected }
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.controlSelectedText} />
          ) : (
            <Text
              style={[
                styles.saveBtnText,
                { color: (!hasChanges || saving) ? colors.saveDisabledText : colors.controlSelectedText },
              ]}
            >
              {t('settings:account.action.save')}
            </Text>
          )}
        </BouncyPressable>
        </View>
      </KeyboardAvoidingView>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleAvatarSelect}
        maxSelect={1}
        headerTitle={t('settings:account.picker.profile_photo', { defaultValue: '사진 선택' })}
        themeColor={colors.controlSelected}
      />

      <UniversalImageEditor
        visible={editorVisible}
        sourceUri={tempImageUri || ''}
        onClose={() => {
          setEditorVisible(false);
          setTempImageUri(null);
        }}
        onSave={handleEditorSave}
        themeColor={colors.controlSelected}
      />

      <AccountWithdrawalNoticeModal
        visible={withdrawalNoticeVisible}
        loading={withdrawalReasonsLoading}
        colors={colors}
        onClose={() => setWithdrawalNoticeVisible(false)}
        onContinue={handleContinueWithdrawalNotice}
      />

      <AccountWithdrawalSurveyModal
        visible={withdrawalSurveyVisible}
        reasons={withdrawalReasons}
        loading={withdrawalReasonsLoading}
        colors={colors}
        onClose={() => setWithdrawalSurveyVisible(false)}
        onSubmit={handleSubmitWithdrawalSurvey}
      />

      <AccountWithdrawalConfirmModal
        visible={withdrawalConfirmVisible}
        processing={withdrawing}
        colors={colors}
        onClose={() => {
          if (!withdrawing) setWithdrawalConfirmVisible(false);
        }}
        onConfirm={handleConfirmWithdrawal}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 10) + 82}
        onHidden={hideToast}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
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

    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  keyboardAvoid: { flex: 1 },

  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  accountHeaderTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },


  profilePhotoArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 22,
    paddingBottom: 18,
  },
  avatarButton: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  avatarFallback: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '600',
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 31,
    height: 31,
    borderRadius: 15.5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRemoveButton: {
    position: 'absolute',
    top: 18,
    right: '50%',
    marginRight: -56,
    width: 25,
    height: 25,
    borderRadius: 12.5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePhotoCaption: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },

  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.05,
  },

  cardGroup: {
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  withdrawalCard: {
    marginTop: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  value: { fontSize: 15, lineHeight: 20, fontWeight: '400', marginTop: 2 },
  labelLarge: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  subLabel: { fontSize: 12, lineHeight: 17, fontWeight: '400', marginTop: 2 },

  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '500' },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },

  fieldRow: {
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  helpIconButton: {
    marginLeft: -4,
    padding: 2,
  },


  labelRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  counterText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  simpleInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    height: 50,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputClearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  inputClearIconBg: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    height: 50,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },

  textInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    paddingVertical: 0,
  },
  inputActionBtn: {
    minWidth: 46,
    height: 29,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  inputActionText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 6,
    marginLeft: 4,
  },

  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, lineHeight: 20, fontWeight: '600' },

  coonnSwitchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  coonnSwitchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  coonnSwitchThumbOn: {
    alignSelf: 'flex-end',
  },
});
