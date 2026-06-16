// src/screens/chat/schedule/ChatScheduleMessageCard.tsx

import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CalendarDays, ChevronRight, Clock3, MapPin, UsersRound } from 'lucide-react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import type { ChatSchedule } from './types';
import {
  createChatScheduleTheme,
  resolveScheduleRoomTheme,
} from './ChatSchedule.theme';

type Props = {
  schedule: Pick<
    ChatSchedule,
    'id' | 'room_id' | 'title' | 'starts_at' | 'ends_at' | 'place_name' | 'address' | 'business_name' | 'participant_count' | 'status'
  >;
  roomTitle?: string | null;
  roomType?: string | null;
  chatThemeKey?: string | null;
  onLongPress?: (() => void) | null;
  disabled?: boolean;
};

const getWeekdayKey = (day: number): string => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'sun';

const formatCompactTime = (startsAt: string, endsAt: string | null | undefined, t: any): string => {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const weekday = t(`schedule.common.weekdays.${getWeekdayKey(start.getDay())}`);
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

  if (!endsAt) return `${t('schedule.common.compactDate', { month: start.getMonth() + 1, day: start.getDate(), weekday })} ${startTime}`;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${t('schedule.common.compactDate', { month: start.getMonth() + 1, day: start.getDate(), weekday })} ${startTime}`;

  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${t('schedule.common.compactDate', { month: start.getMonth() + 1, day: start.getDate(), weekday })} ${startTime}-${endTime}`;
};

export default function ChatScheduleMessageCard({
  schedule,
  roomTitle,
  roomType,
  chatThemeKey,
  onLongPress,
  disabled = false,
}: Props) {
  const navigation = useNavigation<any>();
  const { t } = useTranslation('chat');
  const appTheme = useAppTheme();
  const roomTheme = useMemo(
    () => resolveScheduleRoomTheme(roomType, chatThemeKey, appTheme.isDark),
    [appTheme.isDark, chatThemeKey, roomType],
  );
  const ui = useMemo(() => createChatScheduleTheme(appTheme, roomTheme), [appTheme, roomTheme]);

  const location = schedule.place_name || schedule.business_name || schedule.address || null;
  const cancelled = schedule.status === 'cancelled';
  const completed = schedule.status === 'completed';
  const terminal = cancelled || completed;
  const longPressGuardRef = useRef(false);

  const openDetail = useCallback(() => {
    navigation.navigate('ChatScheduleDetail', {
      roomId: schedule.room_id,
      roomTitle,
      roomType,
      chatThemeKey,
      scheduleId: schedule.id,
    });
  }, [chatThemeKey, navigation, roomTitle, roomType, schedule.id, schedule.room_id]);

  const handleLongPress = useCallback(() => {
    if (disabled || !onLongPress) return;
    longPressGuardRef.current = true;
    onLongPress();
    setTimeout(() => {
      longPressGuardRef.current = false;
    }, 650);
  }, [disabled, onLongPress]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (longPressGuardRef.current) {
      longPressGuardRef.current = false;
      return;
    }
    openDetail();
  }, [disabled, openDetail]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('schedule.common.openDetail', { title: schedule.title || t('schedule.common.title') })}
      disabled={disabled}
      delayLongPress={260}
      onLongPress={disabled ? undefined : handleLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: ui.elevatedSurface,
          borderColor: ui.border,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.card,
          opacity: disabled ? 0.45 : terminal ? 0.55 : pressed ? ui.pressedOpacity : 1,
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: ui.accentSoft }]}> 
        <CalendarDays size={20} color={ui.accent} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              {
                color: terminal ? ui.textMuted : ui.textPrimary,
                textDecorationLine: cancelled ? 'line-through' : 'none',
              },
            ]}
          > 
            {schedule.title || t('schedule.common.title')}
          </Text>
          {cancelled ? <Text style={[styles.cancelled, { color: ui.danger }]}>{t('schedule.messageCard.cancelled')}</Text> : null}
          {completed ? <Text style={[styles.cancelled, { color: ui.textMuted }]}>{t('schedule.messageCard.completed')}</Text> : null}
        </View>
        <View style={styles.infoRow}>
          <Clock3 size={13} color={ui.textMuted} strokeWidth={2} />
          <Text numberOfLines={1} style={[styles.infoText, { color: ui.textSecondary }]}>{formatCompactTime(schedule.starts_at, schedule.ends_at, t)}</Text>
        </View>
        {location ? (
          <View style={styles.infoRow}>
            <MapPin size={13} color={ui.textMuted} strokeWidth={2} />
            <Text numberOfLines={1} style={[styles.infoText, { color: ui.textSecondary }]}>{location}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <UsersRound size={13} color={ui.textMuted} strokeWidth={2} />
          <Text numberOfLines={1} style={[styles.infoText, { color: ui.textSecondary }]}>{t('schedule.common.participantCountCompact', { count: schedule.participant_count ?? 0 })}</Text>
        </View>
      </View>
      <ChevronRight size={16} color={ui.textMuted} strokeWidth={2} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 260,
    flexDirection: 'row',
    padding: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelled: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: '400',
  },
  infoRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  infoText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '400',
    flexShrink: 1,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: 8,
  },
});
