// src/screens/map/modals/SearchModal.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  PanResponder,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, X, Search } from 'lucide-react-native';
import { useAppTheme } from '@/theme/useAppTheme';
import {
  createSearchModalStyles,
  createSearchModalTheme,
  type SearchModalStyles,
} from './SearchModal.theme';
import { useTranslation } from 'react-i18next';

/* =========================
 * Types
 * ========================= */

type VisibilityT =
  | 'public'
  | 'public_filtered'
  | 'friends'
  | 'labels'
  | 'custom';

type VisibilityOrAny = VisibilityT | 'any';

export type SearchModalProps = {
  visible: boolean;
  onClose: () => void;

  // 검색어(비콘 AI 랭킹에 사용)
  queryText: string;
  setQueryText: (v: string) => void;

  // 값/세터 (상태는 MapMain이 소유)
  radiusMeters: number;
  setRadiusMeters: (v: number) => void;

  gender: 'any' | 'male' | 'female' | 'other';
  setGender: (v: 'any' | 'male' | 'female' | 'other') => void;

  visibility: VisibilityOrAny;
  setVisibility: (v: VisibilityOrAny) => void;

  ageRange: [number, number];
  setAgeRange: (v: [number, number]) => void;

  // 액션
  onApply: () => void;
  onReset: () => void;
};

/* =========================
 * Labels / helpers
 * ========================= */

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/* =========================
 * ========================= */

/* =========================
 * Component
 * ========================= */

export default function SearchModal(props: SearchModalProps) {
  const {
    visible,
    onClose,
    queryText,
    setQueryText,
    radiusMeters,
    setRadiusMeters,
    gender,
    setGender,
    visibility,
    setVisibility,
    ageRange,
    setAgeRange,
    onApply,
    onReset,
  } = props;

  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['beacons', 'common']);
  const appTheme = useAppTheme();
  const ui = useMemo(() => createSearchModalTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createSearchModalStyles(ui), [ui]);

  const visibilityLabel = useMemo<Record<VisibilityOrAny, string>>(
    () => ({
      any: t('beacons:search.visibility.any'),
      public: t('beacons:search.visibility.public'),
      public_filtered: t('beacons:search.visibility.publicFiltered'),
      friends: t('beacons:search.visibility.friends'),
      labels: t('beacons:search.visibility.labels'),
      custom: t('beacons:search.visibility.custom'),
    }),
    [t],
  );

  const genderLabel = useMemo<Record<'any' | 'male' | 'female' | 'other', string>>(
    () => ({
      any: t('beacons:search.gender.any'),
      male: t('beacons:search.gender.male'),
      female: t('beacons:search.gender.female'),
      other: t('beacons:search.gender.other'),
    }),
    [t],
  );

  const [expandedPicker, setExpandedPicker] = useState<'gender' | 'visibility' | null>(null);

  useEffect(() => {
    if (!visible) {
      setExpandedPicker(null);
    }
  }, [visible]);

  const closeAll = () => {
    setExpandedPicker(null);
    onClose();
  };

  const toggleExpandedPicker = (next: 'gender' | 'visibility') => {
    setExpandedPicker((prev) => (prev === next ? null : next));
  };

  // Quick presets (Distance)
  const distancePresets = useMemo(
    () => [
      { label: t('beacons:search.distancePreset.fiveMin'), value: 400 },
      { label: t('beacons:search.distancePreset.tenMin'), value: 800 },
      { label: t('beacons:search.distancePreset.twentyMin'), value: 1500 },
      { label: t('beacons:search.distancePreset.near'), value: 250 },
    ],
    [t],
  );

  // Quick presets (Age)
  const agePresets = useMemo(
    () => [
      { label: t('beacons:search.agePreset.all'), value: [0, 80] as [number, number] },
      { label: t('beacons:search.agePreset.twenties'), value: [20, 29] as [number, number] },
      { label: t('beacons:search.agePreset.thirties'), value: [30, 39] as [number, number] },
      { label: t('beacons:search.agePreset.forties'), value: [40, 49] as [number, number] },
      { label: t('beacons:search.agePreset.fiftyPlus'), value: [50, 80] as [number, number] },
    ],
    [t],
  );

  const ageLabel = `${ageRange[0]} - ${ageRange[1] >= 80 ? '80+' : ageRange[1]}`;

  const isAgePresetActive = (preset: [number, number]) =>
    ageRange[0] === preset[0] && ageRange[1] === preset[1];

  const isDistancePresetActive = (v: number) => radiusMeters === v;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeAll}
      >
        <Pressable style={styles.backdrop} onPress={closeAll} />

        <View style={[styles.panel, { bottom: insets.bottom }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* 1) Entrance: title + close + search */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.sectionTitle}>{t('beacons:search.title')}</Text>
                <Pressable onPress={closeAll} style={styles.closeBtn} hitSlop={10}>
                  <X size={18} color={ui.iconMuted} />
                </Pressable>
              </View>

              <View style={styles.searchField}>
                <Search size={18} color={ui.iconMuted} />
                <TextInput
                  value={queryText}
                  onChangeText={setQueryText}
                  placeholder={t('beacons:search.placeholder')}
                  placeholderTextColor={ui.placeholder}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    onApply();
                    onClose();
                  }}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* NOTE: 검색어 후보/설명 텍스트는 요청대로 제거 */}

              <SegmentedActionGrid
                styles={styles}
                style={styles.quickSegmentGrid}
                items={[
                  {
                    key: 'friends',
                    label: t('beacons:search.quick.friendsOnly'),
                    active: visibility === 'friends',
                    onPress: () =>
                      setVisibility(visibility === 'friends' ? 'any' : 'friends'),
                  },
                  {
                    key: 'near',
                    label: t('beacons:search.distancePreset.near'),
                    active: radiusMeters === 250,
                    onPress: () => setRadiusMeters(250),
                  },
                  {
                    key: 'public',
                    label: t('beacons:search.quick.public'),
                    active: visibility === 'public',
                    onPress: () =>
                      setVisibility(visibility === 'public' ? 'any' : 'public'),
                  },
                  {
                    key: 'tenMin',
                    label: t('beacons:search.quick.tenMin'),
                    active: radiusMeters === 800,
                    onPress: () => setRadiusMeters(800),
                  },
                ]}
              />
            </View>

            {/* 2) Effort: Distance */}
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t('beacons:search.distance')}</Text>
                <Text style={styles.sectionValue}>{displayMeters(radiusMeters)}</Text>
              </View>

              <SegmentedActionGrid
                styles={styles}
                style={styles.distanceSegmentGrid}
                items={distancePresets.map((p) => ({
                  key: p.label,
                  label: p.label,
                  active: isDistancePresetActive(p.value),
                  onPress: () => setRadiusMeters(p.value),
                }))}
              />

              <SingleSlider
                styles={styles}
                min={50}
                max={3000}
                step={100}
                value={radiusMeters}
                onChange={setRadiusMeters}
                trackHeight={6}
                thumbSize={22}
                activeScale={1.16}
              />


            </View>

            {/* 3) Social: Gender / Visibility */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('beacons:search.target')}</Text>

              <Pressable
                style={styles.row}
                onPress={() => toggleExpandedPicker('gender')}
              >
                <View>
                  <Text style={styles.rowTitle}>{t('beacons:search.gender.title')}</Text>
                  <Text style={styles.rowValue}>{genderLabel[gender]}</Text>
                </View>
                {expandedPicker === 'gender' ? (
                  <ChevronDown size={18} color={ui.iconMuted} />
                ) : (
                  <ChevronRight size={18} color={ui.iconMuted} />
                )}
              </Pressable>

              {expandedPicker === 'gender' ? (
                <SegmentedChoiceGrid
                  styles={styles}
                  options={(['any', 'male', 'female', 'other'] as const).map((g) => ({
                    value: g,
                    label: genderLabel[g],
                  }))}
                  value={gender}
                  onSelect={(next) => {
                    setGender(next);
                    setExpandedPicker(null);
                  }}
                />
              ) : null}

              <View style={styles.rowDivider} />

              <Pressable
                style={styles.row}
                onPress={() => toggleExpandedPicker('visibility')}
              >
                <View>
                  <Text style={styles.rowTitle}>{t('beacons:search.visibility.title')}</Text>
                  <Text style={styles.rowValue}>{visibilityLabel[visibility]}</Text>
                </View>
                {expandedPicker === 'visibility' ? (
                  <ChevronDown size={18} color={ui.iconMuted} />
                ) : (
                  <ChevronRight size={18} color={ui.iconMuted} />
                )}
              </Pressable>

              {expandedPicker === 'visibility' ? (
                <SegmentedChoiceGrid
                  styles={styles}
                  options={(
                    [
                      'any',
                      'public',
                      'public_filtered',
                      'friends',
                      'labels',
                      'custom',
                    ] as const
                  ).map((v) => ({
                    value: v,
                    label: visibilityLabel[v],
                  }))}
                  value={visibility}
                  onSelect={(next) => {
                    setVisibility(next);
                    setExpandedPicker(null);
                  }}
                />
              ) : null}
            </View>

            {/* 4) Social: Age */}
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t('beacons:search.age')}</Text>
                <Text style={styles.sectionValue}>{ageLabel}</Text>
              </View>

              <View style={styles.optionGroup}>
                {agePresets.map((p) => (
                  <OptionPill
                    key={p.label}
                    styles={styles}
                    label={p.label}
                    active={isAgePresetActive(p.value)}
                    onPress={() => setAgeRange(p.value)}
                  />
                ))}
              </View>

              <RangeSlider
                styles={styles}
                min={0}
                max={80}
                step={1}
                value={ageRange}
                onChange={(next) => {
                  const a = clamp(next[0], 0, 80);
                  const b = clamp(next[1], 0, 80);
                  setAgeRange([Math.min(a, b), Math.max(a, b)]);
                }}
                trackHeight={6}
                thumbSize={22}
                activeScale={1.16}
              />
            </View>

          </ScrollView>

          <View style={styles.actionsBar}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.resetBtn,
                pressed && styles.actionBtnPressed,
              ]}
              onPress={onReset}
            >
              <Text style={styles.resetTxt}>{t('beacons:search.action.reset')}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.applyBtn,
                pressed && styles.applyBtnPressed,
              ]}
              onPress={() => {
                onApply();
                onClose();
              }}
            >
              <Text style={styles.applyTxt}>{t('beacons:search.action.apply')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* =======================
 * UI atoms
 * ======================= */

function OptionPill({
  styles,
  label,
  active,
  onPress,
  style,
}: {
  styles: SearchModalStyles;
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionPill,
        active ? styles.optionPillActive : styles.optionPillIdle,
        style,
        pressed && !active && styles.optionPillPressed,
      ]}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.optionPillText,
          active ? styles.optionPillTextActive : styles.optionPillTextIdle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SegmentedActionGrid({
  styles,
  items,
  style,
}: {
  styles: SearchModalStyles;
  items: ReadonlyArray<{
    key: string;
    label: string;
    active: boolean;
    onPress: () => void;
  }>;
  style?: StyleProp<ViewStyle>;
}) {
  const rows: Array<Array<(typeof items)[number]>> = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  return (
    <View style={[styles.segmentGrid, style]}>
      {rows.map((row, rowIndex) => (
        <React.Fragment key={`action-row-${rowIndex}`}>
          {rowIndex > 0 ? <View style={styles.segmentRowDivider} /> : null}
          <View style={styles.segmentRow}>
            {row.map((item, cellIndex) => (
              <React.Fragment key={item.key}>
                {cellIndex > 0 ? <View style={styles.segmentColumnDivider} /> : null}
                <Pressable
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.segmentCell,
                    item.active && styles.segmentCellActive,
                    pressed && !item.active && styles.segmentCellPressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.segmentText,
                      item.active ? styles.segmentTextActive : styles.segmentTextIdle,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
            {row.length === 1 ? <View style={styles.segmentCell} /> : null}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function SegmentedChoiceGrid<T extends string>({
  styles,
  options,
  value,
  onSelect,
}: {
  styles: SearchModalStyles;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onSelect: (next: T) => void;
}) {
  const rows: Array<Array<{ value: T; label: string }>> = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(options.slice(i, i + 2));
  }

  return (
    <View style={styles.segmentGrid}>
      {rows.map((row, rowIndex) => (
        <React.Fragment key={`row-${rowIndex}`}>
          {rowIndex > 0 ? <View style={styles.segmentRowDivider} /> : null}
          <View style={styles.segmentRow}>
            {row.map((item, cellIndex) => {
              const active = value === item.value;
              return (
                <React.Fragment key={item.value}>
                  {cellIndex > 0 ? <View style={styles.segmentColumnDivider} /> : null}
                  <Pressable
                    onPress={() => onSelect(item.value)}
                    style={({ pressed }) => [
                      styles.segmentCell,
                      active && styles.segmentCellActive,
                      pressed && !active && styles.segmentCellPressed,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.segmentText,
                        active ? styles.segmentTextActive : styles.segmentTextIdle,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
            {row.length === 1 ? <View style={styles.segmentCell} /> : null}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

/* =======================
 * Custom sliders (Single/Range)
 * - 기존 안정 구현 유지 (스타일만 상용화)
 * ======================= */

type SingleSliderProps = {
  styles: SearchModalStyles;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};

type RangeSliderProps = {
  styles: SearchModalStyles;
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};

const SingleSlider: React.FC<SingleSliderProps> = ({
  styles,
  min,
  max,
  step = 1,
  value,
  onChange,
  trackHeight = 6,
  thumbSize = 22,
  activeScale = 1.16,
  disabled = false,
}) => {
  const widthRef = useRef(0);
  const [widthReady, setWidthReady] = useState(false);

  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const valToX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };

  const xToVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current +
      (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const thumbX = widthReady ? valToX(value) : 0;

  const scale = useRef(new Animated.Value(1)).current;
  const grow = () =>
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const shrink = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (e) => {
          grow();
          onChange(xToVal(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e) => {
          onChange(xToVal(e.nativeEvent.locationX));
        },
        onPanResponderRelease: () => shrink(),
        onPanResponderTerminate: () => shrink(),
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, disabled],
  );

  return (
    <View style={{ paddingTop: 10 }}>
      <View
        collapsable={false}
        style={[
          styles.rangeWrap,
          {
            height: Math.max(thumbSize, trackHeight),
            position: 'relative',
          },
        ]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          if (!widthReady) setWidthReady(true);
        }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View
          style={[
            styles.rangeSelected,
            {
              height: trackHeight,
              left: 0,
              width: Math.max(0, thumbX),
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: thumbX - thumbSize / 2,
              transform: [{ scale }],
            },
          ]}
        />
        <View
          {...(pan as any).panHandlers}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
        />
      </View>
    </View>
  );
};

const RangeSlider: React.FC<RangeSliderProps> = ({
  styles,
  min,
  max,
  step = 1,
  value,
  onChange,
  trackHeight = 6,
  thumbSize = 22,
  activeScale = 1.16,
  disabled = false,
}) => {
  const widthRef = useRef(0);
  const [widthReady, setWidthReady] = useState(false);

  const aRef = useRef(value[0]);
  const bRef = useRef(value[1]);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => {
    aRef.current = value[0];
    bRef.current = value[1];
  }, [value]);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const toX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };

  const toVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current +
      (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const leftX = widthReady ? toX(value[0]) : 0;
  const rightX = widthReady ? toX(value[1]) : 0;

  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;

  const grow = (which: 'a' | 'b') =>
    Animated.spring(which === 'a' ? scaleA : scaleB, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const shrink = (which: 'a' | 'b') =>
    Animated.spring(which === 'a' ? scaleA : scaleB, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const active = useRef<'a' | 'b' | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          active.current =
            Math.abs(x - leftX) <= Math.abs(x - rightX) ? 'a' : 'b';
          if (active.current) grow(active.current);

          const v = toVal(x);
          if (active.current === 'a') {
            onChange([Math.min(v, bRef.current), bRef.current]);
          } else {
            onChange([aRef.current, Math.max(v, aRef.current)]);
          }
        },
        onPanResponderMove: (e) => {
          if (!active.current) return;
          const v = toVal(e.nativeEvent.locationX);
          if (active.current === 'a') {
            onChange([Math.min(v, bRef.current), bRef.current]);
          } else {
            onChange([aRef.current, Math.max(v, aRef.current)]);
          }
        },
        onPanResponderRelease: () => {
          if (active.current) shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminate: () => {
          if (active.current) shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, leftX, rightX, disabled],
  );

  return (
    <View style={{ paddingTop: 10 }}>
      <View
        collapsable={false}
        style={[
          styles.rangeWrap,
          {
            height: Math.max(thumbSize, trackHeight),
            position: 'relative',
          },
        ]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          if (!widthReady) setWidthReady(true);
        }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View
          style={[
            styles.rangeSelected,
            {
              height: trackHeight,
              left: Math.min(leftX, rightX),
              width: Math.abs(rightX - leftX),
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: leftX - thumbSize / 2,
              transform: [{ scale: scaleA }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: rightX - thumbSize / 2,
              transform: [{ scale: scaleB }],
            },
          ]}
        />

        <View
          {...(pan as any).panHandlers}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
        />
      </View>
    </View>
  );
};
