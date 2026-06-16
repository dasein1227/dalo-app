// src/screens/settings/Notification.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  PanResponder,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import { createNotificationSettingsTheme, type NotificationSettingsTheme } from './Notification.theme';


const USER_NOTIFICATION_SETTINGS_SELECT =
  'user_id, push_enabled, preview_enabled, sound_enabled, vibrate_enabled, chat_enabled, in_app_enabled, in_app_preferences, system_enabled, marketing_enabled, quiet_start, quiet_end, device_token' as const;

type NotiRow = {
  user_id: string;
  push_enabled: boolean | null;
  preview_enabled: boolean | null;
  sound_enabled: boolean | null;
  vibrate_enabled: boolean | null;
  chat_enabled: boolean | null;
  in_app_enabled: boolean | null;
  in_app_preferences: Record<string, unknown> | null;
  system_enabled: boolean | null;
  marketing_enabled: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  device_token?: string | null;
};

const hhmmRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WHEEL_ITEM_HEIGHT = 60;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;
const WHEEL_CENTER_OFFSET = Math.floor(WHEEL_VISIBLE_ITEMS / 2) * WHEEL_ITEM_HEIGHT;
const WHEEL_RENDER_RADIUS = 2;

type TimePickerTarget = 'start' | 'end';

type NotificationAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_NOTIFICATION_ALERT: NotificationAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

type ThemeProps = {
  colors: NotificationSettingsTheme;
};

type InAppNotificationType =
  | 'follow.created'
  | 'chat.reply.created'
  | 'chat.mention.created'
  | 'beacon.join_request.created'
  | 'beacon.join_approved'
  | 'beacon.friend.created'
  | 'schedule.created'
  | 'schedule.updated'
  | 'schedule.cancelled'
  | 'post.like.grouped'
  | 'post.comment.grouped'
  | 'post.reply.grouped'
  | 'post.mention.grouped';

type InAppPreferences = Record<InAppNotificationType, boolean>;

type InAppNotificationItem = {
  type: InAppNotificationType;
  titleKey: string;
  titleFallback: string;
  captionKey: string;
  captionFallback: string;
};

type InAppNotificationGroup = {
  titleKey: string;
  titleFallback: string;
  items: InAppNotificationItem[];
};

const DEFAULT_IN_APP_PREFERENCES: InAppPreferences = {
  'follow.created': true,
  'chat.reply.created': true,
  'chat.mention.created': true,
  'beacon.join_request.created': true,
  'beacon.join_approved': true,
  'beacon.friend.created': true,
  'schedule.created': true,
  'schedule.updated': true,
  'schedule.cancelled': true,
  'post.like.grouped': true,
  'post.comment.grouped': true,
  'post.reply.grouped': true,
  'post.mention.grouped': true,
};

const IN_APP_NOTIFICATION_GROUPS: InAppNotificationGroup[] = [
  {
    titleKey: 'notification.in_app.group.social',
    titleFallback: '소셜',
    items: [
      {
        type: 'follow.created',
        titleKey: 'notification.in_app.follow_created',
        titleFallback: '새 팔로워',
        captionKey: 'notification.in_app.follow_created_help',
        captionFallback: '나를 팔로우했을 때',
      },
    ],
  },
  {
    titleKey: 'notification.in_app.group.chat',
    titleFallback: '채팅',
    items: [
      {
        type: 'chat.reply.created',
        titleKey: 'notification.in_app.chat_reply',
        titleFallback: '답장',
        captionKey: 'notification.in_app.chat_reply_help',
        captionFallback: '내 메시지에 답장했을 때',
      },
      {
        type: 'chat.mention.created',
        titleKey: 'notification.in_app.chat_mention',
        titleFallback: '멘션',
        captionKey: 'notification.in_app.chat_mention_help',
        captionFallback: '나를 멘션했을 때',
      },
    ],
  },
  {
    titleKey: 'notification.in_app.group.beacon',
    titleFallback: '비콘',
    items: [
      {
        type: 'beacon.join_request.created',
        titleKey: 'notification.in_app.beacon_join_request',
        titleFallback: '참여 요청',
        captionKey: 'notification.in_app.beacon_join_request_help',
        captionFallback: '비콘 참여 요청이 왔을 때',
      },
      {
        type: 'beacon.join_approved',
        titleKey: 'notification.in_app.beacon_join_approved',
        titleFallback: '참여 승인',
        captionKey: 'notification.in_app.beacon_join_approved_help',
        captionFallback: '비콘 참여가 승인됐을 때',
      },
      {
        type: 'beacon.friend.created',
        titleKey: 'notification.in_app.beacon_friend_created',
        titleFallback: '친구 비콘',
        captionKey: 'notification.in_app.beacon_friend_created_help',
        captionFallback: '친구가 비콘을 만들었을 때',
      },
    ],
  },
  {
    titleKey: 'notification.in_app.group.schedule',
    titleFallback: '일정',
    items: [
      {
        type: 'schedule.created',
        titleKey: 'notification.in_app.schedule_created',
        titleFallback: '새 일정',
        captionKey: 'notification.in_app.schedule_created_help',
        captionFallback: '참여 중인 방에 일정이 생겼을 때',
      },
      {
        type: 'schedule.updated',
        titleKey: 'notification.in_app.schedule_updated',
        titleFallback: '일정 변경',
        captionKey: 'notification.in_app.schedule_updated_help',
        captionFallback: '참여 중인 일정이 변경됐을 때',
      },
      {
        type: 'schedule.cancelled',
        titleKey: 'notification.in_app.schedule_cancelled',
        titleFallback: '일정 취소',
        captionKey: 'notification.in_app.schedule_cancelled_help',
        captionFallback: '참여 중인 일정이 취소됐을 때',
      },
    ],
  },
  {
    titleKey: 'notification.in_app.group.post',
    titleFallback: '게시물',
    items: [
      {
        type: 'post.like.grouped',
        titleKey: 'notification.in_app.post_like',
        titleFallback: '좋아요',
        captionKey: 'notification.in_app.post_like_help',
        captionFallback: '내 게시물에 좋아요가 모였을 때',
      },
      {
        type: 'post.comment.grouped',
        titleKey: 'notification.in_app.post_comment',
        titleFallback: '댓글',
        captionKey: 'notification.in_app.post_comment_help',
        captionFallback: '내 게시물에 댓글이 달렸을 때',
      },
      {
        type: 'post.reply.grouped',
        titleKey: 'notification.in_app.post_reply',
        titleFallback: '답글',
        captionKey: 'notification.in_app.post_reply_help',
        captionFallback: '내 댓글에 답글이 달렸을 때',
      },
      {
        type: 'post.mention.grouped',
        titleKey: 'notification.in_app.post_mention',
        titleFallback: '게시물 멘션',
        captionKey: 'notification.in_app.post_mention_help',
        captionFallback: '게시물이나 댓글에서 나를 멘션했을 때',
      },
    ],
  },
];

function normalizeInAppPreferences(value: unknown): InAppPreferences {
  const next: InAppPreferences = { ...DEFAULT_IN_APP_PREFERENCES };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return next;
  }

  const source = value as Record<string, unknown>;

  (Object.keys(DEFAULT_IN_APP_PREFERENCES) as InAppNotificationType[]).forEach((type) => {
    if (typeof source[type] === 'boolean') {
      next[type] = source[type] as boolean;
    }
  });

  return next;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatHHMM(hour: number, minute: number) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseHHMM(value: string | null | undefined, fallback = '00:00') {
  const source = value && hhmmRe.test(value) ? value : fallback;
  const [hour, minute] = source.split(':').map((part) => Number(part));

  return {
    hour: Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 0,
    minute: Number.isFinite(minute) ? Math.min(Math.max(minute, 0), 59) : 0,
  };
}


const CoonnSwitch = ({
  value,
  onValueChange,
  disabled = false,
  colors,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
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
      disabled={disabled}
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
      style={[
        styles.coonnSwitchTrack,
        disabled && styles.coonnSwitchDisabled,
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

export default function Notification() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = createNotificationSettingsTheme(appTheme);
  const isDark = Boolean((appTheme as any)?.isDark);
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';

  const [me, setMe] = useState<string>('');
  const [row, setRow] = useState<NotiRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alertState, setAlertState] = useState<NotificationAlertState>(EMPTY_NOTIFICATION_ALERT);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const toastTheme = createCoonnFloatingToastTheme(
    {
      isDark,
      surface: (colors as any).toastBg ?? colors.card,
      textPrimary: (colors as any).toastText ?? colors.textPrimary,
      border: (colors as any).toastBorder ?? colors.border,
      accentColor: colors.controlSelected,
      dangerColor: (colors as any).danger ?? undefined,
      shadowColor: colors.controlSelected,
    },
    toast.tone,
  );

  const { t } = useTranslation(['settings', 'common']);

  const settingsText = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      String(t(`settings:${key}`, { defaultValue: fallback, ...(options ?? {}) })),
    [t],
  );

  const commonText = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      String(t(`common:${key}`, { defaultValue: fallback, ...(options ?? {}) })),
    [t],
  );

  const showAlert = useCallback((next: Omit<NotificationAlertState, 'visible'>) => {
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

  const [pushOn, setPushOn] = useState(true);
  const [previewOn, setPreviewOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [vibrateOn, setVibrateOn] = useState(true);

  const [chatOn, setChatOn] = useState(true);
  const [systemOn, setSystemOn] = useState(true);
  const [marketingOn, setMarketingOn] = useState(false);

  const [inAppOn, setInAppOn] = useState(true);
  const [inAppPreferences, setInAppPreferences] = useState<InAppPreferences>(DEFAULT_IN_APP_PREFERENCES);

  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const [draftHour, setDraftHour] = useState(22);
  const [draftMinute, setDraftMinute] = useState(0);

  const timePickerOpen = timePickerTarget !== null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(settingsText('notification.alert.login_required', '로그인이 필요합니다.'));
      setMe(user.id);

      const { data, error } = await supabase
        .from('user_notification_settings')
        .select(USER_NOTIFICATION_SETTINGS_SELECT)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error && error.code !== '42P01') throw error;

      const initial: NotiRow = data ?? {
        user_id: user.id,
        push_enabled: true,
        preview_enabled: true,
        sound_enabled: true,
        vibrate_enabled: true,
        chat_enabled: true,
        in_app_enabled: true,
        in_app_preferences: DEFAULT_IN_APP_PREFERENCES,
        system_enabled: true,
        marketing_enabled: false,
        quiet_start: '22:00',
        quiet_end: '08:00',
        device_token: null,
      };

      setRow(initial);
      setPushOn(!!initial.push_enabled);
      setPreviewOn(!!initial.preview_enabled);
      setSoundOn(!!initial.sound_enabled);
      setVibrateOn(!!initial.vibrate_enabled);
      setChatOn(!!initial.chat_enabled);
      setSystemOn(!!initial.system_enabled);
      setMarketingOn(!!initial.marketing_enabled);
      setInAppOn(initial.in_app_enabled !== false);
      setInAppPreferences(normalizeInAppPreferences(initial.in_app_preferences));
      const initialStart = parseHHMM(initial.quiet_start, '22:00');
      const initialEnd = parseHHMM(initial.quiet_end, '08:00');
      setQuietStart(formatHHMM(initialStart.hour, initialStart.minute));
      setQuietEnd(formatHHMM(initialEnd.hour, initialEnd.minute));
    } catch (e: any) {
      if (e?.code === '42P01') {
        showAlert({
          title: settingsText('notification.alert.table_missing_title', '설정 테이블 없음'),
          message: settingsText('notification.alert.table_missing_message', 'user_notification_settings를 생성하세요.'),
          variant: 'danger',
        });
      } else {
        showAlert({ title: settingsText('notification.alert.load_fail', '불러오기 실패'), message: e?.message ?? String(e), variant: 'danger' });
      }
    } finally {
      setLoading(false);
    }
  }, [settingsText, showAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const closeTimePicker = useCallback(() => {
    setTimePickerTarget(null);
  }, []);

  const openTimePicker = useCallback((target: TimePickerTarget) => {
    const current = parseHHMM(target === 'start' ? quietStart : quietEnd, target === 'start' ? '22:00' : '08:00');
    setDraftHour(current.hour);
    setDraftMinute(current.minute);
    setTimePickerTarget(target);
  }, [quietEnd, quietStart]);

  const applyTimePicker = useCallback(() => {
    const next = formatHHMM(draftHour, draftMinute);

    if (timePickerTarget === 'start') {
      setQuietStart(next);
    } else if (timePickerTarget === 'end') {
      setQuietEnd(next);
    }

    closeTimePicker();
  }, [closeTimePicker, draftHour, draftMinute, timePickerTarget]);

  useEffect(() => {
    if (!timePickerOpen) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeTimePicker();
      return true;
    });

    return () => subscription.remove();
  }, [closeTimePicker, timePickerOpen]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (!timePickerOpen) return;

      event.preventDefault();
      closeTimePicker();
    });

    return unsubscribe;
  }, [closeTimePicker, navigation, timePickerOpen]);

  const setInAppPreference = useCallback((type: InAppNotificationType, next: boolean) => {
    setInAppPreferences((prev) => ({
      ...prev,
      [type]: next,
    }));
  }, []);

  const save = useCallback(async () => {
    if (!me) return;
    if (!hhmmRe.test(quietStart) || !hhmmRe.test(quietEnd)) {
      showAlert({ title: settingsText('notification.alert.time_invalid_title', '시간 확인'), message: settingsText('notification.alert.time_invalid_message', '시간을 다시 선택하세요.'), variant: 'default' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        push_enabled: pushOn,
        preview_enabled: previewOn,
        sound_enabled: soundOn,
        vibrate_enabled: vibrateOn,
        chat_enabled: chatOn,
        system_enabled: systemOn,
        marketing_enabled: marketingOn,
        in_app_enabled: inAppOn,
        in_app_preferences: inAppPreferences,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        device_token: row?.device_token ?? null,
      };
      const { error } = await supabase
        .from('user_notification_settings')
        .upsert({ user_id: me, ...payload }, { onConflict: 'user_id' });
      if (error) throw error;
      showToast({ message: settingsText('notification.alert.save_success', '저장되었습니다.'), tone: 'success', showMark: true });
    } catch (e: any) {
      showAlert({ title: settingsText('notification.alert.save_fail', '저장 실패'), message: e?.message ?? String(e), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [me, pushOn, previewOn, soundOn, vibrateOn, chatOn, systemOn, marketingOn, inAppOn, inAppPreferences, quietStart, quietEnd, row, settingsText, showAlert, showToast]);

  const openSystemSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('App-Prefs:NOTIFICATIONS_ID');
      } else {
        await Linking.openSettings();
      }
    } catch (e: any) {
      showAlert({ title: settingsText('notification.alert.open_settings_fail_title', '열기 실패'), message: e?.message ?? settingsText('notification.alert.open_settings_fail_message', '시스템 설정을 열 수 없습니다.'), variant: 'danger' });
    }
  };

  if (loading) {
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
              <Text style={[styles.notificationHeaderTitle, { color: colors.headerText }]}>
                {settingsText('notification.title', '알림')}
              </Text>
            </View>
          }
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.loading} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{commonText('loading', '불러오는 중…')}</Text>
        </View>
      </SafeScreen>
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
            <Text style={[styles.notificationHeaderTitle, { color: colors.headerText }]}>
              {settingsText('notification.title', '알림')}
            </Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title={settingsText('notification.section.defaults', '기본')} colors={colors}>
          <Row title={settingsText('notification.field.push', '푸시 알림')} caption={settingsText('notification.help.push', '전체 푸시 알림')} right={<CoonnSwitch value={pushOn} onValueChange={setPushOn} colors={colors} />} colors={colors} />
          <Row title={settingsText('notification.field.preview', '미리보기')} caption={settingsText('notification.help.preview', '잠금화면에 내용 표시')} right={<CoonnSwitch value={previewOn} onValueChange={setPreviewOn} colors={colors} />} colors={colors} />
          <Row title={settingsText('notification.field.sound', '소리')} right={<CoonnSwitch value={soundOn} onValueChange={setSoundOn} colors={colors} />} colors={colors} />
          <Row title={settingsText('notification.field.vibrate', '진동')} last right={<CoonnSwitch value={vibrateOn} onValueChange={setVibrateOn} colors={colors} />} colors={colors} />
        </Section>

        <Section title={settingsText('notification.section.push_types', '푸시 유형')} colors={colors}>
          <Row
            title={settingsText('notification.field.chat', '채팅')}
            caption={settingsText('notification.help.chat_push', '채팅 메시지 푸시')}
            right={<CoonnSwitch value={chatOn} onValueChange={setChatOn} colors={colors} />}
            colors={colors}
          />
          <Row
            title={settingsText('notification.field.system', '공지·시스템')}
            caption={settingsText('notification.help.system_push', '서비스 안내와 주요 공지')}
            right={<CoonnSwitch value={systemOn} onValueChange={setSystemOn} colors={colors} />}
            colors={colors}
          />
          <Row
            title={settingsText('notification.field.marketing', '마케팅')}
            caption={settingsText('notification.help.marketing_push', '이벤트와 프로모션')}
            last
            right={<CoonnSwitch value={marketingOn} onValueChange={setMarketingOn} colors={colors} />}
            colors={colors}
          />
        </Section>

        <QuietTimeSection
          quietStart={quietStart}
          quietEnd={quietEnd}
          title={settingsText('notification.section.quiet', '조용한 시간')}
          startLabel={settingsText('notification.time.start_time', '시작 시간')}
          endLabel={settingsText('notification.time.end_time', '종료 시간')}
          selectLabel={(label, value) =>
            settingsText('notification.time.select', '{{label}} {{value}} 선택', { label, value })
          }
          onPressStart={() => openTimePicker('start')}
          onPressEnd={() => openTimePicker('end')}
          colors={colors}
        />

        <Section title={settingsText('notification.section.in_app', '인앱 알림')} colors={colors}>
          <Row
            title={settingsText('notification.in_app.master', '인앱 알림')}
            caption={settingsText('notification.in_app.master_help', '앱 안 알림함에 표시')}
            right={<CoonnSwitch value={inAppOn} onValueChange={setInAppOn} colors={colors} />}
            colors={colors}
          />

          {IN_APP_NOTIFICATION_GROUPS.map((group, groupIndex) => (
            <React.Fragment key={group.titleKey}>
              <GroupLabel title={settingsText(group.titleKey, group.titleFallback)} colors={colors} />

              {group.items.map((item, itemIndex) => {
                const isLast =
                  groupIndex === IN_APP_NOTIFICATION_GROUPS.length - 1 &&
                  itemIndex === group.items.length - 1;

                return (
                  <Row
                    key={item.type}
                    title={settingsText(item.titleKey, item.titleFallback)}
                    caption={settingsText(item.captionKey, item.captionFallback)}
                    disabled={!inAppOn}
                    last={isLast}
                    right={
                      <CoonnSwitch
                        value={inAppPreferences[item.type]}
                        onValueChange={(next) => setInAppPreference(item.type, next)}
                        disabled={!inAppOn}
                        colors={colors}
                      />
                    }
                    colors={colors}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </Section>

        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.controlSelected }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.controlSelectedText} />
            ) : (
              <Text style={[styles.btnPrimaryTxt, { color: colors.controlSelectedText }]}>{settingsText('notification.action.save', '저장')}</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnGhost, { borderColor: colors.ghostBorder, backgroundColor: colors.ghostBg }]}
            onPress={openSystemSettings}
          >
            <Text style={[styles.btnGhostTxt, { color: colors.textPrimary }]}>{settingsText('notification.action.open_system', '시스템 설정')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {timePickerOpen ? (
        <View pointerEvents="box-none" style={[styles.sheetPortal, { bottom: -insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={settingsText('notification.time.close', '시간 선택 닫기')}
            style={styles.sheetBackdrop}
            onPress={closeTimePicker}
          />

          <View
            style={[
              styles.timeSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: 40 + insets.bottom,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.divider }]} />
            </View>

            <View style={styles.sheetTopBar}>
              <Pressable
                accessibilityRole="button"
                onPress={closeTimePicker}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.sheetTopAction}
              >
                <Text style={[styles.sheetTopActionText, { color: colors.textSecondary }]}>{settingsText('notification.action.cancel', '취소')}</Text>
              </Pressable>

              <Text style={[styles.sheetSimpleTitle, { color: colors.textPrimary }]}>
                {timePickerTarget === 'start' ? settingsText('notification.time.start_time', '시작 시간') : settingsText('notification.time.end_time', '종료 시간')}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={applyTimePicker}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.sheetTopAction}
              >
                <Text style={[styles.sheetTopActionText, styles.sheetTopConfirmText, { color: colors.textPrimary }]}>{settingsText('notification.action.done', '완료')}</Text>
              </Pressable>
            </View>

            <View style={styles.wheelFrame}>
              <View
                pointerEvents="none"
                style={[
                  styles.wheelSelection,
                  {
                    borderColor: colors.divider,
                    backgroundColor: 'transparent',
                  },
                ]}
              />

              <WheelColumn
                max={24}
                selectedValue={draftHour}
                suffix={settingsText('notification.time.hour', '시')}
                colors={colors}
                onSelect={setDraftHour}
              />

              <Text style={[styles.wheelColon, { color: colors.textPrimary }]}>:</Text>

              <WheelColumn
                max={60}
                selectedValue={draftMinute}
                suffix={settingsText('notification.time.minute', '분')}
                colors={colors}
                onSelect={setDraftMinute}
              />
            </View>

          </View>
        </View>
      ) : null}
      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 10) + 28}
        onHidden={hideToast}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={commonText('ok', '확인')}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />
    </SafeScreen>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode } & ThemeProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

function GroupLabel({ title, colors }: { title: string } & ThemeProps) {
  return (
    <View style={[styles.groupLabel, { borderColor: colors.divider }]}>
      <Text style={[styles.groupLabelText, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

function Row({ title, caption, right, last, disabled, colors }: { title: string; caption?: string; right?: React.ReactNode; last?: boolean; disabled?: boolean } & ThemeProps) {
  return (
    <View style={[styles.row, !last && styles.rowDivider, disabled && styles.rowDisabled, { borderColor: colors.divider }]}> 
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{title}</Text>
        {!!caption && <Text style={[styles.rowCaption, { color: colors.textSecondary }]}>{caption}</Text>}
      </View>
      {right}
    </View>
  );
}

function QuietTimeSection({
  quietStart,
  quietEnd,
  title,
  startLabel,
  endLabel,
  selectLabel,
  onPressStart,
  onPressEnd,
  colors,
}: {
  quietStart: string;
  quietEnd: string;
  title: string;
  startLabel: string;
  endLabel: string;
  selectLabel: (label: string, value: string) => string;
  onPressStart: () => void;
  onPressEnd: () => void;
} & ThemeProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.quietCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <TimeChoiceCard
          label={startLabel}
          value={quietStart}
          accessibilityLabel={selectLabel(startLabel, quietStart)}
          onPress={onPressStart}
          colors={colors}
        />
        <View style={[styles.quietConnector, { backgroundColor: colors.divider }]} />
        <TimeChoiceCard
          label={endLabel}
          value={quietEnd}
          accessibilityLabel={selectLabel(endLabel, quietEnd)}
          onPress={onPressEnd}
          colors={colors}
        />
      </View>
    </View>
  );
}

function TimeChoiceCard({
  label,
  value,
  accessibilityLabel,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  accessibilityLabel: string;
  onPress: () => void;
} & ThemeProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.timeChoiceCard,
        {
          borderColor: colors.inputBorder,
          backgroundColor: colors.inputBg,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text style={[styles.timeChoiceLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.timeChoiceValue, { color: colors.textPrimary }]}>{value}</Text>
    </Pressable>
  );
}


function mod(value: number, max: number) {
  return ((value % max) + max) % max;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function WheelColumn({
  max,
  selectedValue,
  suffix,
  colors,
  onSelect,
}: {
  max: number;
  selectedValue: number;
  suffix: string;
  colors: NotificationSettingsTheme;
  onSelect: (value: number) => void;
}) {
  const [dragY, setDragY] = useState(0);
  const startValueRef = useRef(selectedValue);
  const activeRef = useRef(false);

  useEffect(() => {
    if (activeRef.current) return;
    startValueRef.current = selectedValue;
    setDragY(0);
  }, [selectedValue]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          activeRef.current = true;
          startValueRef.current = selectedValue;
          setDragY(0);
        },
        onPanResponderMove: (_event, gestureState) => {
          setDragY(gestureState.dy);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gestureState) => {
          const rawIndex = startValueRef.current - gestureState.dy / WHEEL_ITEM_HEIGHT;
          const nextValue = mod(Math.round(rawIndex), max);

          activeRef.current = false;
          setDragY(0);
          startValueRef.current = nextValue;
          onSelect(nextValue);
        },
        onPanResponderTerminate: () => {
          activeRef.current = false;
          setDragY(0);
        },
      }),
    [max, onSelect, selectedValue],
  );

  const virtualIndex = startValueRef.current - dragY / WHEEL_ITEM_HEIGHT;
  const centerIndex = Math.round(virtualIndex);

  const items = useMemo(
    () => Array.from({ length: WHEEL_RENDER_RADIUS * 2 + 1 }, (_, index) => index - WHEEL_RENDER_RADIUS),
    [],
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={`${pad2(selectedValue)}${suffix}`}
      style={styles.wheelColumn}
      {...panResponder.panHandlers}
    >
      <View pointerEvents="none" style={styles.wheelStaticLayer}>
        {items.map((delta) => {
          const itemIndex = centerIndex + delta;
          const value = mod(itemIndex, max);
          const distance = itemIndex - virtualIndex;
          const absDistance = Math.abs(distance);

          const fontSize = absDistance < 0.08
            ? 46
            : absDistance < 1
              ? 46 - absDistance * 23
              : absDistance < 2
                ? 23 - (absDistance - 1) * 8
                : 15;

          const lineHeight = Math.round(fontSize * 1.16);
          const fontWeight = absDistance < 0.14 ? '700' : absDistance < 1 ? '600' : '500';

          const opacity = absDistance < 0.08
            ? 1
            : absDistance < 1
              ? 1 - absDistance * 0.52
              : absDistance < 2
                ? 0.48 - (absDistance - 1) * 0.24
                : 0.24;

          const visualDistance = (() => {
            const sign = distance < 0 ? -1 : 1;
            const d = absDistance;

            if (d < 1) {
              return distance;
            }

            if (d < 2) {
              return sign * (1 + (d - 1) * 0.58);
            }

            return sign * 1.58;
          })();

          const translateY = visualDistance * WHEEL_ITEM_HEIGHT;

          return (
            <View
              key={`${itemIndex}:${value}`}
              style={[
                styles.wheelAbsoluteItem,
                {
                  transform: [{ translateY }],
                  opacity,
                },
              ]}
            >
              <Text
                style={[
                  styles.wheelItemText,
                  {
                    color: colors.textPrimary,
                    fontSize,
                    lineHeight,
                    fontWeight,
                  },
                ]}
              >
                {pad2(value)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notificationHeaderTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600' },

  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, fontSize: 13, fontWeight: '500' },

  section: { marginBottom: 16 },
  sectionHeaderRow: {
    marginBottom: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderTextBlock: {
    flex: 1,
  },
  sectionTitle: {
    paddingHorizontal: 4,
    marginBottom: 8,
    fontWeight: '500',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.05,
  },
  sectionTitleInHeader: {
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  quietSummaryPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietSummaryText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: 'hidden',
  },
  row: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowDisabled: { opacity: 0.42 },
  rowTextBlock: { flex: 1, paddingRight: 14 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.1 },
  rowCaption: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: '400' },
  groupLabel: {
    minHeight: 34,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  groupLabelText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  quietCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 7,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  quietConnector: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 14,
    opacity: 0.7,
  },
  timeChoiceCard: {
    flex: 1,
    minHeight: 92,
    borderWidth: 0,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  timeChoiceLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  timeChoiceValue: {
    marginTop: 9,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '600',
    letterSpacing: -0.85,
  },
  actions: { paddingTop: 2, gap: 10 },
  btn: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryTxt: { fontWeight: '600', fontSize: 15 },
  btnGhost: { borderWidth: StyleSheet.hairlineWidth },
  btnGhostTxt: { fontWeight: '500', fontSize: 14 },

  sheetPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  timeSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 4,
  },
  sheetHandleWrap: {
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
  },
  sheetHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetHeaderCompact: {
    marginTop: 8,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTopBar: {
    height: 46,
    marginTop: 2,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTopAction: {
    width: 72,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTopActionText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  sheetTopConfirmText: {
    fontWeight: '600',
  },
  sheetSimpleTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sheetTitleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  sheetTitle: {
    marginTop: 2,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sheetCloseButton: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  sheetPreviewCard: {
    marginTop: 14,
    height: 76,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPreviewLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  sheetPreviewTime: {
    marginTop: 3,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  wheelLabelRow: {
    marginTop: 14,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 78,
  },
  wheelLabel: {
    width: 80,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0.055,
  },
  wheelFrame: {
    height: WHEEL_HEIGHT,
    marginTop: 0,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wheelSelection: {
    position: 'absolute',
    left: 42,
    right: 42,
    top: WHEEL_CENTER_OFFSET,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    opacity: 0.26,
  },
  wheelColumn: {
    width: 108,
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelStaticLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_CENTER_OFFSET,
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelAbsoluteItem: {
    position: 'absolute',
    width: 108,
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    textAlign: 'center',
    letterSpacing: -0.55,
    includeFontPadding: false,
  },
  wheelColon: {
    width: 18,
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '500',
    opacity: 0.36,
    includeFontPadding: false,
  },
  sheetActionsRow: {
    marginTop: 0,
    flexDirection: 'row',
    gap: 10,
  },
  sheetCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirmButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  sheetConfirmText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },

  coonnSwitchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  coonnSwitchDisabled: {
    opacity: 0.55,
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
