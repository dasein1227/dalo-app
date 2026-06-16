// src/screens/home/components/HomeBannerCarousel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/theme/useAppTheme';
import { AIBanner, type BannerItemData, type WeatherData } from './AIBanner';
import {
  createHomeBannerCarouselTheme,
  type HomeBannerCarouselTheme,
} from './HomeBannerCarousel.theme';

type Props = {
  items: BannerItemData[];
  weather: WeatherData | null;
  loading: boolean;
  radiusM: number;
  onPressBanner?: (businessId: string) => void;
  bannerWidth: number;
};

const ASPECT_RATIO = 21 / 9;

function SkeletonBanner({
  width,
  radiusM,
  t,
  theme,
}: {
  width: number;
  radiusM: number;
  t: any;
  theme: HomeBannerCarouselTheme;
}) {
  const height = width / ASPECT_RATIO;
  return (
    <View style={[styles.skelCard, { width, height, backgroundColor: theme.skeletonCard }]}>
      <View style={[styles.skelImageWrap, styles.skelImageWrapFull]} pointerEvents="none">
        <View style={[styles.skelImage, { backgroundColor: theme.skeletonImage }]}> 
          <LinearGradient
            colors={theme.skeletonImageGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={theme.skeletonOrganicA}
            start={{ x: 0.05, y: 0.05 }}
            end={{ x: 1, y: 0.95 }}
            style={[styles.skelOrganicLayer, styles.skelOrganicA]}
          />
          <LinearGradient
            colors={theme.skeletonOrganicB}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.skelOrganicLayer, styles.skelOrganicB]}
          />
          <LinearGradient
            colors={theme.skeletonOrganicC}
            start={{ x: 0.1, y: 1 }}
            end={{ x: 0.9, y: 0 }}
            style={[styles.skelOrganicLayer, styles.skelOrganicC]}
          />
          <LinearGradient
            colors={theme.skeletonOrganicShade}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.skelOrganicLayer, styles.skelOrganicShade]}
          />
        </View>
      </View>
      <View style={styles.skelContent}>
        <View style={styles.skelTopRow}>
          <View
            style={[
              styles.skelBadge,
              {
                backgroundColor: theme.skeletonBadgeBackground,
                borderColor: theme.skeletonBadgeBorder,
              },
            ]}
          >
            <Text style={[styles.skelBadgeText, { color: theme.skeletonBadgeText }]}>{radiusM}m</Text>
          </View>
          <View style={styles.skelSpinner} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.skeletonSpinner} />
          </View>
        </View>
        <View style={styles.skelTextGroup}>
          <Text style={[styles.skelTitle, { color: theme.skeletonTitle }]} numberOfLines={1}>
            {t('home:banner_fallback_title')}
          </Text>
          <Text style={[styles.skelSubtitle, { color: theme.skeletonSubtitle }]} numberOfLines={1}>
            {t('home:banner_fallback_desc')}
          </Text>
          <View style={[styles.skelLine, { width: '62%', backgroundColor: theme.skeletonLine }]} />
          <View style={[styles.skelLine, { width: '46%', marginTop: 8, backgroundColor: theme.skeletonLine }]} />
          <View style={[styles.skelLine, { width: '54%', marginTop: 10, backgroundColor: theme.skeletonLineSoft }]} />
        </View>
        <View style={styles.skelDotsRow} pointerEvents="none">
          <View style={[styles.skelDot, { backgroundColor: theme.skeletonDot }]} />
          <View style={[styles.skelDot, { backgroundColor: theme.skeletonDotSoft }]} />
          <View style={[styles.skelDot, { backgroundColor: theme.skeletonDotFaint }]} />
        </View>
      </View>
    </View>
  );
}

export default function HomeBannerCarousel(props: Props) {
  const { items, weather, loading, radiusM, onPressBanner, bannerWidth } = props;
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const carouselTheme = useMemo(() => createHomeBannerCarouselTheme(appTheme), [appTheme.mode]);

  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<BannerItemData>>(null);
  const indexRef = useRef(0);

  const FALLBACK: BannerItemData[] = useMemo(() => [
    {
      business_id: 'fallback-1',
      image_url: null,
      title: t('home:banner_fallback_title'),
      subtitle: t('home:banner_fallback_desc'),
      tag: null,
      meta: {},
    },
  ], [t]);

  const data = useMemo(() => (items.length ? items : FALLBACK), [items, FALLBACK]);

  const containerStyle = {
    backgroundColor: carouselTheme.carouselBackground,
    borderColor: carouselTheme.carouselBorder,
  };

  const titleStyle = {
    color: carouselTheme.title,
  };

  const badgeStyle = {
    backgroundColor: carouselTheme.badgeBackground,
    color: carouselTheme.badgeText,
  };

  const dotColor = carouselTheme.dot;
  const activeDotColor = carouselTheme.activeDot;

  useEffect(() => {
    if (!data.length) return;

    const id = setInterval(() => {
      const next = (indexRef.current + 1) % data.length;
      indexRef.current = next;
      setActiveIndex(next);
      try {
        listRef.current?.scrollToIndex({ index: next, animated: true });
      } catch {}
    }, 4200);

    return () => clearInterval(id);
  }, [data.length]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / bannerWidth);
    indexRef.current = idx;
    setActiveIndex(idx);
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, titleStyle]}>
            {t('home:banner_headerTitle')}
          </Text>
          <Text
            style={[
              styles.headerBadge,
              { backgroundColor: badgeStyle.backgroundColor, color: badgeStyle.color },
            ]}
          >
            {radiusM}m
          </Text>
        </View>

        <View style={[styles.carouselWrap, containerStyle]}>
          <SkeletonBanner width={bannerWidth} radiusM={radiusM} t={t} theme={carouselTheme} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, titleStyle]}>
          {t('home:banner_headerTitle')}
        </Text>
        <Text
            style={[
              styles.headerBadge,
              { backgroundColor: badgeStyle.backgroundColor, color: badgeStyle.color },
            ]}
          >
          {radiusM}m
        </Text>
      </View>

      <View style={[styles.carouselWrap, containerStyle]}>
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item, idx) => `${item.business_id ?? 'x'}_${idx}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, index) => ({
            length: bannerWidth,
            offset: bannerWidth * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={{ width: bannerWidth }}>
              <AIBanner
                item={item}
                weather={weather}
                onPress={(businessId) => onPressBanner?.(businessId)}
                style={styles.bannerPad}
                loading={loading}
              />
            </View>
          )}
        />
      </View>

      <View style={styles.dotsRow}>
        {data.map((b, idx) => {
          const active = idx === activeIndex;
          return (
            <View
              key={`${b.business_id}_${idx}`}
              style={[
                styles.dot,
                { backgroundColor: active ? activeDotColor : dotColor }
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  headerTitle: { fontSize: 13, fontWeight: '800' },
  headerBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  carouselWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerPad: {
    borderRadius: 0,
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginHorizontal: 3,
  },
  skelCard: {
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
  },
  skelImageWrap: {
    height: '100%',
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  skelImageWrapFull: {
    width: '100%',
    left: 0,
    right: 0,
  },
  skelImage: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  skelOrganicLayer: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 999,
  },
  skelOrganicA: {
    width: '88%',
    height: '168%',
    right: -72,
    top: -52,
    transform: [{ rotate: '-12deg' }, { scaleX: 1.26 }, { scaleY: 0.86 }],
  },
  skelOrganicB: {
    width: '78%',
    height: '118%',
    right: 26,
    bottom: -54,
    transform: [{ rotate: '17deg' }, { scaleX: 1.18 }, { scaleY: 0.78 }],
  },
  skelOrganicC: {
    width: '112%',
    height: '130%',
    left: -84,
    bottom: -64,
    transform: [{ rotate: '-24deg' }, { scaleX: 0.92 }, { scaleY: 0.72 }],
  },
  skelOrganicShade: {
    width: '94%',
    height: '150%',
    left: -68,
    top: -58,
    transform: [{ rotate: '9deg' }, { scaleX: 1.08 }, { scaleY: 0.82 }],
  },
  skelContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  skelTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  skelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  skelBadgeSep: {
    marginHorizontal: 6,
    fontSize: 10,
    fontWeight: '900',
  },
  skelSpinner: {
    marginTop: -2,
  },
  skelTextGroup: {
    width: '70%',
  },
  skelTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  skelSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 12,
  },
  skelLine: {
    height: 10,
    borderRadius: 8,
  },
  skelDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
});