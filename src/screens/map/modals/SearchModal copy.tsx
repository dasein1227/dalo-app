// src/screens/map/modals/SearchModal.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';

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

/* =========================
 * Component
 * ========================= */

export default function SearchModal(props: SearchModalProps) {
  const {
    visible,
    onClose,
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

  // 내부 시트 (성별/노출)
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);

  // 모달이 닫히면 내부 시트도 같이 닫기 (상용 안정성)
  useEffect(() => {
    if (!visible) {
      setShowGenderSheet(false);
      setShowVisibilitySheet(false);
    }
  }, [visible]);

  // iOS: backdrop 탭/패널 탭 처리 충돌 방지
  // - backdrop은 전체 화면 absolute
  // - panel은 그 위에 위치
  const closeAll = () => {
    setShowGenderSheet(false);
    setShowVisibilitySheet(false);
    onClose();
  };

  return (
    <>
      {/* 메인 검색(필터) 모달 */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeAll}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeAll} />

        <View style={styles.filterPanel}>
          {/* 거리 */}
          <View style={styles.cardBlock}>
            <View style={styles.cardBlockHead}>
              <Text style={styles.cardBlockTitle}>상대와의 최대 거리</Text>
              <Text style={styles.cardBlockValue}>
                {displayMeters(radiusMeters)}
              </Text>
            </View>

            <SingleSlider
              min={50}
              max={3000}
              step={100}
              value={radiusMeters}
              onChange={setRadiusMeters}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.25}
            />

            <Text style={styles.helperTxt}>
              프로필 밀도가 낮을 때는 거리 범위를 자동으로 조정할 수 있어요.
            </Text>
          </View>

          {/* 성별 */}
          <Pressable style={styles.cardRow} onPress={() => setShowGenderSheet(true)}>
            <View>
              <Text style={styles.cardBlockTitle}>보고 싶은 성별</Text>
              <Text style={styles.rowSubValue}>{GENDER_LABEL[gender]}</Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Pressable>

          {/* 노출 범위 */}
          <Pressable
            style={styles.cardRow}
            onPress={() => setShowVisibilitySheet(true)}
          >
            <View>
              <Text style={styles.cardBlockTitle}>노출 범위</Text>
              <Text style={styles.rowSubValue}>{VIS_LABEL[visibility]}</Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Pressable>

          {/* 연령대 */}
          <View style={styles.cardBlock}>
            <View style={styles.cardBlockHead}>
              <Text style={styles.cardBlockTitle}>상대의 연령대</Text>
              <Text style={styles.cardBlockValue}>
                {ageRange[0]} - {ageRange[1] >= 80 ? '80+' : ageRange[1]}
              </Text>
            </View>

            <RangeSlider
              min={0}
              max={80}
              step={1}
              value={ageRange}
              onChange={setAgeRange}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.25}
            />
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.modalBtnSecondary}
              onPress={() => {
                // 외부 기준으로 리셋하되, 모달은 계속 열어두는 것이 일반 UX
                onReset();
              }}
            >
              <Text style={styles.modalBtnSecondaryTxt}>초기화</Text>
            </Pressable>

            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                // 적용 후 닫기: 상용앱 기본 기대치
                onApply();
                onClose();
              }}
            >
              <Text style={styles.modalBtnTxt}>적용</Text>
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
          style={styles.modalBackdrop}
          onPress={() => setShowGenderSheet(false)}
        />
        <View style={styles.bottomSheet}>
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
          style={styles.modalBackdrop}
          onPress={() => setShowVisibilitySheet(false)}
        />
        <View style={styles.bottomSheet}>
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
              style={[
                styles.sheetRow,
                visibility === v && styles.sheetRowActive,
              ]}
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
 * Custom sliders (Single/Range)
 * - MapMain에 있던 구현을 그대로 이식 (상용 안정성 우선)
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
  activeScale = 1.25,
  disabled = false,
}) => {
  const widthRef = useRef(0);
  const [widthReady, setWidthReady] = useState(false);

  const valueRef = useRef(value);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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
    <View style={{ paddingTop: 8 }}>
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
  activeScale = 1.25,
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

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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
          active.current = Math.abs(x - leftX) <= Math.abs(x - rightX) ? 'a' : 'b';
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
    <View style={{ paddingTop: 8 }}>
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
 * Styles (MapMain의 필터 모달 스타일과 동일 계열)
 * ========================= */

const styles = StyleSheet.create({
  modalBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  filterPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 64,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
  },

  cardBlock: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  cardBlockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBlockTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  cardBlockValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  helperTxt: {
    color: '#9ca3af',
    marginTop: 8,
    fontSize: 13,
  },

  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  rowSubValue: {
    marginTop: 6,
    color: '#111827',
    fontWeight: '700',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalBtn: {
    marginLeft: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnTxt: {
    color: '#fff',
    fontWeight: '800',
  },
  modalBtnSecondary: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnSecondaryTxt: {
    color: '#111827',
    fontWeight: '800',
  },

  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginVertical: 4,
    backgroundColor: '#f9fafb',
  },
  sheetRowActive: {
    backgroundColor: '#111827',
  },
  sheetRowTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  sheetRowTxtActive: {
    color: '#fff',
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
    backgroundColor: '#EF4444',
  },
  rangeThumb: {
    position: 'absolute',
    backgroundColor: '#EF4444',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});
