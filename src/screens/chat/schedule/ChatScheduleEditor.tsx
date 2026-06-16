// src/screens/chat/schedule/ChatScheduleEditor.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  FileText,
  MapPin,
  X,
} from 'lucide-react-native';

import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import SafeScreen from '@/components/layout/SafeScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import type { ChatSchedule, ChatScheduleDraft, ChatScheduleEditorRouteParams } from './types';
import { createChatSchedule, getChatSchedule, updateChatSchedule } from './chatScheduleApi';
import {
  createChatScheduleTheme,
  resolveScheduleRoomTheme,
  type ChatScheduleTheme,
} from './ChatSchedule.theme';

type DateTimeFields = {
  date: string;
  time: string;
};

type PickerKind = 'startDate' | 'endDate' | 'startTime' | 'endTime' | null;

type LocationPickResult = {
  lat: number;
  lng: number;
  address: string;
};

const SCHEDULE_LOCATION_PICK_EVENT = 'chatScheduleEditor:locationPicked';

const isLocationPickResult = (value: unknown): value is LocationPickResult => {
  const item = value as Partial<LocationPickResult> | null;
  return !!item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
};

const pad = (value: number): string => String(value).padStart(2, '0');

const nowPlusOneHour = (): Date => {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(0);
  date.setHours(date.getHours() + 1);
  return date;
};

const toDateInput = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeInput = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const splitDateTime = (value?: string | null): DateTimeFields => {
  const parsed = value ? new Date(value) : nowPlusOneHour();
  const safe = Number.isNaN(parsed.getTime()) ? nowPlusOneHour() : parsed;
  return {
    date: toDateInput(safe),
    time: toTimeInput(safe),
  };
};

const toRoomId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const parseDateTime = (dateText: string, timeText: string): string | null => {
  const date = dateText.trim();
  const time = timeText.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const next = new Date(`${date}T${time}:00`);
  if (Number.isNaN(next.getTime())) return null;
  return next.toISOString();
};

const buildLocalDate = (dateText: string, timeText = '09:00'): Date => {
  const iso = parseDateTime(dateText, timeText);
  if (!iso) return nowPlusOneHour();

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? nowPlusOneHour() : date;
};

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60 * 1000);

const dateKeyToTime = (dateText: string): number => buildLocalDate(dateText, '00:00').getTime();

const isEndBeforeStart = (startDate: string, startTime: string, endDate: string, endTime: string): boolean => {
  const start = parseDateTime(startDate, startTime);
  const end = parseDateTime(endDate, endTime);
  if (!start || !end) return false;
  return new Date(end).getTime() <= new Date(start).getTime();
};

const getWeekdayKey = (day: number): string => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'sun';

const formatScheduleDate = (value: string, t: any): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [yyyy, mm, dd] = value.split('-').map(Number);
  const date = new Date(yyyy, (mm || 1) - 1, dd || 1);
  if (Number.isNaN(date.getTime())) return value;

  const weekday = t(`schedule.common.weekdays.${getWeekdayKey(date.getDay())}`);
  return t('schedule.common.date', { month: date.getMonth() + 1, day: date.getDate(), weekday });
};

const formatScheduleTime = (value: string, t: any): string => {
  if (!/^\d{2}:\d{2}$/.test(value)) return value || t('schedule.common.select');

  const [hhRaw, mmRaw] = value.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return value;

  const period = t(hh < 12 ? 'schedule.common.period.am' : 'schedule.common.period.pm');
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return t('schedule.common.timeWithPeriod', { period, hour: hour12, minute: pad(mm) });
};

const inferAllDay = (startsAt?: string | null, endsAt?: string | null): boolean => {
  if (!startsAt || !endsAt) return false;
  const start = splitDateTime(startsAt);
  const end = splitDateTime(endsAt);
  return start.time === '00:00' && (end.time === '23:59' || end.time === '00:00');
};

export default function ChatScheduleEditor() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const params = route.params ?? ({} as ChatScheduleEditorRouteParams);
  const appTheme = useAppTheme();
  const { t } = useTranslation('chat');
  const mode = params.mode === 'edit' || params.scheduleId ? 'edit' : 'create';
  const roomId = toRoomId(params.roomId);

  const roomTheme = useMemo(
    () => resolveScheduleRoomTheme(params.roomType, params.chatThemeKey ?? params.themeKey, appTheme.isDark),
    [appTheme.isDark, params.chatThemeKey, params.roomType, params.themeKey],
  );
  const ui = useMemo(() => createChatScheduleTheme(appTheme, roomTheme), [appTheme, roomTheme]);

  const defaultStart = useMemo(() => nowPlusOneHour(), []);
  const defaultEnd = useMemo(() => addMinutes(defaultStart, 60), [defaultStart]);

  const [source, setSource] = useState<ChatSchedule | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => toDateInput(defaultStart));
  const [startTime, setStartTime] = useState(() => toTimeInput(defaultStart));
  const [endDate, setEndDate] = useState(() => toDateInput(defaultEnd));
  const [endTime, setEndTime] = useState(() => toTimeInput(defaultEnd));
  const [allDay, setAllDay] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [memoInputHeight, setMemoInputHeight] = useState(88);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollView | null>(null);
  const memoFocusedRef = useRef(false);
  const memoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(SCHEDULE_LOCATION_PICK_EVENT, (result: unknown) => {
      if (!isLocationPickResult(result)) return;

      setLatitude(Number(result.lat));
      setLongitude(Number(result.lng));
      setAddress(String(result.address ?? '').trim());
    });

    return () => subscription.remove();
  }, []);

  const scrollMemoIntoView = useCallback((delay = 0) => {
    if (memoScrollTimerRef.current) {
      clearTimeout(memoScrollTimerRef.current);
      memoScrollTimerRef.current = null;
    }

    memoScrollTimerRef.current = setTimeout(() => {
      memoScrollTimerRef.current = null;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd?.(false);
      });
    }, delay);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      if (memoFocusedRef.current) {
        scrollMemoIntoView(70);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollMemoIntoView]);

  useEffect(() => {
    return () => {
      if (memoScrollTimerRef.current) {
        clearTimeout(memoScrollTimerRef.current);
        memoScrollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !params.scheduleId) return;

    let active = true;
    setLoading(true);

    void getChatSchedule(params.scheduleId)
      .then((row) => {
        if (!active) return;

        const start = splitDateTime(row.starts_at);
        const end = row.ends_at ? splitDateTime(row.ends_at) : splitDateTime(addMinutes(buildLocalDate(start.date, start.time), 60).toISOString());
        const nextAllDay = inferAllDay(row.starts_at, row.ends_at);

        setSource(row);
        setTitle(row.title ?? '');
        setDescription(row.description ?? '');
        setStartDate(start.date);
        setStartTime(start.time);
        setEndDate(end.date);
        setEndTime(end.time);
        setAllDay(nextAllDay);
        setPlaceName(row.place_name ?? '');
        setAddress(row.address ?? '');
        setLatitude(row.latitude);
        setLongitude(row.longitude);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mode, params.scheduleId]);

  const validate = useCallback((): ChatScheduleDraft | null => {
    const safeTitle = title.trim();
    if (!safeTitle) {
      Alert.alert(t('schedule.editor.validation.titleRequired'));
      return null;
    }

    const startsAt = allDay ? parseDateTime(startDate, '00:00') : parseDateTime(startDate, startTime);
    const endsAt = allDay ? parseDateTime(endDate, '23:59') : parseDateTime(endDate, endTime);

    if (!startsAt) {
      Alert.alert(t('schedule.editor.validation.startInvalid'));
      return null;
    }

    if (!endsAt) {
      Alert.alert(t('schedule.editor.validation.endInvalid'));
      return null;
    }

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      Alert.alert(t('schedule.editor.validation.endBeforeStart'));
      return null;
    }

    return {
      title: safeTitle,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Seoul',
      place_name: placeName.trim() || null,
      address: address.trim() || null,
      latitude,
      longitude,
      business_id: null,
    };
  }, [address, allDay, description, endDate, endTime, latitude, longitude, placeName, startDate, startTime, title]);

  const handleSave = useCallback(async () => {
    if (saving || source?.status === 'cancelled') return;

    const draft = validate();
    if (!draft) return;

    if (!roomId && mode === 'create') {
      Alert.alert(t('schedule.editor.validation.roomMissing'));
      return;
    }

    setSaving(true);

    try {
      const saved =
        mode === 'edit' && params.scheduleId
          ? await updateChatSchedule(params.scheduleId, draft)
          : await createChatSchedule(roomId!, draft, {
              roomTitle: params.roomTitle ?? params.title ?? null,
              roomType: params.roomType ?? null,
              chatThemeKey: params.chatThemeKey ?? params.themeKey ?? null,
            });

      navigation.replace('ChatScheduleDetail', {
        ...params,
        roomId: roomId ?? saved.room_id,
        scheduleId: saved.id,
      });
    } finally {
      setSaving(false);
    }
  }, [mode, navigation, params, roomId, saving, source?.status, validate]);

  const handlePickLocation = useCallback(() => {
    navigation.navigate('LocationPicker', {
      title: t('schedule.editor.locationPickerTitle'),
      helperText: t('schedule.editor.locationPickerHelper'),
      initialLat: latitude,
      initialLng: longitude,
      returnEventName: SCHEDULE_LOCATION_PICK_EVENT,
    });
  }, [latitude, longitude, navigation]);

  const handleClearLocation = useCallback(() => {
    setPlaceName('');
    setAddress('');
    setLatitude(null);
    setLongitude(null);
  }, []);

  const pickerDate = useMemo(() => {
    if (pickerKind === 'startDate') return buildLocalDate(startDate, startTime);
    if (pickerKind === 'endDate') return buildLocalDate(endDate, endTime);
    if (pickerKind === 'startTime') return buildLocalDate(startDate, startTime);
    if (pickerKind === 'endTime') return buildLocalDate(endDate, endTime);
    return nowPlusOneHour();
  }, [endDate, endTime, pickerKind, startDate, startTime]);

  const openPicker = useCallback((kind: PickerKind) => {
    setPickerKind(kind);
  }, []);

  const closePicker = useCallback(() => {
    setPickerKind(null);
  }, []);

  const onPickerChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      const currentKind = pickerKind;
      const dismissed = event.type === 'dismissed';

      if (Platform.OS === 'android') setPickerKind(null);
      if (dismissed || !selectedDate || !currentKind) return;

      if (currentKind === 'startDate') {
        const next = toDateInput(selectedDate);
        setStartDate(next);
        if (dateKeyToTime(endDate) < dateKeyToTime(next)) setEndDate(next);
        return;
      }

      if (currentKind === 'endDate') {
        const next = toDateInput(selectedDate);
        setEndDate(dateKeyToTime(next) < dateKeyToTime(startDate) ? startDate : next);
        return;
      }

      const nextTime = toTimeInput(selectedDate);

      if (currentKind === 'startTime') {
        setStartTime(nextTime);

        if (startDate === endDate && isEndBeforeStart(startDate, nextTime, endDate, endTime)) {
          const nextEnd = addMinutes(buildLocalDate(startDate, nextTime), 60);
          setEndDate(toDateInput(nextEnd));
          setEndTime(toTimeInput(nextEnd));
        }
        return;
      }

      if (currentKind === 'endTime') {
        setEndTime(nextTime);
      }
    },
    [endDate, endTime, pickerKind, startDate],
  );

  const toggleAllDay = useCallback((next: boolean) => {
    setAllDay(next);
    if (next && dateKeyToTime(endDate) < dateKeyToTime(startDate)) setEndDate(startDate);
  }, [endDate, startDate]);

  const primaryDisabled = saving || source?.status === 'cancelled';

  if (loading) {
    return (
      <SafeScreen backgroundColor={ui.background} includeTopInset={false} includeBottomInset>
        <EditorHeader ui={ui} title={mode === 'edit' ? t('schedule.editor.editTitle') : t('schedule.editor.createTitle')} onBack={() => navigation.goBack()} topInset={insets.top} />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={ui.textPrimary} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={ui.background} includeTopInset={false} includeBottomInset={false}>
      <EditorHeader ui={ui} title={mode === 'edit' ? t('schedule.editor.editTitle') : t('schedule.editor.createTitle')} onBack={() => navigation.goBack()} topInset={insets.top} />

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={[styles.flex, { backgroundColor: ui.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: keyboardVisible ? 170 : 148 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        enableAutomaticScroll
        extraHeight={72}
        extraScrollHeight={32}
        keyboardOpeningTime={0}
      >
        <View style={[styles.titleCard, cardStyle(ui)]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('schedule.editor.titlePlaceholder')}
            placeholderTextColor={ui.textMuted}
            style={[styles.titleInput, { color: ui.textPrimary }]}
            maxLength={80}
            returnKeyType="next"
          />
        </View>

        <View style={[styles.card, cardStyle(ui)]}>
          <View style={styles.allDayRow}>
            <View style={styles.leftIcon}>
              <Clock3 size={20} color={ui.textPrimary} strokeWidth={2} />
            </View>
            <Text style={[styles.rowMainText, { color: ui.textPrimary }]}>{t('schedule.editor.allDay')}</Text>
            <Switch
              value={allDay}
              onValueChange={toggleAllDay}
              trackColor={{ false: ui.softBorder, true: ui.accentSoft }}
              thumbColor={allDay ? ui.accent : ui.surface}
              ios_backgroundColor={ui.softBorder}
            />
          </View>

          <View style={styles.rangeRow}>
            <View style={styles.rangeColumn}>
              <Pressable onPress={() => openPicker('startDate')} hitSlop={6} style={({ pressed }) => [styles.datePressable, pressed && { opacity: ui.pressedOpacity }]}>
                <Text style={[styles.dateText, { color: ui.textPrimary }]}>{formatScheduleDate(startDate, t)}</Text>
              </Pressable>

              {!allDay ? (
                <Pressable onPress={() => openPicker('startTime')} hitSlop={6} style={({ pressed }) => [styles.timePill, { backgroundColor: ui.softSurface }, pressed && { opacity: ui.pressedOpacity }]}>
                  <Text style={[styles.timeText, { color: ui.textPrimary }]}>{formatScheduleTime(startTime, t)}</Text>
                </Pressable>
              ) : (
                <View style={styles.allDayPill}>
                  <Text style={[styles.allDayHint, { color: ui.textPrimary }]}>{t('schedule.editor.startDate')}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.arrowText, { color: ui.textSecondary }]}>→</Text>

            <View style={styles.rangeColumn}>
              <Pressable onPress={() => openPicker('endDate')} hitSlop={6} style={({ pressed }) => [styles.datePressable, pressed && { opacity: ui.pressedOpacity }]}>
                <Text style={[styles.dateText, { color: ui.textPrimary }]}>{formatScheduleDate(endDate, t)}</Text>
              </Pressable>

              {!allDay ? (
                <Pressable onPress={() => openPicker('endTime')} hitSlop={6} style={({ pressed }) => [styles.timePill, { backgroundColor: ui.softSurface }, pressed && { opacity: ui.pressedOpacity }]}>
                  <Text style={[styles.timeText, { color: ui.textPrimary }]}>{formatScheduleTime(endTime, t)}</Text>
                </Pressable>
              ) : (
                <View style={styles.allDayPill}>
                  <Text style={[styles.allDayHint, { color: ui.textPrimary }]}>{t('schedule.editor.endDate')}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.card, cardStyle(ui)]}>
          <Pressable onPress={handlePickLocation} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: ui.pressedBg }]}>
            <View style={styles.leftIcon}>
              <MapPin size={20} color={ui.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuMainText, { color: placeName || address ? ui.textPrimary : ui.textMuted }]} numberOfLines={2}>
                {placeName || address || t('schedule.editor.place')}
              </Text>
              {address && placeName ? (
                <Text style={[styles.rowSubText, { color: ui.textSecondary }]} numberOfLines={2}>{address}</Text>
              ) : null}
            </View>
            {placeName || address ? (
              <Pressable onPress={handleClearLocation} hitSlop={10} style={({ pressed }) => [styles.clearButton, pressed && { opacity: ui.pressedOpacity }]}>
                <X size={18} color={ui.accent} strokeWidth={2} />
              </Pressable>
            ) : (
              <Text style={[styles.rowActionText, { color: ui.accent }]}>{t('schedule.editor.map')}</Text>
            )}
          </Pressable>

          {address || latitude != null || longitude != null ? (
            <View style={styles.locationNameWrap}>
              <TextInput
                value={placeName}
                onChangeText={setPlaceName}
                placeholder={t('schedule.editor.placeNamePlaceholder')}
                placeholderTextColor={ui.textMuted}
                style={[styles.placeNameInput, { color: ui.textPrimary, backgroundColor: ui.softSurface }]}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.card, cardStyle(ui)]}>
          <View style={styles.memoInputRow}>
            <View style={styles.memoIcon}>
              <FileText size={20} color={ui.textPrimary} strokeWidth={2} />
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('schedule.editor.memoPlaceholder')}
              placeholderTextColor={ui.textMuted}
              style={[styles.memoInput, { color: ui.textPrimary, height: memoInputHeight }]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onFocus={() => {
                memoFocusedRef.current = true;
                if (!keyboardVisible) setKeyboardVisible(true);
                scrollMemoIntoView(80);
              }}
              onBlur={() => {
                memoFocusedRef.current = false;
              }}
              onContentSizeChange={(event) => {
                const nextHeight = Math.max(88, Math.min(220, Math.ceil(event.nativeEvent.contentSize.height)));
                if (nextHeight !== memoInputHeight) {
                  setMemoInputHeight(nextHeight);
                  if (memoFocusedRef.current) {
                    scrollMemoIntoView(24);
                  }
                }
              }}
            />
          </View>
        </View>

        {source?.status === 'cancelled' ? (
          <Text style={[styles.cancelledNotice, { color: ui.textMuted }]}>{t('schedule.editor.cancelledLocked')}</Text>
        ) : null}

        {pickerKind ? (
          <View style={[styles.pickerCard, cardStyle(ui)]}>
            {Platform.OS === 'ios' ? (
              <View style={styles.pickerHeaderRow}>
                <Text style={[styles.pickerHeaderText, { color: ui.textPrimary }]}>{t('schedule.common.select')}</Text>
                <Pressable onPress={closePicker} hitSlop={8}>
                  <Text style={[styles.pickerDoneText, { color: ui.accent }]}>{t('schedule.common.done')}</Text>
                </Pressable>
              </View>
            ) : null}
            <DateTimePicker
              value={pickerDate}
              mode={pickerKind === 'startDate' || pickerKind === 'endDate' ? 'date' : 'time'}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickerChange}
              is24Hour={false}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {!keyboardVisible ? (
        <View style={[styles.footer, { backgroundColor: ui.background, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.footerButton,
              styles.footerGhostButton,
              {
                backgroundColor: ui.softSurface,
                borderColor: ui.softBorder,
                borderWidth: ui.hairline,
                opacity: pressed ? ui.pressedOpacity : 1,
              },
            ]}
          >
            <Text style={[styles.footerGhostText, { color: ui.textSecondary }]}>{t('schedule.common.cancel')}</Text>
          </Pressable>

          <Pressable
            disabled={primaryDisabled}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.footerButton,
              {
                backgroundColor: primaryDisabled ? ui.softSurface : (ui.accentBg || ui.accent),
                opacity: pressed ? ui.pressedOpacity : 1,
              },
            ]}
          >
            <Text style={[styles.footerPrimaryText, { color: primaryDisabled ? ui.textMuted : ui.inverseText }]}>
              {saving ? t('schedule.common.saving') : t('schedule.common.save')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeScreen>
  );
}

function EditorHeader({ ui, title, onBack, topInset }: { ui: ChatScheduleTheme; title: string; onBack: () => void; topInset: number }) {
  return (
    <View style={[styles.headerShell, { backgroundColor: ui.background, paddingTop: topInset }]}>
      <View style={[styles.header, { backgroundColor: ui.background }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => [styles.backBtn, pressed && { opacity: ui.pressedOpacity }]}>
            <ChevronLeft size={22} color={ui.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: ui.textPrimary }]} numberOfLines={1}>{title}</Text>
        </View>
      </View>
    </View>
  );
}

const cardStyle = (ui: ChatScheduleTheme) => ({
  backgroundColor: ui.surface,
  borderColor: ui.border,
  borderWidth: ui.hairline,
  borderRadius: 20,
  overflow: 'hidden' as const,
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerShell: {},
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    marginLeft: -6,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  titleCard: {
    marginBottom: 10,
  },
  card: {
    marginBottom: 12,
  },
  titleInput: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '500',
  },
  allDayRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftIcon: {
    width: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rowMainText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  menuMainText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  rowSubText: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  rangeRow: {
    minHeight: 110,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  datePressable: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dateText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  timePill: {
    marginTop: 8,
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  allDayPill: {
    marginTop: 8,
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayHint: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  arrowText: {
    width: 36,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '300',
  },
  menuRow: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuTextWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  rowActionText: {
    marginLeft: 12,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  clearButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  locationNameWrap: {
    paddingHorizontal: 16,
    paddingLeft: 54,
    paddingRight: 16,
    paddingBottom: 16,
  },
  placeNameInput: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  memoInputRow: {
    minHeight: 118,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memoIcon: {
    width: 38,
    paddingTop: 2,
    alignItems: 'flex-start',
  },
  memoInput: {
    flex: 1,
    minHeight: 88,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
  },
  cancelledNotice: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  pickerCard: {
    paddingVertical: 6,
  },
  pickerHeaderRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerHeaderText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  pickerDoneText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerGhostButton: {},
  footerGhostText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  footerPrimaryText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
});
