// src/screens/settings/Privacy.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

import { useAppTheme } from '@/theme/useAppTheme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import { createPrivacySettingsTheme } from './Privacy.theme';

/* ==================== UI 컴포넌트 ==================== */

const BouncyPressable = ({ onPress, style, children, disabled }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scaleValue, { toValue: 0.98, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  const onPressOut = () => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={disabled ? undefined : onPressIn} onPressOut={disabled ? undefined : onPressOut} disabled={disabled} style={{ width: '100%' }}>
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

const ToggleRow = ({ label, subLabel, value, onValueChange, colors, isLast }: any) => (
  <View
    style={[
      styles.toggleRow,
      {
        backgroundColor: colors.card,
        borderBottomColor: colors.divider,
      },
      isLast && { borderBottomWidth: 0 },
    ]}
  >
    <View style={styles.textContainer}>
      <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{label}</Text>
      {subLabel && <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{subLabel}</Text>}
    </View>
    <CoonnSwitch
      value={value}
      onValueChange={onValueChange}
      colors={colors}
    />
  </View>
);


type PrivacyAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const PRIVACY_PROFILE_COLUMNS =
  'is_public, allow_search, show_location, show_last_active, show_nickname_to_friends';

const emptyAlertState: PrivacyAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};


/* ==================== 메인 화면 ==================== */
export default function SettingsPrivacy() {
  const { t } = useTranslation(); // ✅ 다국어 훅 사용
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const appTheme = useAppTheme();
  const colors = createPrivacySettingsTheme(appTheme);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertState, setAlertState] = useState<PrivacyAlertState>(emptyAlertState);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  // --- 상태 관리 ---
  const [publicProfile, setPublicProfile] = useState(true);
  const [allowSearch, setAllowSearch] = useState(true);
  const [showNickname, setShowNickname] = useState(true);

  const [showLocation, setShowLocation] = useState(true);
  const [showLastActive, setShowLastActive] = useState(true);

  const isDark = Boolean((appTheme as any)?.isDark);
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';
  const toastTheme = createCoonnFloatingToastTheme(
    {
      isDark,
      surface: (colors as any).toastBg ?? colors.card,
      textPrimary: (colors as any).toastText ?? colors.textPrimary,
      border: (colors as any).toastBorder ?? colors.border,
      accentColor: colors.saveBg,
      dangerColor: (colors as any).danger ?? undefined,
      shadowColor: colors.saveBg,
    },
    toast.tone,
  );

  const showAlert = useCallback((next: Omit<PrivacyAlertState, 'visible'>) => {
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

  // ✅ 데이터 로드
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select(PRIVACY_PROFILE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPublicProfile(data.is_public ?? true);
        setAllowSearch(data.allow_search ?? true);
        setShowLocation(data.show_location ?? true);
        setShowLastActive(data.show_last_active ?? true);
        setShowNickname(data.show_nickname_to_friends ?? true);
      }
    } catch (e) {
      console.warn('[settings/privacy] load failed', e);
      showAlert({
        title: t('common:error'),
        message: t('settings:privacy.alert.load_fail'),
        variant: 'default',
      });
    } finally {
      setLoading(false);
    }
  }, [showAlert, t]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ✅ 저장 로직
  const handleSave = useCallback(async () => {
    if (saving) return;

    try {
      setSaving(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (!user) {
        showAlert({
          title: t('common:error'),
          message: t('settings:privacy.alert.login_required'),
          variant: 'default',
        });
        return;
      }

      const payload = {
        is_public: publicProfile,
        allow_search: allowSearch,
        show_location: showLocation,
        show_last_active: showLastActive,
        show_nickname_to_friends: showNickname,
        updated_at: new Date().toISOString(),
      };

      const primary = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', user.id)
        .select('user_id')
        .maybeSingle();

      if (primary.error) throw primary.error;

      if (!primary.data) {
        const inserted = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            id: user.id,
            ...payload,
          })
          .select('user_id')
          .maybeSingle();

        if (inserted.error) throw inserted.error;
        if (!inserted.data) throw new Error('profile row was not saved');
      }

      showToast({
        message: t('settings:privacy.alert.save_success'),
        tone: 'success',
        showMark: false,
      });
    } catch (e) {
      console.warn('[settings/privacy] save failed', e);
      showAlert({
        title: t('common:error'),
        message: t('settings:privacy.alert.save_fail'),
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  }, [
    allowSearch,
    publicProfile,
    saving,
    showAlert,
    showLastActive,
    showLocation,
    showNickname,
    showToast,
    t,
  ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.loading} />
      </View>
    );
  }

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
            <Text style={[styles.privacyHeaderTitle, { color: colors.headerText }]}>
              {t('settings:privacy.header_title')}
            </Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* SECTION 1: 프로필 및 검색 */}
        {/* ⚡️ i18n 적용: 섹션 제목 */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('settings:privacy.section.profile')}</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ToggleRow 
            label={t('settings:privacy.field.public_profile')} // "내 프로필 공개"
            subLabel={t('settings:privacy.help.public_profile')} // "다른 사용자가..."
            value={publicProfile} 
            onValueChange={setPublicProfile}
            colors={colors}
          />
          <ToggleRow 
            label={t('settings:privacy.field.allow_search')} // "검색 허용"
            subLabel={t('settings:privacy.help.allow_search')} // "닉네임/핸들로..."
            value={allowSearch} 
            onValueChange={setAllowSearch}
            colors={colors}
          />
          <ToggleRow 
            label={t('settings:privacy.field.show_nickname')} // "친구에게 닉네임 표시"
            subLabel={t('settings:privacy.help.show_nickname')} // "실명 대신..."
            value={showNickname} 
            onValueChange={setShowNickname}
            colors={colors}
            isLast
          />
        </View>

        {/* SECTION 2: 활동 정보 */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>{t('settings:privacy.section.activity')}</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ToggleRow 
            label={t('settings:privacy.field.show_location')} // "위치 표시"
            subLabel={t('settings:privacy.help.show_location')}
            value={showLocation} 
            onValueChange={setShowLocation}
            colors={colors}
          />
          <ToggleRow 
            label={t('settings:privacy.field.last_active')} // "마지막 활동 시간"
            subLabel={t('settings:privacy.help.last_active')}
            value={showLastActive} 
            onValueChange={setShowLastActive}
            colors={colors}
            isLast
          />
        </View>

      </ScrollView>

      {/* 하단 저장 버튼 */}
      <View style={[styles.footer, { paddingBottom: 10, backgroundColor: colors.footerBg, borderTopColor: colors.footerBorder }]}>
        <BouncyPressable onPress={handleSave} disabled={saving}>
          <View style={[styles.saveBtn, { backgroundColor: colors.saveBg }]}>
            {saving ? (
              <ActivityIndicator color={colors.saveText} />
            ) : (
              // ⚡️ i18n 적용: "저장"
              <Text style={[styles.saveBtnText, { color: colors.saveText }]}>{t('common:save')}</Text>
            )}
          </View>
        </BouncyPressable>
      </View>

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

  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  privacyHeaderTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  sectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: '500', marginBottom: 8, marginLeft: 4, letterSpacing: 0.05 },
  sectionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },

  // 행 스타일
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 68, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },

  textContainer: { flex: 1, paddingRight: 16 },
  optionTitle: { fontSize: 15, lineHeight: 20, fontWeight: '500', marginBottom: 2 },
  optionDesc: { fontSize: 12, lineHeight: 17, fontWeight: '400' },


  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
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
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  coonnSwitchThumbOn: {
    alignSelf: 'flex-end',
  },

});