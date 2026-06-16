// src/screens/beacons/Edit.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
  StatusBar,
  Switch,
  Keyboard,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { createBeaconEditTheme, createBeaconEditStyles, type BeaconEditTheme, type BeaconEditStyles } from './Edit.theme';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import Slider from '@react-native-community/slider';

type Visibility = 'public' | 'friends' | 'labels' | 'custom';
type VisibleGender = 'any' | 'male' | 'female';

type LabelRow = { id: number; name: string };
type FriendRow = { id: string; nickname: string; avatar_url?: string | null };
type BeaconCreateResult = { beacon_id: number | string; room_id: number | string };
const BEACON_EDIT_SELECT = 'id, title, description, visibility, allow_gender, public_exclude_friends, require_approval, expires_at, display_lat, display_lng, lat, lng, radius_m, male_quota, female_quota, mix_quota, max_members, min_age, max_age, friend_place_text, friend_place_detail' as const;

type BeaconRow = {
  id: number;
  title: string;
  description: string | null;
  visibility: Visibility;
  allow_gender?: VisibleGender | null;
  public_exclude_friends?: boolean | null;
  expires_at?: string | null;
  display_lat?: number | null;
  display_lng?: number | null;
  require_approval?: boolean | null;
  male_quota?: number | null;
  female_quota?: number | null;
  mix_quota?: number | null;
  min_age?: number | null;
  max_age?: number | null;
  radius_m?: number | null;
};

type AudienceRow = {
  audience_kind: 'user' | 'label';
  target_user_id: string | null;
  label_id: number | null;
};

type LocationState = {
  lat: number;
  lng: number;
  fetchedAt: number;
};

type ToastTone = 'info' | 'success' | 'error';

function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

function toNum(v: unknown, errorMessage = 'Invalid ID') {
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n)) throw new Error(errorMessage);
  return n;
}

function isVisibility(value: unknown): value is Visibility {
  return value === 'public' || value === 'friends' || value === 'labels' || value === 'custom';
}

function isVisibleGender(value: unknown): value is VisibleGender {
  return value === 'any' || value === 'male' || value === 'female';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

function pickNullableString(obj: Record<string, unknown> | null, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    if (!(key in obj)) continue;
    const value = obj[key];
    if (value == null) return null;
    if (typeof value === 'string') return value;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown> | null, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstExistingKey(obj: Record<string, unknown> | null, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    if (key in obj) return key;
  }
  return null;
}


function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function getAgeFromBirthdate(birthdate: string) {
  const today = new Date();
  const dob = new Date(birthdate);
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function metersToDeltaLat(m: number) {
  return m / 111_320;
}

function metersToDeltaLng(m: number, atLat: number) {
  const latRad = (atLat * Math.PI) / 180;
  const metersPerDeg = 111_320 * Math.cos(latRad);
  if (metersPerDeg <= 1e-6) return 0;
  return m / metersPerDeg;
}

function randInRange(absMax: number) {
  return (Math.random() * 2 - 1) * absMax;
}

const VISIBILITY_OPTIONS: Visibility[] = ['public', 'friends', 'labels', 'custom'];
const GENDER_OPTIONS: VisibleGender[] = ['any', 'male', 'female'];

// 10분씩 증가 -> 120분 이후 30분씩 증가
const DURATION_STEPS = [30, 40, 50, 60, 90, 120, 150, 180, 210, 240];
const DURATION_HOTKEYS = [30, 60, 90, 120, 150, 180, 240];

// 50m 단위 정교 조절
const JITTER_STEPS = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
const JITTER_HOTKEYS = [0, 50, 100, 150, 200, 300, 400, 500];

function formatDuration(min: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (min < 60) return t('beacons:time.minute', { count: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? t('beacons:time.hourMinute', { hour: h, minute: m }) : t('beacons:time.hour', { count: h });
}

function formatJitter(m: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (m === 0) return t('beacons:form.protectionOff');
  return `${m}m`;
}

// 직접 타이핑 기능이 포함된 프리미엄 스텝퍼
function DirectStepper({
  styles,
  value,
  min,
  max,
  onChange,
  suffix = '',
  onFocus,
}: {
  styles: BeaconEditStyles;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  onFocus?: () => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const handleBlur = () => {
    let n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n)) n = min;
    n = clamp(n, min, max);
    setText(String(n));
    onChange(n);
  };

  return (
    <View style={styles.stepperWrap}>
      <Pressable
        style={({ pressed }) => [styles.stepBtn, value <= min && styles.stepBtnDisabled, pressed && !(value <= min) && styles.pressedScale]}
        onPress={() => onChange(clamp(value - 1, min, max))}
        disabled={value <= min}
      >
        <Text style={[styles.stepBtnText, value <= min && styles.stepBtnTextDisabled]}>-</Text>
      </Pressable>
      
      <View style={styles.stepInputWrap}>
        <TextInput
          style={styles.stepInputText}
          value={text}
          onChangeText={setText}
          onBlur={handleBlur}
          onFocus={onFocus}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
        {!!suffix && <Text style={styles.stepSuffix}>{suffix}</Text>}
      </View>

      <Pressable
        style={({ pressed }) => [styles.stepBtn, value >= max && styles.stepBtnDisabled, pressed && !(value >= max) && styles.pressedScale]}
        onPress={() => onChange(clamp(value + 1, min, max))}
        disabled={value >= max}
      >
        <Text style={[styles.stepBtnText, value >= max && styles.stepBtnTextDisabled]}>+</Text>
      </Pressable>
    </View>
  );
}


// Home.tsx 범위 UI 감성으로 맞춘 입력 가능한 스텝 슬라이더
function DiscreteSlider({
  styles,
  C,
  steps,
  value,
  onChange,
  formatValue,
  onSlidingStateChange,
  minLabel,
  maxLabel,
  inputSuffix = '',
  onFocusInput,
}: {
  styles: BeaconEditStyles;
  C: BeaconEditTheme;
  steps: number[];
  value: number;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
  onSlidingStateChange?: (sliding: boolean) => void;
  minLabel?: string;
  maxLabel?: string;
  inputSuffix?: string;
  onFocusInput?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState(String(value));

  useEffect(() => {
    setInputText(String(value));
  }, [value]);

  const currentSliderIndex = useMemo(() => {
    const idx = steps.indexOf(value);
    if (idx !== -1) return idx;
    let closestIdx = 0;
    let minDiff = Infinity;
    steps.forEach((step, i) => {
      const diff = Math.abs(step - value);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, [steps, value]);

  const applyInputValue = useCallback(() => {
    let n = parseInt(inputText.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n)) n = steps[0];
    let closest = steps[0];
    let minDiff = Math.abs(n - closest);
    steps.forEach((step) => {
      const diff = Math.abs(n - step);
      if (diff < minDiff) {
        minDiff = diff;
        closest = step;
      }
    });
    onChange(closest);
    setInputText(String(closest));
    setIsEditing(false);
  }, [inputText, onChange, steps]);

  const handleSliderChange = useCallback(
    (sliderIndex: number) => {
      const idx = Math.round(sliderIndex);
      const next = steps[idx];
      if (next !== undefined) onChange(next);
    },
    [onChange, steps],
  );

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderValueBlock}>
        {isEditing ? (
          <View style={styles.sliderInputWrap}>
            <TextInput
              style={styles.sliderInput}
              value={inputText}
              onChangeText={setInputText}
              keyboardType="number-pad"
              autoFocus
              onFocus={onFocusInput}
              onBlur={applyInputValue}
              onSubmitEditing={applyInputValue}
              returnKeyType="done"
              maxLength={5}
              placeholderTextColor={C.textMuted}
            />
            {!!inputSuffix && <Text style={styles.sliderInputSuffix}>{inputSuffix}</Text>}
          </View>
        ) : (
          <Pressable onPress={() => setIsEditing(true)} hitSlop={8}>
            <Text style={styles.dynamicSliderValue}>{formatValue(value)}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.sliderTrackArea2}>
        <View style={styles.sliderLabelRow}>
          <Text style={styles.sliderLabelText}>{minLabel ?? formatValue(steps[0])}</Text>
          <Text style={styles.sliderLabelText}>{maxLabel ?? formatValue(steps[steps.length - 1])}</Text>
        </View>

        <Slider
          style={styles.nativeSlider}
          minimumValue={0}
          maximumValue={steps.length - 1}
          step={1}
          value={currentSliderIndex}
          onSlidingStart={() => onSlidingStateChange?.(true)}
          onValueChange={handleSliderChange}
          onSlidingComplete={(sliderIndex) => {
            handleSliderChange(Number(sliderIndex));
            onSlidingStateChange?.(false);
          }}
          minimumTrackTintColor={C.primary}
          maximumTrackTintColor={C.hairline}
          thumbTintColor={C.primary}
        />
      </View>
    </View>
  );
}

function HotkeyChip({
  styles,
  label,
  active,
  onPress,
  chipStyle,
  textStyle,
}: {
  styles: BeaconEditStyles;
  label: string;
  active: boolean;
  onPress: () => void;
  chipStyle?: any;
  textStyle?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hotkeyChip,
        chipStyle,
        active ? styles.hotkeyActive : styles.hotkeyInactive,
        pressed && styles.pressedOpacity,
      ]}
    >
      <Text
        style={[
          styles.hotkeyText,
          textStyle,
          active ? styles.hotkeyTextActive : styles.hotkeyTextInactive,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function EditBeacon({ navigation }: any) {
  const route = useRoute<any>();
  const { t } = useTranslation();
  const beaconId = Number(route.params?.id ?? route.params?.beaconId);
  const rootNav = getRootNavigation(navigation);
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createBeaconEditTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBeaconEditStyles(C), [C]);

  const visibilityLabel = useMemo<Record<Visibility, string>>(() => ({
    public: t('beacons:visibilityLabel.public'),
    friends: t('beacons:visibilityLabel.friends'),
    labels: t('beacons:visibilityLabel.labels'),
    custom: t('beacons:visibilityLabel.custom'),
  }), [t]);
  const visibilityDesc = useMemo<Record<Visibility, string>>(() => ({
    public: t('beacons:visibilityDesc.public'),
    friends: t('beacons:visibilityDesc.friends'),
    labels: t('beacons:visibilityDesc.labels'),
    custom: t('beacons:visibilityDesc.custom'),
  }), [t]);
  const genderLabel = useMemo<Record<VisibleGender, string>>(() => ({
    any: t('beacons:gender.any'),
    male: t('beacons:gender.male'),
    female: t('beacons:gender.female'),
  }), [t]);
  const formatDurationText = useCallback((min: number) => formatDuration(min, t), [t]);
  const formatJitterText = useCallback((m: number) => formatJitter(m, t), [t]);
  const mountedRef = useRef(true);
  const rawBeaconRef = useRef<Record<string, unknown> | null>(null);
  const originalExpiresAtRef = useRef<string | null>(null);
  const originalDurationStepRef = useRef<number | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [durationMin, setDurationMin] = useState(60);
  const [jitterMeters, setJitterMeters] = useState(100);

  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [publicExcludeFriends, setPublicExcludeFriends] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);

  const [visibleGender, setVisibleGender] = useState<VisibleGender>('any');
  const [maleQuota, setMaleQuota] = useState(0);
  const [femaleQuota, setFemaleQuota] = useState(0);
  const [mixQuota, setMixQuota] = useState(0);
  const [ageLimitDisabled, setAgeLimitDisabled] = useState(false);
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(39);

  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const [labelModalOpen, setLabelModalOpen] = useState(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendModalOpen, setFriendModalOpen] = useState(false);
  const [friendQ, setFriendQ] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendPlaceAddress, setFriendPlaceAddress] = useState('');
  const [friendPlaceText, setFriendPlaceText] = useState('');
  const [friendPlaceDetail, setFriendPlaceDetail] = useState('');
  const [actualBeaconLocation, setActualBeaconLocation] = useState<LocationState | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [baseLocation, setBaseLocation] = useState<LocationState | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [toast, setToast] = useState<{ visible: boolean; message: string; tone: ToastTone }>({ visible: false, message: '', tone: 'info' });
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (deferredActionTimerRef.current) clearTimeout(deferredActionTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = 'info', duration = 2200) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (!mountedRef.current) return;
    setToast({ visible: true, message, tone });
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast((prev) => ({ ...prev, visible: false }));
      toastTimerRef.current = null;
    }, duration);
  }, []);

  const scheduleDeferredAction = useCallback((action: () => void, delay = 650) => {
    if (deferredActionTimerRef.current) clearTimeout(deferredActionTimerRef.current);
    deferredActionTimerRef.current = setTimeout(() => {
      deferredActionTimerRef.current = null;
      action();
    }, delay);
  }, []);

  const ensureFocusedInputVisible = useCallback((nextKeyboardInset?: number) => {
    requestAnimationFrame(() => {
      const focused =
        (TextInput.State as any)?.currentlyFocusedInput?.() ??
        (TextInput.State as any)?.currentlyFocusedField?.();

      if (!focused || typeof focused.measureInWindow !== 'function') return;

      const screenH = Dimensions.get('window').height;
      const inset = typeof nextKeyboardInset === 'number' ? nextKeyboardInset : keyboardInset;
      const visibleBottom = screenH - inset - 88;

      focused.measureInWindow((x: number, y: number, w: number, h: number) => {
        const bottom = y + h;
        if (bottom > visibleBottom) {
          const delta = bottom - visibleBottom + 16;
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollYRef.current + delta),
            animated: true,
          });
        }
      });
    });
  }, [keyboardInset]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const nextInset = e.endCoordinates?.height ?? 0;
      setKeyboardInset(nextInset);
      setTimeout(() => ensureFocusedInputVisible(nextInset), Platform.OS === 'ios' ? 40 : 80);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ensureFocusedInputVisible]);

  const handleInputFocus = useCallback(() => {
    setTimeout(() => ensureFocusedInputVisible(), Platform.OS === 'ios' ? 40 : 80);
  }, [ensureFocusedInputVisible]);



  const applyVisibilityDefault = useCallback((next: Visibility) => {
    setVisibility(next);
    setRequireApproval(next === 'public');
    if (next !== 'public') setPublicExcludeFriends(false);
    if (next !== 'labels' && next !== 'custom') setSelectedLabelIds([]);
    if (next !== 'custom') setSelectedFriendIds([]);
  }, []);

  const getFastLocation = useCallback(async () => {
    const { status: cur } = await Location.getForegroundPermissionsAsync();
    let final = cur;
    if (cur !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') throw new Error(t('beacons:error.locationPermission'));

    try {
      const last = await Location.getLastKnownPositionAsync({});
      if (last?.coords?.latitude && last?.coords?.longitude) return last;
    } catch {}

    return Location.getCurrentPositionAsync({
      accuracy: Platform.OS === 'ios' ? Location.Accuracy.Balanced : Location.Accuracy.Low,
    });
  }, []);

  const refreshBaseLocation = useCallback(async () => {
    try {
      setLocationError(null);
      const loc = await getFastLocation();
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(t('beacons:error.locationUnavailable'));
      if (!mountedRef.current) return;
      setBaseLocation({ lat, lng, fetchedAt: Date.now() });
      setLocationReady(true);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setLocationReady(false);
      setLocationError(e?.message ?? t('beacons:error.locationLoadFail'));
    }
  }, [getFastLocation]);

  useEffect(() => { void refreshBaseLocation(); }, [refreshBaseLocation]);
  const openFriendPlacePicker = useCallback(async () => {
    try {
      let base = baseLocation;
      if (!base) {
        const loc = await getFastLocation();
        base = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          fetchedAt: Date.now(),
        };
        if (mountedRef.current) setBaseLocation(base);
      }

      rootNav.navigate?.('LocationPicker', {
        mode: 'bounded',
        baseLat: base.lat,
        baseLng: base.lng,
        maxDistanceMeters: 200,
        initialLat: base.lat,
        initialLng: base.lng,
        title: t('beacons:form.locationSelectTitle'),
        helperText: t('beacons:form.locationSelectHelper'),
        onPick: ({ address }: { lat: number; lng: number; address: string }) => {
          if (!mountedRef.current) return;
          setFriendPlaceAddress(address || '');
        },
      });
    } catch (e: any) {
      showToast(e?.message ?? t('beacons:error.locationUnavailable'), 'error');
    }
  }, [baseLocation, rootNav, showToast]);


  const loadBeacon = useCallback(async () => {
    try {
      setInitialLoading(true);

      if (!Number.isFinite(beaconId)) {
        throw new Error(t('beacons:error.invalidAccess'));
      }

      const { data, error } = await supabase
        .from('beacons')
        .select(BEACON_EDIT_SELECT)
        .eq('id', beaconId)
        .maybeSingle();

      if (error) throw error;
      const raw = asRecord(data);
      if (!raw) throw new Error(t('beacons:error.notFound'));

      const visibilityValue = isVisibility(raw.visibility) ? raw.visibility : 'friends';
      const allowGenderValue = isVisibleGender(raw.allow_gender) ? raw.allow_gender : 'any';

      const aud = await supabase
        .from('beacon_audience_targets')
        .select('audience_kind,target_user_id,label_id')
        .eq('beacon_id', beaconId);

      if (aud.error) throw aud.error;

      const audienceRows = (aud.data ?? []) as AudienceRow[];
      const userIds = audienceRows
        .filter((r) => r.audience_kind === 'user' && r.target_user_id)
        .map((r) => String(r.target_user_id));
      const labelIds = audienceRows
        .filter((r) => r.audience_kind === 'label' && r.label_id != null)
        .map((r) => Number(r.label_id));

      const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : null;
      const remainingMin = expiresAt
        ? Math.max(30, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
        : 60;
      const resolvedDurationStep = DURATION_STEPS.includes(remainingMin)
        ? remainingMin
        : DURATION_STEPS.reduce((best, step) =>
            Math.abs(step - remainingMin) < Math.abs(best - remainingMin) ? step : best,
          DURATION_STEPS[0]);

      const anchorLat =
        pickNumber(raw, ['base_lat', 'actual_lat', 'real_lat', 'source_lat', 'map_lat', 'lat']) ??
        pickNumber(raw, ['display_lat']);
      const anchorLng =
        pickNumber(raw, ['base_lng', 'actual_lng', 'real_lng', 'source_lng', 'map_lng', 'lng']) ??
        pickNumber(raw, ['display_lng']);

      const jitterValue =
        pickNumber(raw, ['jitter_meters', 'location_jitter_meters', 'display_jitter_meters', 'jitter_m', 'jitter']) ?? 100;

      rawBeaconRef.current = raw;
      originalExpiresAtRef.current = expiresAt;
      originalDurationStepRef.current = resolvedDurationStep;

      if (!mountedRef.current) return;

      setTitle(typeof raw.title === 'string' ? raw.title : '');
      setDescription(typeof raw.description === 'string' ? raw.description : '');
      applyVisibilityDefault(visibilityValue);
      setVisibility(visibilityValue);
      setPublicExcludeFriends(Boolean(raw.public_exclude_friends));
      setRequireApproval(Boolean(raw.require_approval));
      setVisibleGender(allowGenderValue);
      setDurationMin(resolvedDurationStep);
      setJitterMeters(Math.max(0, Math.min(500, Math.round(jitterValue / 50) * 50)));
      setMaleQuota(pickNumber(raw, ['male_quota']) ?? 0);
      setFemaleQuota(pickNumber(raw, ['female_quota']) ?? 0);
      setMixQuota(pickNumber(raw, ['mix_quota']) ?? 0);

      const minAgeValue = pickNumber(raw, ['min_age']);
      const maxAgeValue = pickNumber(raw, ['max_age']);
      const ageDisabled = minAgeValue == null && maxAgeValue == null;
      setAgeLimitDisabled(ageDisabled);
      setAgeMin(minAgeValue ?? 20);
      setAgeMax(maxAgeValue ?? 39);

      setSelectedFriendIds(userIds);
      setSelectedLabelIds(labelIds);

      const friendAddress = pickNullableString(raw, ['friend_place_address', 'location_address', 'detail_address', 'meeting_address']) ?? '';
      const friendText = pickNullableString(raw, ['friend_place_text', 'location_text', 'place_text', 'meeting_place_text', 'meeting_place_name']) ?? '';
      const friendDetail = pickNullableString(raw, ['friend_place_detail', 'location_detail', 'place_detail', 'meeting_place_detail']) ?? '';

      setFriendPlaceAddress(friendAddress);
      setFriendPlaceText(friendText);
      setFriendPlaceDetail(friendDetail);

      if (Number.isFinite(anchorLat) && Number.isFinite(anchorLng)) {
        const anchor = {
          lat: Number(anchorLat),
          lng: Number(anchorLng),
          fetchedAt: Date.now(),
        };
        setActualBeaconLocation(anchor);
      }
    } catch (e: any) {
      showToast(e?.message ?? t('beacons:error.detailLoadFail'), 'error');
      scheduleDeferredAction(() => navigation.goBack(), 350);
    } finally {
      if (mountedRef.current) setInitialLoading(false);
    }
  }, [applyVisibilityDefault, beaconId, navigation, scheduleDeferredAction, showToast]);

  useEffect(() => { void loadBeacon(); }, [loadBeacon]);

  const loadLabels = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('user_labels').select('id,name').order('name', { ascending: true });
      if (error) throw error;
      setLabels((data ?? []) as LabelRow[]);
    } catch (e: any) {
      showToast(e?.message ?? t('beacons:create.alert.labelLoadFail'), 'error');
    }
  }, [showToast]);

  const loadFriends = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: frs, error: frErr } = await supabase
        .from('friendships')
        .select('requester,addressee,status')
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
        .eq('status', 'accepted');
      if (frErr) throw frErr;

      const ids = Array.from(new Set((frs ?? []).map((f: any) => (f.requester === user.id ? f.addressee : f.requester))));
      if (ids.length === 0) { setFriends([]); return; }

      const { data: profs, error: pErr } = await supabase.from('profiles').select('id,nickname,avatar_url').in('id', ids);
      if (pErr) throw pErr;

      const rows = (profs ?? [])
        .map((p: any) => ({ id: String(p.id), nickname: p.nickname || t('beacons:common.noName'), avatar_url: p.avatar_url ?? null }))
        .sort((a: FriendRow, b: FriendRow) => a.nickname.localeCompare(b.nickname, 'ko'));

      setFriends(rows);
    } catch (e: any) {
      showToast(e?.message ?? t('beacons:create.alert.friendLoadFail'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (visibility === 'labels' || visibility === 'custom') void loadLabels();
    if (visibility === 'custom') void loadFriends();
  }, [visibility, loadLabels, loadFriends]);

  useEffect(() => {
    let cancelled = false;

    const loadAgeDefaults = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) return;

        let birthdate: string | null = null;

        const primary = await supabase
          .from('profiles')
          .select('birthdate')
          .eq('user_id', userId)
          .maybeSingle();

        if (!primary.error && primary.data?.birthdate) {
          birthdate = primary.data.birthdate as string;
        } else {
          const fallback = await supabase
            .from('profiles')
            .select('birthdate')
            .eq('id', userId)
            .maybeSingle();

          if (!fallback.error && fallback.data?.birthdate) {
            birthdate = fallback.data.birthdate as string;
          }
        }

        if (!birthdate || cancelled) {
          return;
        }

        if (rawBeaconRef.current) {
          return;
        }

        const age = getAgeFromBirthdate(birthdate);
        if (!Number.isFinite(age)) return;

        const nextMin = clamp(age - 10, 14, 100);
        const nextMax = clamp(age + 10, 14, 100);

        if (!cancelled && !rawBeaconRef.current) {
          setAgeMin(nextMin);
          setAgeMax(Math.max(nextMin, nextMax));
        }
      } catch {
        // ignore and keep current defaults
      }
    };

    void loadAgeDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFriends = useMemo(() => {
    const q = friendQ.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.nickname.toLowerCase().includes(q));
  }, [friendQ, friends]);

  const totalQuota = maleQuota + femaleQuota + mixQuota;

  const validate = useCallback(() => {
    if (!title.trim()) throw new Error(t('beacons:edit.validation.titleRequired'));
    if (title.trim().length > 80) throw new Error(t('beacons:edit.validation.titleMax'));
    if (!Number.isFinite(durationMin) || durationMin < 10 || durationMin > 240) throw new Error(t('beacons:edit.validation.duration'));
    if (!ageLimitDisabled && ageMin > ageMax) throw new Error(t('beacons:edit.validation.ageRange'));
    if (visibility === 'labels' && selectedLabelIds.length === 0) throw new Error(t('beacons:edit.validation.labelsRequired'));
    if (visibility === 'custom' && selectedLabelIds.length === 0 && selectedFriendIds.length === 0) throw new Error(t('beacons:edit.validation.customRequired'));
  }, [ageLimitDisabled, ageMax, ageMin, baseLocation, durationMin, locationReady, selectedFriendIds.length, selectedLabelIds.length, title, visibility]);

  const moveBeaconToCurrentLocation = useCallback(async () => {
    try {
      if (!Number.isFinite(beaconId)) throw new Error(t('beacons:error.invalidAccess'));
      const loc = await getFastLocation();
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(t('beacons:error.locationUnavailable'));

      const { error } = await supabase.rpc('move_beacon_to_here_v2', {
        p_beacon_id: beaconId,
        p_lat: lat,
        p_lng: lng,
      });

      if (error) throw error;

      const next = { lat, lng, fetchedAt: Date.now() };
      if (!mountedRef.current) return;
      setActualBeaconLocation(next);
      setBaseLocation(next);
      setLocationReady(true);
      setLocationError(null);

      showToast(t('beacons:edit.toast.moved'), 'success', 1600);
    } catch (e: any) {
      showToast(e?.message ?? t('beacons:edit.toast.moveFail'), 'error');
    }
  }, [beaconId, getFastLocation, showToast]);

  const saveBeacon = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      validate();

      if (!Number.isFinite(beaconId)) {
        throw new Error(t('beacons:error.invalidAccess'));
      }

      const titleValue = title.trim();
      const anchor = actualBeaconLocation ?? baseLocation;
      if (!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) {
        throw new Error(t('beacons:error.locationUnavailable'));
      }

      let displayLat = anchor.lat;
      let displayLng = anchor.lng;

      if (jitterMeters > 0) {
        displayLat = anchor.lat + randInRange(metersToDeltaLat(jitterMeters));
        displayLng = anchor.lng + randInRange(metersToDeltaLng(jitterMeters, anchor.lat));
      }

      const maxMembers = totalQuota > 0 ? totalQuota : null;
      const expiresAt =
        originalDurationStepRef.current != null &&
        originalDurationStepRef.current === durationMin &&
        originalExpiresAtRef.current
          ? originalExpiresAtRef.current
          : new Date(Date.now() + durationMin * 60_000).toISOString();

      const { error } = await supabase.rpc('update_beacon_v2', {
        p_beacon_id: beaconId,
        p_title: titleValue,
        p_description: description.trim() || null,
        p_visibility: visibility,
        p_public_exclude_friends: visibility === 'public' ? publicExcludeFriends : false,
        p_require_approval: requireApproval,
        p_display_lat: displayLat,
        p_display_lng: displayLng,
        p_radius_m: 100,
        p_allow_gender: visibleGender,
        p_male_quota: maleQuota > 0 ? maleQuota : null,
        p_female_quota: femaleQuota > 0 ? femaleQuota : null,
        p_mix_quota: mixQuota > 0 ? mixQuota : null,
        p_max_members: maxMembers,
        p_expires_at: expiresAt,
        p_min_age: ageLimitDisabled ? null : ageMin,
        p_max_age: ageLimitDisabled ? null : ageMax,
        p_target_user_ids: visibility === 'custom' ? selectedFriendIds : [],
        p_target_label_ids: visibility === 'labels' || visibility === 'custom' ? selectedLabelIds : [],
      });

      if (error) throw error;

      const raw = rawBeaconRef.current;
      if (raw) {
        const extraPatch: Record<string, unknown> = {};
        const friendAddressKey = firstExistingKey(raw, ['friend_place_address', 'location_address', 'detail_address', 'meeting_address']);
        const friendTextKey = firstExistingKey(raw, ['friend_place_text', 'location_text', 'place_text', 'meeting_place_text', 'meeting_place_name']);
        const friendDetailKey = firstExistingKey(raw, ['friend_place_detail', 'location_detail', 'place_detail', 'meeting_place_detail']);
        const jitterKey = firstExistingKey(raw, ['jitter_meters', 'location_jitter_meters', 'display_jitter_meters', 'jitter_m', 'jitter']);

        if (friendAddressKey) extraPatch[friendAddressKey] = friendPlaceAddress.trim() || null;
        if (friendTextKey) extraPatch[friendTextKey] = friendPlaceText.trim() || null;
        if (friendDetailKey) extraPatch[friendDetailKey] = friendPlaceDetail.trim() || null;
        if (jitterKey) extraPatch[jitterKey] = jitterMeters;

        if (Object.keys(extraPatch).length > 0) {
          const extraRes = await supabase.from('beacons').update(extraPatch).eq('id', beaconId);
          if (extraRes.error) throw extraRes.error;
        }
      }

      if (mountedRef.current) setLoading(false);

      showToast(t('beacons:edit.toast.saved'), 'success', 900);
      scheduleDeferredAction(() =>
        navigation.navigate('MapMain', {
          highlightBeaconId: beaconId,
        }), 420);
    } catch (e: any) {
      if (mountedRef.current) setLoading(false);
      showToast(e?.message ?? t('beacons:edit.toast.saveFail'), 'error');
    }
  }, [
    actualBeaconLocation,
    ageLimitDisabled,
    ageMax,
    ageMin,
    baseLocation,
    beaconId,
    description,
    durationMin,
    femaleQuota,
    friendPlaceAddress,
    friendPlaceDetail,
    friendPlaceText,
    jitterMeters,
    loading,
    maleQuota,
    mixQuota,
    navigation,
    publicExcludeFriends,
    requireApproval,
    selectedFriendIds,
    selectedLabelIds,
    showToast,
    scheduleDeferredAction,
    title,
    totalQuota,
    validate,
    visibility,
    visibleGender,
  ]);

  if (initialLoading) {
    return (
      <SafeScreen
        backgroundColor={C.background}
        includeTopInset
        includeBottomInset
        style={styles.center}
        contentStyle={styles.centerContent}
      >
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>{t('beacons:common.loading')}</Text>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset
      includeBottomInset
      style={styles.rootWrap}
      contentStyle={styles.safeContent}
    >
      <StatusBar backgroundColor={C.background} barStyle={C.statusBarStyle} translucent={false} />
      
      <View style={styles.header}>
        <Pressable hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBackIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('beacons:edit_title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* 키보드 레이아웃 오차 해결을 위해 루트 영역부터 플렉스 점유 */}
      <KeyboardAvoidingView 
        style={styles.flex} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          scrollEnabled={scrollEnabled}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 72 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {/* 보더리스 화이트 박스 폼 */}
          <View style={styles.contentBlock}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:form.meetingTitle')}</Text>
            </View>
            <TextInput
              style={styles.borderlessInput}
              placeholder={t('beacons:form.titlePlaceholder')}
              placeholderTextColor={C.textMuted}
              value={title}
              onChangeText={setTitle}
              onFocus={handleInputFocus}
              maxLength={80}
            />
            <TextInput
              style={styles.borderlessTextArea}
              placeholder={t('beacons:form.descPlaceholder')}
              placeholderTextColor={C.textMuted}
              value={description}
              onChangeText={setDescription}
              onFocus={handleInputFocus}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
          </View>

          {/* 비콘 유지 시간 */}
          <View style={styles.contentBlock}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:form.durationTitle')}</Text>
            </View>
            <Text style={styles.blockDesc}>{t('beacons:form.durationDesc')}</Text>
            
            <DiscreteSlider styles={styles} C={C} steps={DURATION_STEPS} 
              value={durationMin} 
              onChange={setDurationMin} 
              formatValue={formatDurationText}
              minLabel={t('beacons:form.durationMin')}
              maxLabel={t('beacons:form.durationMax')}
              inputSuffix={t('beacons:form.minuteSuffix')}
              onFocusInput={handleInputFocus}
              onSlidingStateChange={(sliding) => setScrollEnabled(!sliding)}
            />
            <View style={styles.hotkeyWrap}>
              {DURATION_HOTKEYS.map((min) => (
                <HotkeyChip styles={styles} key={min}
                  label={t('beacons:time.minute', { count: min })}
                  active={durationMin === min}
                  onPress={() => setDurationMin(min)}
                  chipStyle={styles.metricChip}
                />
              ))}
            </View>
          </View>

          {/* 위치 보호 설정 */}
          <View style={styles.contentBlock}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:form.locationProtectionTitle')}</Text>
            </View>
            <Text style={styles.blockDesc}>{t('beacons:form.locationProtectionDesc')}</Text>
            
            <DiscreteSlider styles={styles} C={C} steps={JITTER_STEPS} 
              value={jitterMeters} 
              onChange={setJitterMeters} 
              formatValue={formatJitterText}
              minLabel={t('beacons:form.protectionOff')}
              maxLabel="500m"
              inputSuffix="m"
              onFocusInput={handleInputFocus}
              onSlidingStateChange={(sliding) => setScrollEnabled(!sliding)}
            />
            <View style={styles.hotkeyWrap}>
              {JITTER_HOTKEYS.map((opt) => (
                <HotkeyChip styles={styles} key={opt}
                  label={opt === 0 ? t('beacons:form.protectionOffAlt') : `${opt}m`}
                  active={jitterMeters === opt}
                  onPress={() => setJitterMeters(opt)}
                  chipStyle={styles.metricChip}
                />
              ))}
            </View>
            
            {!locationReady && (
              <Pressable style={styles.actionBtnOutline} onPress={() => void refreshBaseLocation()}>
                <Text style={styles.actionBtnOutlineText}>{t('beacons:form.refreshLocation')}</Text>
              </Pressable>
            )}
            <Pressable style={styles.actionBtnOutline} onPress={() => void moveBeaconToCurrentLocation()}>
              <Text style={styles.actionBtnOutlineText}>{t('beacons:form.moveToCurrentLocation')}</Text>
            </Pressable>
            {locationError && <Text style={styles.errorText}>{locationError}</Text>}
          </View>

          {/* 공개 범위 */}
          <View style={styles.contentBlock}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:visibility')}</Text>
            </View>
            <Text style={styles.blockDesc}>{visibilityDesc[visibility]}</Text>
            <View style={styles.visibilityGrid}>
              {VISIBILITY_OPTIONS.map((v) => (
                <HotkeyChip styles={styles} key={v}
                  label={visibilityLabel[v]}
                  active={visibility === v}
                  onPress={() => applyVisibilityDefault(v)}
                  chipStyle={styles.visibilityChip}
                />
              ))}
            </View>

            <View style={styles.settingList}>
              {/* 선 없음 (noBorderBottom) 적용 */}
              <View style={[styles.settingRow, visibility !== 'public' && styles.noBorderBottom]}>
                <View style={styles.settingRowTextWrap}>
                  <Text style={styles.settingLabel}>{t('beacons:form.requireApprovalTitle')}</Text>
                  <Text style={styles.settingSub}>{t('beacons:form.requireApprovalDesc')}</Text>
                </View>
                <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: C.hairline, true: C.primary }} thumbColor={C.onPrimary} />
              </View>

              {visibility === 'public' && (
                <View style={[styles.settingRow, styles.noBorderBottom]}>
                  <View style={styles.settingRowTextWrap}>
                    <Text style={styles.settingLabel}>{t('beacons:form.hideFromFriendsTitle')}</Text>
                    <Text style={styles.settingSub}>{t('beacons:form.hideFromFriendsDesc')}</Text>
                  </View>
                  <Switch value={publicExcludeFriends} onValueChange={setPublicExcludeFriends} trackColor={{ false: C.hairline, true: C.primary }} thumbColor={C.onPrimary} />
                </View>
              )}
            </View>

            {(visibility === 'labels' || visibility === 'custom') && (
              <View style={styles.targetSelectArea}>
                <Pressable style={({ pressed }) => [styles.actionBtnRow, pressed && styles.pressedScale]} onPress={() => setLabelModalOpen(true)}>
                  <View style={styles.actionBtnContent}>
                    <Text style={styles.actionBtnTitle}>{t('beacons:form.selectGroups')}</Text>
                    <Text style={styles.actionBtnSub}>{t('beacons:form.selectedGroupsCount', { count: selectedLabelIds.length })}</Text>
                  </View>
                  <Text style={styles.actionArrow}>›</Text>
                </Pressable>

                {visibility === 'custom' && (
                  <Pressable style={({ pressed }) => [styles.actionBtnRow, pressed && styles.pressedScale]} onPress={() => setFriendModalOpen(true)}>
                    <View style={styles.actionBtnContent}>
                      <Text style={styles.actionBtnTitle}>{t('beacons:form.selectFriends')}</Text>
                      <Text style={styles.actionBtnSub}>{t('beacons:form.selectedFriendsCount', { count: selectedFriendIds.length })}</Text>
                    </View>
                    <Text style={styles.actionArrow}>›</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {visibility !== 'public' && (
            <View style={styles.contentBlock}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockTitle}>{t('beacons:form.locationSelectTitle')}</Text>
              </View>
              <Text style={styles.blockDesc}>{t('beacons:form.friendLocationDesc')}</Text>

              <View style={styles.locationGuideCard}>
                <View style={styles.locationGuideTopRow}>
                  <View style={styles.locationGuideTextWrap}>
                    <Text style={styles.locationGuideTitle}>{t('beacons:form.locationPickTitle')}</Text>
                    <Text style={styles.locationGuideHint}>{t('beacons:form.locationPickHint')}</Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.locationGuideFabButton, pressed && styles.pressedScale]}
                    onPress={() => void openFriendPlacePicker()}
                    hitSlop={8}
                  >
                    <Text style={styles.locationGuideFabIcon}>›</Text>
                  </Pressable>
                </View>

                {!!friendPlaceAddress?.trim() ? (
                  <View style={styles.locationGuideAddressWrap}>
                    <Text style={styles.locationGuideAddressLabel}>{t('beacons:form.selectedAddress')}</Text>
                    <Text style={styles.locationGuideAddressText}>{friendPlaceAddress.trim()}</Text>
                  </View>
                ) : (
                  <Text style={styles.locationGuidePlaceholder}>{t('beacons:form.friendLocationEmpty')}</Text>
                )}
              </View>

              <TextInput
                style={styles.borderlessInput}
                placeholder={t('beacons:form.locationShortPlaceholder')}
                placeholderTextColor={C.textMuted}
                value={friendPlaceText}
                onChangeText={setFriendPlaceText}
                onFocus={handleInputFocus}
                maxLength={80}
              />

              <TextInput
                style={styles.borderlessTextArea}
                placeholder={t('beacons:form.locationDetailPlaceholder')}
                placeholderTextColor={C.textMuted}
                value={friendPlaceDetail}
                onChangeText={setFriendPlaceDetail}
                onFocus={handleInputFocus}
                multiline
                textAlignVertical="top"
                maxLength={160}
              />
            </View>
          )}

          {/* 참여 조건 설정 */}
          <View style={styles.contentBlock}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:form.conditionsTitle')}</Text>
            </View>
            
            <View style={styles.conditionBox}>
              <Text style={styles.conditionTitle}>{t('beacons:form.genderTitle')}</Text>
              <View style={styles.genderGrid}>
                {GENDER_OPTIONS.map((g) => (
                  <HotkeyChip styles={styles} key={g}
                    label={genderLabel[g]}
                    active={visibleGender === g}
                    onPress={() => setVisibleGender(g)}
                    chipStyle={styles.genderChip}
                  />
                ))}
              </View>
            </View>

            <View style={styles.conditionBox}>
              <Text style={styles.conditionTitle}>{t('beacons:form.quotaTitle')}</Text>
              <Text style={styles.conditionSub}>{t('beacons:form.quotaDesc')}</Text>
              
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>{t('beacons:form.maleQuota')}</Text>
                <DirectStepper styles={styles} value={maleQuota} min={0} max={100} onChange={setMaleQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
              </View>
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>{t('beacons:form.femaleQuota')}</Text>
                <DirectStepper styles={styles} value={femaleQuota} min={0} max={100} onChange={setFemaleQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
              </View>
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>{t('beacons:form.mixQuota')}</Text>
                <DirectStepper styles={styles} value={mixQuota} min={0} max={100} onChange={setMixQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
              </View>
            </View>

            <View style={styles.conditionBox}>
              <View style={styles.conditionHeaderRow}>
                <View style={styles.conditionHeaderTextWrap}>
                  <Text style={styles.conditionTitleNoMargin}>{t('beacons:form.ageLimitTitle')}</Text>
                  <Text style={styles.conditionSubNoMargin}>
                    {t('beacons:form.ageLimitDesc')}
                  </Text>
                </View>

                <View style={styles.ageToggleWrap}>
                  <Text style={styles.ageToggleText}>{t('beacons:form.ageNoLimit')}</Text>
                  <Switch
                    value={ageLimitDisabled}
                    onValueChange={setAgeLimitDisabled}
                    trackColor={{ false: C.hairline, true: C.primary }}
                    thumbColor={C.onPrimary}
                    ios_backgroundColor={C.hairline}
                  />
                </View>
              </View>

              {!ageLimitDisabled && (
                <>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('beacons:form.ageMin')}</Text>
                    <DirectStepper styles={styles} value={ageMin} min={14} max={100} onChange={setAgeMin} suffix={t('beacons:unit.age')} onFocus={handleInputFocus} />
                  </View>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('beacons:form.ageMax')}</Text>
                    <DirectStepper styles={styles} value={ageMax} min={14} max={100} onChange={setAgeMax} suffix={t('beacons:unit.age')} onFocus={handleInputFocus} />
                  </View>
                </>
              )}
            </View>

          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.floatingActionArea,
          { paddingBottom: 12 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.megaActionBtn, loading && styles.disabledOpacity, pressed && !loading && styles.pressedScale]}
          disabled={loading}
          onPress={() => void saveBeacon()}
        >
          {loading ? <ActivityIndicator color={C.onPrimary} /> : <Text style={styles.megaActionBtnText}>{t('beacons:form.saveButton')}</Text>}
        </Pressable>
      </View>

      {toast.visible && (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 74 }]}>
          <View
            style={[
              styles.toastBox,
              toast.tone === 'success' ? styles.toastSuccess : toast.tone === 'error' ? styles.toastError : styles.toastInfo,
            ]}
          >
            <Text style={styles.toastText} numberOfLines={2}>
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      <Modal visible={labelModalOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setLabelModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: insets.top + 60 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeadline}>{t('beacons:form.selectGroups')}</Text>
              <Pressable hitSlop={15} onPress={() => setLabelModalOpen(false)}>
                <Text style={styles.modalCloseText}>{t('beacons:common.done')}</Text>
              </Pressable>
            </View>
            
            <FlatList
              data={labels}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContainer}
              renderItem={({ item }) => {
                const isSelected = selectedLabelIds.includes(item.id);
                return (
                  <Pressable
                    style={styles.listItemRow}
                    onPress={() => {
                      if (isSelected) setSelectedLabelIds(selectedLabelIds.filter((id) => id !== item.id));
                      else setSelectedLabelIds([...selectedLabelIds, item.id]);
                    }}
                  >
                    <Text style={styles.listItemText}>{item.name}</Text>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('beacons:form.emptyGroups')}</Text>}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={friendModalOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFriendModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: insets.top + 60 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeadline}>{t('beacons:form.selectFriends')}</Text>
              <Pressable hitSlop={15} onPress={() => setFriendModalOpen(false)}>
                <Text style={styles.modalCloseText}>{t('beacons:common.done')}</Text>
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder={t('beacons:form.friendSearch')}
                placeholderTextColor={C.textMuted}
                value={friendQ}
                onChangeText={setFriendQ}
                onFocus={handleInputFocus}
              />
            </View>

            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              renderItem={({ item }) => {
                const isSelected = selectedFriendIds.includes(item.id);
                return (
                  <Pressable
                    style={styles.listItemRow}
                    onPress={() => {
                      if (isSelected) setSelectedFriendIds(selectedFriendIds.filter((id) => id !== item.id));
                      else setSelectedFriendIds([...selectedFriendIds, item.id]);
                    }}
                  >
                    <View style={styles.avatarWrap}>
                      <View style={styles.avatarStub}>
                        <Text style={styles.avatarStubText}>{item.nickname.slice(0,1)}</Text>
                      </View>
                      <Text style={styles.listItemText}>{item.nickname}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('beacons:form.emptyFriends')}</Text>}
            />
          </View>
        </View>
      </Modal>
    </SafeScreen>
  );
}

