// src/screens/business/modals/BusinessSearchModal.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { useAppTheme } from '../../../theme/useAppTheme';
import {
  createBusinessSearchModalStyles,
  createBusinessSearchModalTheme,
  type BusinessSearchModalStyles,
} from './BusinessSearchModal.theme';

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

  queryText: string;
  setQueryText: (v: string) => void;

  sortKey: BusinessSortKey;
  setSortKey: (v: BusinessSortKey) => void;

  openNow: boolean;
  setOpenNow: (v: boolean) => void;

  onReset: () => void;
  onApply: (nextQuery: string) => void | Promise<void>;

  topOffset?: number;
  radiusMin?: number;
  radiusMax?: number;
  radiusStep?: number;
};

const SORT_LABEL_KEY: Record<BusinessSortKey, string> = {
  recommended: 'business:search.sort.recommended',
  distance: 'business:search.sort.distance',
  event: 'business:search.sort.event',
};

type SwitchStyleProps = Pick<
  React.ComponentProps<typeof Switch>,
  'trackColor' | 'thumbColor' | 'ios_backgroundColor'
>;

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
    radiusMin = 200,
    radiusMax = 3000,
    radiusStep = 100,
  } = props;

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessSearchModalTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBusinessSearchModalStyles(ui), [ui]);
  const switchProps = useMemo<SwitchStyleProps>(
    () => ({
      trackColor: {
        false: ui.switchTrackOff,
        true: ui.switchTrackOn,
      },
      thumbColor: ui.switchThumb,
      ios_backgroundColor: ui.switchTrackOff,
    }),
    [ui],
  );

  const [draftQuery, setDraftQuery] = useState<string>(queryText ?? '');

  useEffect(() => {
    if (visible) setDraftQuery(queryText ?? '');
  }, [visible, queryText]);

  const close = useCallback(() => onClose(), [onClose]);

  const applyAndClose = useCallback(async () => {
    const q = String(draftQuery ?? '');
    setQueryText(q);
    await onApply(q);
    onClose();
  }, [draftQuery, onApply, onClose, setQueryText]);

  const handleReset = useCallback(() => {
    onReset();
    setDraftQuery('');
    setQueryText('');
    setSortKey('recommended');
    setOpenNow(false);
  }, [onReset, setOpenNow, setQueryText, setSortKey]);

  const clearDraft = useCallback(() => setDraftQuery(''), []);

  const hasText = !!draftQuery.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />

      <View style={[styles.panel, { top: topOffset, bottom: insets.bottom }]}> 
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.sectionTitle}>{t('business:search.title')}</Text>
              <Pressable
                onPress={close}
                style={styles.closeBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('common:close')}
              >
                <X size={18} color={ui.iconMuted} />
              </Pressable>
            </View>

            <View style={styles.searchField}>
              <Search size={18} color={ui.iconMuted} />

              <TextInput
                value={draftQuery}
                onChangeText={setDraftQuery}
                placeholder={t('business:search.placeholder')}
                placeholderTextColor={ui.placeholder}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={styles.searchInput}
                onSubmitEditing={applyAndClose}
              />

              {hasText ? (
                <Pressable
                  onPress={clearDraft}
                  hitSlop={10}
                  style={styles.clearIconBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('business:search.clear')}
                >
                  <X size={16} color={ui.iconMuted} />
                </Pressable>
              ) : (
                <View style={styles.clearIconPlaceholder} pointerEvents="none" />
              )}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('business:search.distance')}</Text>
              <Text style={styles.sectionValue}>{displayMeters(radiusMeters)}</Text>
            </View>

            <SingleSlider
              min={radiusMin}
              max={radiusMax}
              step={radiusStep}
              value={radiusMeters}
              onChange={setRadiusMeters}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.12}
              styles={styles}
            />

            <Text style={styles.helper}>{t('business:search.distanceHint')}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('business:search.sortTitle')}</Text>
              <Text style={styles.sectionValue}>{t(SORT_LABEL_KEY[sortKey])}</Text>
            </View>

            <View style={styles.optionGroup}>
              <Pill
                label={t('business:search.sort.recommended')}
                active={sortKey === 'recommended'}
                onPress={() => setSortKey('recommended')}
                styles={styles}
              />
              <Pill
                label={t('business:search.sort.distance')}
                active={sortKey === 'distance'}
                onPress={() => setSortKey('distance')}
                styles={styles}
              />
              <Pill
                label={t('business:search.sort.event')}
                active={sortKey === 'event'}
                onPress={() => setSortKey('event')}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('business:search.conditions')}</Text>

            <ToggleRow
              title={t('business:search.filter.event')}
              value={onlyWithEvent ? t('business:search.value.activeOnly') : t('business:search.value.all')}
              enabled={onlyWithEvent}
              onChange={setOnlyWithEvent}
              styles={styles}
              switchProps={switchProps}
            />
            <View style={styles.rowDivider} />
            <ToggleRow
              title={t('business:search.filter.adult')}
              value={hideAdult ? t('business:search.value.hidden') : t('business:search.value.included')}
              enabled={hideAdult}
              onChange={setHideAdult}
              styles={styles}
              switchProps={switchProps}
            />
            <View style={styles.rowDivider} />
            <ToggleRow
              title={t('business:search.filter.openNow')}
              value={openNow ? t('business:search.value.openOnly') : t('business:search.value.all')}
              enabled={openNow}
              onChange={setOpenNow}
              styles={styles}
              switchProps={switchProps}
            />
          </View>
        </ScrollView>

        <View style={styles.actionsBar}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.resetBtn, pressed && styles.actionBtnPressed]}
            onPress={handleReset}
          >
            <Text style={styles.resetTxt}>{t('business:search.reset')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.applyBtn, pressed && styles.applyBtnPressed]}
            onPress={applyAndClose}
          >
            <Text style={styles.applyTxt}>{t('business:search.apply')}</Text>
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
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: BusinessSearchModalStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionPill,
        active ? styles.optionPillActive : styles.optionPillIdle,
        pressed && !active && styles.optionPillPressed,
      ]}
    >
      <Text style={[styles.optionPillText, active ? styles.optionPillTextActive : styles.optionPillTextIdle]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  title,
  value,
  enabled,
  onChange,
  styles,
  switchProps,
}: {
  title: string;
  value: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  styles: BusinessSearchModalStyles;
  switchProps: SwitchStyleProps;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Switch value={enabled} onValueChange={onChange} {...switchProps} />
    </View>
  );
}

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
  styles: BusinessSearchModalStyles;
};

const SingleSlider: React.FC<SingleSliderProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  trackHeight = 6,
  thumbSize = 22,
  activeScale = 1.12,
  disabled = false,
  styles,
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
  const grow = () => Animated.spring(scale, { toValue: activeScale, useNativeDriver: true, bounciness: 6 }).start();
  const shrink = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();

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
        style={[styles.rangeWrap, { height: Math.max(thumbSize, trackHeight), position: 'relative' }]}
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
