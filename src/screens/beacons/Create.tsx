// src/screens/beacons/Create.tsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
  BackHandler,
  StatusBar,
  Switch,
  Keyboard,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeScreen from '../../components/layout/SafeScreen';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import Slider from '@react-native-community/slider';
import { ArrowUp } from 'lucide-react-native';
import CoonnAlert, { type CoonnAlertVariant } from '../../components/CoonnAlert';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import {
  createCreateBeaconStyles,
  createCreateBeaconTheme,
  type CreateBeaconStyles,
  type CreateBeaconTheme,
} from './Create.theme';

type Visibility = 'public' | 'friends' | 'labels' | 'custom';
type VisibleGender = 'any' | 'male' | 'female';

type LabelRow = { id: number; name: string };
type FriendRow = { id: string; nickname: string; avatar_url?: string | null };
type BeaconCreateResult = { beacon_id: number | string; room_id: number | string };
type LocationState = {
  lat: number;
  lng: number;
  fetchedAt: number;
};

type CreateAlertState = {
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
};

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

type CreateBeaconThemeContextValue = {
  ui: CreateBeaconTheme;
  styles: CreateBeaconStyles;
};

const CreateBeaconThemeContext = React.createContext<CreateBeaconThemeContextValue | null>(null);

function useCreateBeaconThemeContext() {
  const context = useContext(CreateBeaconThemeContext);
  if (!context) {
    throw new Error('CreateBeaconThemeContext is missing.');
  }
  return context;
}

// 직접 타이핑 기능이 포함된 프리미엄 스텝퍼
function DirectStepper({
  value,
  min,
  max,
  onChange,
  suffix = '',
  onFocus,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  onFocus?: () => void;
}) {
  const { styles } = useCreateBeaconThemeContext();
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
  const { ui, styles } = useCreateBeaconThemeContext();
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
              placeholderTextColor={ui.placeholder}
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
          minimumTrackTintColor={ui.sliderMinimumTrackTintColor}
          maximumTrackTintColor={ui.sliderMaximumTrackTintColor}
          thumbTintColor={ui.sliderThumbTintColor}
        />
      </View>
    </View>
  );
}

function HotkeyChip({
  label,
  active,
  onPress,
  chipStyle,
  textStyle,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  chipStyle?: any;
  textStyle?: any;
}) {
  const { styles } = useCreateBeaconThemeContext();

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

export default function CreateBeacon({ navigation }: any) {
  const rootNav = getRootNavigation(navigation);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const appTheme = useAppTheme();
  const ui = useMemo(() => createCreateBeaconTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createCreateBeaconStyles(ui), [ui]);
  const alertTheme = ui.isDark ? 'coonn_dark' : 'coonn_light';

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

  const [coonnAlert, setCoonnAlert] = useState<CreateAlertState | null>(null);

  const showCoonnAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    Keyboard.dismiss();
    setCoonnAlert({ title, message, variant });
  }, []);

  const closeCoonnAlert = useCallback(() => {
    setCoonnAlert(null);
  }, []);

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

  const [loading, setLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [baseLocation, setBaseLocation] = useState<LocationState | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const [showScrollTopFab, setShowScrollTopFab] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const setFabVisible = useCallback((visible: boolean) => {
    setShowScrollTopFab((prev) => {
      if (prev === visible) return prev;
      Animated.timing(fabOpacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return visible;
    });
  }, [fabOpacity]);


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
      showCoonnAlert(t('beacons:form.locationPickFailTitle'), e?.message ?? t('beacons:error.locationUnavailable'));
    }
  }, [baseLocation, rootNav, showCoonnAlert]);

  const loadLabels = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('user_labels').select('id,name').order('name', { ascending: true });
      if (error) throw error;
      setLabels((data ?? []) as LabelRow[]);
    } catch (e: any) {
      showCoonnAlert(t('beacons:create.alert.labelLoadFailTitle'), e?.message ?? t('beacons:create.alert.labelLoadFail'));
    }
  }, [showCoonnAlert]);

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
      showCoonnAlert(t('beacons:create.alert.friendLoadFailTitle'), e?.message ?? t('beacons:create.alert.friendLoadFail'));
    }
  }, [showCoonnAlert]);

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

        const age = getAgeFromBirthdate(birthdate);
        if (!Number.isFinite(age)) return;

        const nextMin = clamp(age - 10, 14, 100);
        const nextMax = clamp(age + 10, 14, 100);

        if (!cancelled) {
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

  const selectorOpen = labelModalOpen || friendModalOpen;

  const closeOpenSelector = useCallback(() => {
    if (friendModalOpen) {
      Keyboard.dismiss();
      setFriendModalOpen(false);
      return true;
    }

    if (labelModalOpen) {
      setLabelModalOpen(false);
      return true;
    }

    return false;
  }, [friendModalOpen, labelModalOpen]);

  useEffect(() => {
    if (!selectorOpen) return;

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeOpenSelector();
      return true;
    });

    const removeSub = navigation.addListener?.('beforeRemove', (event: any) => {
      if (!closeOpenSelector()) return;
      event.preventDefault();
    });

    return () => {
      backSub.remove();
      removeSub?.();
    };
  }, [closeOpenSelector, navigation, selectorOpen]);

  const totalQuota = maleQuota + femaleQuota + mixQuota;

  const validate = useCallback(() => {
    if (!title.trim()) throw new Error(t('beacons:create.validation.titleRequired'));
    if (title.trim().length > 80) throw new Error(t('beacons:create.validation.titleMax'));
    if (!Number.isFinite(durationMin) || durationMin < 10 || durationMin > 240) throw new Error(t('beacons:create.validation.duration'));
    if (!ageLimitDisabled && ageMin > ageMax) throw new Error(t('beacons:create.validation.ageRange'));
    if (!locationReady || !baseLocation) throw new Error(t('beacons:create.validation.locationRequired'));
    if (visibility === 'labels' && selectedLabelIds.length === 0) throw new Error(t('beacons:create.validation.labelsRequired'));
    if (visibility === 'custom' && selectedLabelIds.length === 0 && selectedFriendIds.length === 0) throw new Error(t('beacons:create.validation.customRequired'));
  }, [ageLimitDisabled, ageMax, ageMin, baseLocation, durationMin, locationReady, selectedFriendIds.length, selectedLabelIds.length, title, visibility]);

  const createBeacon = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      validate();

      const titleValue = title.trim();
      const expiresAt = new Date(Date.now() + durationMin * 60_000).toISOString();
      const baseLat = baseLocation!.lat;
      const baseLng = baseLocation!.lng;
      
      let displayLat = baseLat;
      let displayLng = baseLng;

      if (jitterMeters > 0) {
        displayLat = baseLat + randInRange(metersToDeltaLat(jitterMeters));
        displayLng = baseLng + randInRange(metersToDeltaLng(jitterMeters, baseLat));
      }

      const maxMembers = totalQuota > 0 ? totalQuota : null;

      const { data, error } = await supabase.rpc('create_beacon_v2', {
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

      const row: BeaconCreateResult | undefined = Array.isArray(data) ? data[0] : data;
      const beaconId = toNum(row?.beacon_id, t('beacons:error.invalidId'));
      const roomId = toNum(row?.room_id, t('beacons:error.invalidId'));

      if (mountedRef.current) setLoading(false);

      try {
        rootNav.replace?.('Chat', { roomId, isBeacon: true, fromBeacon: true, roomType: 'beacon', beaconId, beaconTitle: titleValue, customTitle: titleValue });
      } catch {
        rootNav.navigate?.('Chat', { roomId, isBeacon: true, fromBeacon: true, roomType: 'beacon', beaconId, beaconTitle: titleValue, customTitle: titleValue });
      }
    } catch (e: any) {
      if (mountedRef.current) setLoading(false);
      showCoonnAlert(t('beacons:create.alert.createFailTitle'), e?.message ?? t('beacons:create.alert.createFail'), 'danger');
    }
  }, [ageLimitDisabled, ageMax, ageMin, baseLocation, description, durationMin, femaleQuota, jitterMeters, loading, maleQuota, mixQuota, publicExcludeFriends, requireApproval, rootNav, selectedFriendIds, selectedLabelIds, showCoonnAlert, title, totalQuota, validate, visibility, visibleGender]);

  return (
    <CreateBeaconThemeContext.Provider value={{ ui, styles }}>
      <SafeScreen
        backgroundColor={ui.statusBarBackground}
        includeTopInset
        includeBottomInset={false}
        contentStyle={styles.rootWrap}
      >
      <StatusBar backgroundColor={ui.statusBarBackground} barStyle={ui.statusBarStyle} translucent={false} />
      
      <View style={styles.header}>
        <Pressable hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBackIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('beacons:create_title')}</Text>
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
            { paddingBottom: (insets.bottom || 24) + 72 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            const nextY = e.nativeEvent.contentOffset.y;
            scrollYRef.current = nextY;
            setFabVisible(nextY > 300);
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
              placeholderTextColor={ui.placeholder}
              value={title}
              onChangeText={setTitle}
              onFocus={handleInputFocus}
              maxLength={80}
            />
            <TextInput
              style={styles.borderlessTextArea}
              placeholder={t('beacons:form.descPlaceholder')}
              placeholderTextColor={ui.placeholder}
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
            
            <DiscreteSlider 
              steps={DURATION_STEPS} 
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
                <HotkeyChip
                  key={min}
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
            
            <DiscreteSlider 
              steps={JITTER_STEPS} 
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
                <HotkeyChip
                  key={opt}
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
                <HotkeyChip
                  key={v}
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
                <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }} thumbColor={ui.switchThumb} />
              </View>

              {visibility === 'public' && (
                <View style={[styles.settingRow, styles.noBorderBottom]}>
                  <View style={styles.settingRowTextWrap}>
                    <Text style={styles.settingLabel}>{t('beacons:form.hideFromFriendsTitle')}</Text>
                    <Text style={styles.settingSub}>{t('beacons:form.hideFromFriendsDesc')}</Text>
                  </View>
                  <Switch value={publicExcludeFriends} onValueChange={setPublicExcludeFriends} trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }} thumbColor={ui.switchThumb} />
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
                placeholderTextColor={ui.placeholder}
                value={friendPlaceText}
                onChangeText={setFriendPlaceText}
                onFocus={handleInputFocus}
                maxLength={80}
              />

              <TextInput
                style={styles.borderlessTextArea}
                placeholder={t('beacons:form.locationDetailPlaceholder')}
                placeholderTextColor={ui.placeholder}
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
                  <HotkeyChip
                    key={g}
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
                <DirectStepper value={maleQuota} min={0} max={100} onChange={setMaleQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
              </View>
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>{t('beacons:form.femaleQuota')}</Text>
                <DirectStepper value={femaleQuota} min={0} max={100} onChange={setFemaleQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
              </View>
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>{t('beacons:form.mixQuota')}</Text>
                <DirectStepper value={mixQuota} min={0} max={100} onChange={setMixQuota} suffix={t('beacons:unit.people')} onFocus={handleInputFocus} />
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
                    trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }}
                    thumbColor={ui.switchThumb}
                    ios_backgroundColor={ui.switchTrackOff}
                  />
                </View>
              </View>

              {!ageLimitDisabled && (
                <>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('beacons:form.ageMin')}</Text>
                    <DirectStepper value={ageMin} min={14} max={100} onChange={setAgeMin} suffix={t('beacons:unit.age')} onFocus={handleInputFocus} />
                  </View>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('beacons:form.ageMax')}</Text>
                    <DirectStepper value={ageMax} min={14} max={100} onChange={setAgeMax} suffix={t('beacons:unit.age')} onFocus={handleInputFocus} />
                  </View>
                </>
              )}
            </View>

          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View
        pointerEvents={showScrollTopFab ? 'auto' : 'none'}
        style={[
          styles.scrollTopFabContainer,
          {
            right: 24,
            bottom: (insets.bottom || 8) + 108,
            opacity: fabOpacity,
          },
        ]}
      >
        <Pressable style={styles.scrollTopFabButton} onPress={scrollToTop}>
          <ArrowUp size={24} color={ui.floatingIcon} />
        </Pressable>
      </Animated.View>

      <View
        style={[
          styles.floatingActionArea,
          { paddingBottom: (insets.bottom || 8) + 12 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.megaActionBtn, loading && styles.disabledOpacity, pressed && !loading && styles.pressedScale]}
          disabled={loading}
          onPress={() => void createBeacon()}
        >
          {loading ? <ActivityIndicator color={ui.textOnPrimary} /> : <Text style={styles.megaActionBtnText}>{t('beacons:form.createButton')}</Text>}
        </Pressable>
      </View>

      {labelModalOpen ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, right: 0, bottom: -insets.bottom, left: 0, zIndex: 60 }}
        >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: insets.top + 60, marginBottom: 40 + insets.bottom }]}>
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
        </View>
      ) : null}

      {friendModalOpen ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, right: 0, bottom: -insets.bottom, left: 0, zIndex: 60 }}
        >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginTop: insets.top + 60, marginBottom: 40 + insets.bottom }]}>
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
                placeholderTextColor={ui.placeholder}
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
        </View>
      ) : null}

      <CoonnAlert
        visible={!!coonnAlert}
        theme={alertTheme}
        variant={coonnAlert?.variant ?? 'default'}
        title={coonnAlert?.title ?? ''}
        message={coonnAlert?.message}
        confirmText={t('beacons:common.confirm')}
        onConfirm={closeCoonnAlert}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
      />
      </SafeScreen>
    </CreateBeaconThemeContext.Provider>
  );
}
