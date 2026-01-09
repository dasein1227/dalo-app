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
  Platform,
  ScrollView,
} from 'react-native';
import { ChevronRight, X, Search } from 'lucide-react-native';

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

const VIS_LABEL: Record<VisibilityOrAny, string> = {
  any: '전체',
  public: '전체공개',
  public_filtered: '공개(필터)',
  friends: '친구만',
  labels: '라벨',
  custom: '맞춤',
};

const GENDER_LABEL: Record<'any' | 'male' | 'female' | 'other', string> = {
  any: '전체',
  male: '남성',
  female: '여성',
  other: '기타',
};

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/* =========================
 * Design tokens (CO·ONN)
 * - point: Black + Toned Red
 * ========================= */

const TOK = {
  bg: '#F8F9FA',
  card: '#FFFFFF',
  primary: '#111827', // black-ish
  accent: '#B91C1C', // toned-down red
  text: '#111827',
  sub: '#6B7280',
  line: '#E5E7EB',
  line2: '#EEF0F3',
  soft: '#F3F4F6',
};

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

  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowGenderSheet(false);
      setShowVisibilitySheet(false);
    }
  }, [visible]);

  const closeAll = () => {
    setShowGenderSheet(false);
    setShowVisibilitySheet(false);
    onClose();
  };

  // Quick presets (Distance)
  const distancePresets = useMemo(
    () => [
      { label: '5분', value: 400 },
      { label: '10분', value: 800 },
      { label: '20분', value: 1500 },
      { label: '가까이', value: 250 },
    ],
    [],
  );

  // Quick presets (Age)
  const agePresets = useMemo(
    () => [
      { label: '전체', value: [0, 80] as [number, number] },
      { label: '20대', value: [20, 29] as [number, number] },
      { label: '30대', value: [30, 39] as [number, number] },
      { label: '40대', value: [40, 49] as [number, number] },
      { label: '50+', value: [50, 80] as [number, number] },
    ],
    [],
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

        <View style={styles.panel}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* 1) Entrance: title + close + search */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.sectionTitle}>무엇을 할까요?</Text>
                <Pressable onPress={closeAll} style={styles.closeBtn} hitSlop={10}>
                  <X size={18} color={TOK.sub} />
                </Pressable>
              </View>

              <View style={styles.searchField}>
                <Search size={18} color={TOK.sub} />
                <TextInput
                  value={queryText}
                  onChangeText={setQueryText}
                  placeholder="원하는 만남을 찾아보세요"
                  placeholderTextColor="#9CA3AF"
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

              <View style={styles.chipRow}>
                <Chip
                  label="#친구만"
                  active={visibility === 'friends'}
                  onPress={() =>
                    setVisibility(visibility === 'friends' ? 'any' : 'friends')
                  }
                />
                <Chip
                  label="#전체공개"
                  active={visibility === 'public'}
                  onPress={() =>
                    setVisibility(visibility === 'public' ? 'any' : 'public')
                  }
                />
                <Chip
                  label="#10분거리"
                  active={radiusMeters === 800}
                  onPress={() => setRadiusMeters(800)}
                />
                <Chip
                  label="#20대"
                  active={isAgePresetActive([20, 29])}
                  onPress={() => setAgeRange([20, 29])}
                />
              </View>
            </View>

            {/* 2) Effort: Distance */}
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>얼마나 가까운가요?</Text>
                <Text style={styles.sectionValue}>{displayMeters(radiusMeters)}</Text>
              </View>

              <View style={styles.presetRow}>
                {distancePresets.map((p) => (
                  <Pill
                    key={p.label}
                    label={p.label}
                    active={isDistancePresetActive(p.value)}
                    onPress={() => setRadiusMeters(p.value)}
                  />
                ))}
              </View>

              <SingleSlider
                min={50}
                max={3000}
                step={100}
                value={radiusMeters}
                onChange={setRadiusMeters}
                trackHeight={6}
                thumbSize={22}
                activeScale={1.16}
              />

              <Text style={styles.helper}>
                숫자보다 “체감 이동”이 더 빠르게 결정됩니다. 프리셋을 먼저 써보세요.
              </Text>
            </View>

            {/* 3) Social: Gender / Visibility */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>누구와 만나고 싶나요?</Text>

              <Pressable style={styles.row} onPress={() => setShowGenderSheet(true)}>
                <View>
                  <Text style={styles.rowTitle}>보고 싶은 성별</Text>
                  <Text style={styles.rowValue}>{GENDER_LABEL[gender]}</Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>

              <View style={styles.rowDivider} />

              <Pressable
                style={styles.row}
                onPress={() => setShowVisibilitySheet(true)}
              >
                <View>
                  <Text style={styles.rowTitle}>노출 범위</Text>
                  <Text style={styles.rowValue}>{VIS_LABEL[visibility]}</Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* 4) Social: Age */}
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>어느 연령대가 편한가요?</Text>
                <Text style={styles.sectionValue}>{ageLabel}</Text>
              </View>

              <View style={styles.presetRow}>
                {agePresets.map((p) => (
                  <Pill
                    key={p.label}
                    label={p.label}
                    active={isAgePresetActive(p.value)}
                    onPress={() => setAgeRange(p.value)}
                  />
                ))}
              </View>

              <RangeSlider
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

          {/* Sticky Actions */}
          <View style={styles.actionsBar}>
            <Pressable style={styles.resetBtn} onPress={onReset}>
              <Text style={styles.resetTxt}>초기화</Text>
            </Pressable>

            <Pressable
              style={styles.applyBtn}
              onPress={() => {
                onApply();
                onClose();
              }}
            >
              <Text style={styles.applyTxt}>적용</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Gender sheet */}
      <Modal
        visible={visible && showGenderSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGenderSheet(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowGenderSheet(false)}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>성별</Text>
          {(['any', 'male', 'female', 'other'] as const).map((g) => (
            <Pressable
              key={g}
              style={[styles.sheetRow, gender === g && styles.sheetRowActive]}
              onPress={() => {
                setGender(g);
                setShowGenderSheet(false);
              }}
            >
              <Text
                style={[
                  styles.sheetRowTxt,
                  gender === g && styles.sheetRowTxtActive,
                ]}
              >
                {GENDER_LABEL[g]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Visibility sheet */}
      <Modal
        visible={visible && showVisibilitySheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVisibilitySheet(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowVisibilitySheet(false)}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>노출 범위</Text>
          {(
            [
              'any',
              'public',
              'public_filtered',
              'friends',
              'labels',
              'custom',
            ] as const
          ).map((v) => (
            <Pressable
              key={v}
              style={[styles.sheetRow, visibility === v && styles.sheetRowActive]}
              onPress={() => {
                setVisibility(v);
                setShowVisibilitySheet(false);
              }}
            >
              <Text
                style={[
                  styles.sheetRowTxt,
                  visibility === v && styles.sheetRowTxtActive,
                ]}
              >
                {VIS_LABEL[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

/* =======================
 * UI atoms
 * ======================= */

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text
        style={[
          styles.chipTxt,
          active ? styles.chipTxtActive : styles.chipTxtIdle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
    >
      <Text
        style={[
          styles.pillTxt,
          active ? styles.pillTxtActive : styles.pillTxtIdle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* =======================
 * Custom sliders (Single/Range)
 * - 기존 안정 구현 유지 (스타일만 상용화)
 * ======================= */

type SingleSliderProps = {
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

/* =========================
 * Styles
 * ========================= */

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(17,24,39,0.35)',
  },

  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 58,
    bottom: 18,
    backgroundColor: TOK.bg,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 110, // actionsBar가 덮지 않게 충분히 확보
  },

  card: {
    backgroundColor: TOK.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: TOK.line2,
    marginBottom: 10,
  },

  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TOK.primary,
    letterSpacing: -0.2,
  },
  sectionValue: {
    fontSize: 13,
    fontWeight: '700',
    color: TOK.text,
  },

  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOK.soft,
  },

  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOK.line,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: TOK.text,
    paddingVertical: 0,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: '#FFFFFF',
    borderColor: TOK.line,
  },
  chipActive: {
    backgroundColor: 'rgba(185,28,28,0.10)',
    borderColor: 'rgba(185,28,28,0.28)',
  },
  chipTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipTxtIdle: { color: TOK.text },
  chipTxtActive: { color: TOK.accent },

  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillIdle: {
    backgroundColor: '#FFFFFF',
    borderColor: TOK.line,
  },
  pillActive: {
    backgroundColor: TOK.accent,
    borderColor: TOK.accent,
  },
  pillTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  pillTxtIdle: { color: TOK.text },
  pillTxtActive: { color: '#FFFFFF' },

  helper: {
    marginTop: 10,
    fontSize: 12,
    color: TOK.sub,
    fontWeight: '600',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowTitle: {
    fontSize: 13,
    color: TOK.sub,
    fontWeight: '600',
  },
  rowValue: {
    marginTop: 4,
    fontSize: 15,
    color: TOK.text,
    fontWeight: '700',
  },
  rowDivider: {
    height: 1,
    backgroundColor: TOK.line2,
  },

  actionsBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: TOK.line2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  resetBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TOK.line,
    backgroundColor: '#FFFFFF',
  },
  resetTxt: {
    fontWeight: '700',
    color: TOK.text,
  },
  applyBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOK.primary,
  },
  applyTxt: {
    fontWeight: '700',
    color: '#FFFFFF',
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    borderTopWidth: 1,
    borderColor: TOK.line2,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOK.primary,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginVertical: 5,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: TOK.line2,
  },
  sheetRowActive: {
    backgroundColor: TOK.primary,
    borderColor: TOK.primary,
  },
  sheetRowTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: TOK.text,
  },
  sheetRowTxtActive: {
    color: '#FFFFFF',
  },

  rangeWrap: {
    justifyContent: 'center',
    overflow: 'visible',
  },
  rangeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  rangeSelected: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: TOK.accent,
  },
  rangeThumb: {
    position: 'absolute',
    backgroundColor: TOK.accent,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 3,
  },
});
