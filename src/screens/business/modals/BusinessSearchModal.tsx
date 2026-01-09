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
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Search, X } from 'lucide-react-native';

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * 정렬: 추천/거리/이벤트
 * - recommended: 기본(추천)
 * - distance: 가까운 순
 * - event: 이벤트 우선
 */
export type BusinessSortKey = 'recommended' | 'distance' | 'event';

export type BusinessSearchModalProps = {
  visible: boolean;
  onClose: () => void;

  radiusMeters: number;
  setRadiusMeters: (v: number) => void;

  onlyWithEvent: boolean;
  setOnlyWithEvent: (v: boolean) => void;

  hideAdult: boolean;
  setHideAdult: (v: boolean) => void;

  // ✅ 검색어 (Feed.tsx에서 주입)
  queryText: string;
  setQueryText: (v: string) => void;

  // ✅ 추가: 정렬
  sortKey: BusinessSortKey;
  setSortKey: (v: BusinessSortKey) => void;

  // ✅ 추가: 지금 영업중 (businesses.is_open)
  openNow: boolean;
  setOpenNow: (v: boolean) => void;

  onReset: () => void;
  onApply: () => void;

  topOffset?: number;
};

const TOK = {
  bg: '#F8F9FA',
  card: '#FFFFFF',
  primary: '#111827', // black
  accent: '#B91C1C', // toned red
  text: '#111827',
  sub: '#6B7280',
  line: '#E5E7EB',
  line2: '#EEF0F3',
  soft: '#F3F4F6',
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
    queryText,
    setQueryText,
    sortKey,
    setSortKey,
    openNow,
    setOpenNow,
    onReset,
    onApply,
    topOffset = 64,
  } = props;

  const close = () => onClose();

  const applyAndClose = () => {
    onApply();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />

      <View style={[styles.panel, { top: topOffset }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* 검색어 */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.sectionTitle}>검색어</Text>
              <Pressable onPress={close} style={styles.closeBtn} hitSlop={10}>
                <X size={18} color={TOK.sub} />
              </Pressable>
            </View>

            <View style={styles.searchField}>
              <Search size={18} color={TOK.sub} />
              <TextInput
                value={queryText}
                onChangeText={setQueryText}
                placeholder="예: 조용한 카페, 와인, 데이트, 단체…"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={styles.searchInput}
                onSubmitEditing={applyAndClose}
              />

              {!!queryText.trim() && (
                <Pressable onPress={() => setQueryText('')} hitSlop={8} style={styles.clearInlineBtn}>
                  <Text style={styles.clearInlineTxt}>지우기</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.helper}>검색어는 추천/해석 결과에 반영됩니다.</Text>
          </View>

          {/* 거리 */}
          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>검색 반경</Text>
              <Text style={styles.sectionValue}>{displayMeters(radiusMeters)}</Text>
            </View>

            <SingleSlider
              min={200}
              max={3000}
              step={100}
              value={radiusMeters}
              onChange={setRadiusMeters}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.16}
            />

            <Text style={styles.helper}>반경이 넓을수록 더 많은 가게가 표시됩니다.</Text>
          </View>

          {/* 정렬 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>정렬</Text>
            <View style={styles.presetRow}>
              <Pill label="추천" active={sortKey === 'recommended'} onPress={() => setSortKey('recommended')} />
              <Pill label="거리" active={sortKey === 'distance'} onPress={() => setSortKey('distance')} />
              <Pill label="이벤트" active={sortKey === 'event'} onPress={() => setSortKey('event')} />
            </View>

            <Text style={styles.helper}>
              추천은 AI 점수 우선, 거리는 가까운 순, 이벤트는 진행중 우선입니다.
            </Text>
          </View>

          {/* 이벤트 진행중만 */}
          <View style={styles.cardRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowTitle}>이벤트 진행중만 보기</Text>
              <Text style={styles.rowSubValue}>
                {onlyWithEvent ? '진행중인 이벤트만 표시' : '모든 가게 표시'}
              </Text>
            </View>
            <Switch value={onlyWithEvent} onValueChange={setOnlyWithEvent} />
          </View>

          {/* 성인 업소 숨기기 */}
          <View style={styles.cardRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowTitle}>성인 업소 숨기기</Text>
              <Text style={styles.rowSubValue}>
                {hideAdult ? '술집/유흥업소 숨김' : '모든 카테고리 표시'}
              </Text>
            </View>
            <Switch value={hideAdult} onValueChange={setHideAdult} />
          </View>

          {/* 지금 영업중 */}
          <View style={styles.cardRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowTitle}>지금 영업중</Text>
              <Text style={styles.rowSubValue}>
                {openNow ? '현재 영업중인 가게만 표시' : '영업시간 상관없이 표시'}
              </Text>
            </View>
            <Switch value={openNow} onValueChange={setOpenNow} />
          </View>
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionsBar}>
          <Pressable
            style={styles.resetBtn}
            onPress={() => {
              onReset();
              setQueryText('');
              setSortKey('recommended');
              setOpenNow(false);
            }}
          >
            <Text style={styles.resetTxt}>초기화</Text>
          </Pressable>

          <Pressable style={styles.applyBtn} onPress={applyAndClose}>
            <Text style={styles.applyTxt}>적용</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}>
      <Text style={[styles.pillTxt, active ? styles.pillTxtActive : styles.pillTxtIdle]}>{label}</Text>
    </Pressable>
  );
}

/* =======================
 * Single Slider (기존 안정 구현 유지)
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
    const raw = minRef.current + (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
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
          { height: Math.max(thumbSize, trackHeight), position: 'relative' },
        ]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          if (!widthReady) setWidthReady(true);
        }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View style={[styles.rangeSelected, { height: trackHeight, left: 0, width: Math.max(0, thumbX) }]} />
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
        <View {...(pan as any).panHandlers} style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </View>
    </View>
  );
};

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
    backgroundColor: TOK.bg,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
    bottom: 18,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 110 },

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

  clearInlineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: TOK.soft,
    borderWidth: 1,
    borderColor: TOK.line,
  },
  clearInlineTxt: {
    color: TOK.text,
    fontWeight: '700',
    fontSize: 12,
  },

  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
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
  pillTxt: { fontSize: 12, fontWeight: '700' },
  pillTxtIdle: { color: TOK.text },
  pillTxtActive: { color: '#FFFFFF' },

  helper: {
    marginTop: 10,
    fontSize: 12,
    color: TOK.sub,
    fontWeight: '600',
  },

  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: TOK.line2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TOK.primary,
    letterSpacing: -0.2,
  },
  rowSubValue: {
    marginTop: 6,
    color: TOK.sub,
    fontWeight: '600',
    fontSize: 12,
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
  resetTxt: { fontWeight: '700', color: TOK.text },
  applyBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOK.primary,
  },
  applyTxt: { fontWeight: '700', color: '#FFFFFF' },

  rangeWrap: { justifyContent: 'center', overflow: 'visible' },
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
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});
