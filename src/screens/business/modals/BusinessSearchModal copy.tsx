// src/screens/business/modals/BusinessSearchModal.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Switch,
} from 'react-native';

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

export type BusinessSearchModalProps = {
  visible: boolean;
  onClose: () => void;

  radiusMeters: number;
  setRadiusMeters: (v: number) => void;

  onlyWithEvent: boolean;
  setOnlyWithEvent: (v: boolean) => void;

  hideAdult: boolean;
  setHideAdult: (v: boolean) => void;

  onReset: () => void;
  onApply: () => void;

  // Feed.tsx에서 top inset 반영(기존 로직 유지)
  topOffset?: number;
};

export default function BusinessSearchModal(props: BusinessSearchModalProps) {
  const {
    visible,
    onClose,
    radiusMeters,
    setRadiusMeters,
    onlyWithEvent,
    setOnlyWithEvent,
    hideAdult,
    setHideAdult,
    onReset,
    onApply,
    topOffset = 64,
  } = props;

  // 상용 안정성: backdrop 탭 시, 먼저 닫기
  const close = () => onClose();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.modalBackdrop} onPress={close} />

      <View style={[styles.filterPanel, { top: topOffset }]}>
        {/* 거리 */}
        <View style={styles.cardBlock}>
          <View style={styles.cardBlockHead}>
            <Text style={styles.cardBlockTitle}>검색 반경</Text>
            <Text style={styles.cardBlockValue}>{displayMeters(radiusMeters)}</Text>
          </View>

          <SingleSlider
            min={200}
            max={3000}
            step={100}
            value={radiusMeters}
            onChange={setRadiusMeters}
            trackHeight={6}
            thumbSize={22}
            activeScale={1.25}
          />

          <Text style={styles.helperTxt}>
            반경이 넓을수록 더 많은 가게가 표시됩니다.
          </Text>
        </View>

        {/* 이벤트 필터 */}
        <View style={styles.cardRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardBlockTitle}>이벤트 진행중만 보기</Text>
            <Text style={styles.rowSubValue}>
              {onlyWithEvent ? '진행중인 이벤트만 표시' : '모든 가게 표시'}
            </Text>
          </View>
          <Switch value={onlyWithEvent} onValueChange={setOnlyWithEvent} />
        </View>

        {/* 성인 업소 필터 */}
        <View style={styles.cardRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardBlockTitle}>성인 업소 숨기기</Text>
            <Text style={styles.rowSubValue}>
              {hideAdult ? '술집/유흥업소 숨김' : '모든 카테고리 표시'}
            </Text>
          </View>
          <Switch value={hideAdult} onValueChange={setHideAdult} />
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.modalBtnSecondary}
            onPress={() => {
              onReset();
            }}
          >
            <Text style={styles.modalBtnSecondaryTxt}>초기화</Text>
          </Pressable>

          <Pressable
            style={styles.modalBtn}
            onPress={() => {
              // 적용 → 닫기 (상용 UX 표준)
              onApply();
              onClose();
            }}
          >
            <Text style={styles.modalBtnTxt}>적용</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* =======================
 * Single Slider (Feed.tsx에서 그대로 이식)
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

  const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, n));

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

/* =======================
 * Styles (Feed.tsx의 기존 모달/슬라이더 계열 유지)
 * ======================= */

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

  // slider visuals
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
    backgroundColor: '#111827',
  },
  rangeThumb: {
    position: 'absolute',
    backgroundColor: '#111827',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});
