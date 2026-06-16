// src/screens/home/components/AIBanner.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ShoppingBag } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/theme/useAppTheme';
import { createAIBannerTheme } from './AIBanner.theme';

export type AICopyRule = {
  text: string;
  when?: {
    weather_in?: Array<
      | 'clear'
      | 'cloudy'
      | 'rain'
      | 'snow'
      | 'wind'
      | 'fog'
      | 'hot'
      | 'cold'
      | string
    >;
    temp_min?: number;
    temp_max?: number;
    time_in?: Array<'morning' | 'lunch' | 'afternoon' | 'evening' | 'night'>;
    open_only?: boolean;
  };
  priority?: number;
};

export type BannerItemData = {
  business_id: string;
  image_url: string | null;
  title: string | null;
  subtitle: string | null;
  tag?: string | null;
  ai_briefing?: string | null;
  one_line_intro?: string | null;
  ai_copies?: any;
  meta?: {
    distance_m?: number | null;
    rating?: number | null;
    review_count?: number | null;
    has_active_event?: boolean | null;
    is_open_now?: boolean | null;
  };
};

export type WeatherData = {
  snapshot?: {
    summary?: string;
    temp_c?: number | null;
  };
};

export type AIBannerProps = {
  item: BannerItemData;
  weather?: WeatherData | null;
  onPress?: (businessId: string) => void;
  style?: ViewStyle;
  loading?: boolean;
};

const ASPECT_RATIO = 21 / 9;

function hash32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickDeterministic<T>(arr: T[], seed: string) {
  if (!arr.length) return null;
  const h = hash32(seed);
  return arr[h % arr.length];
}

function normalizeWeatherKey(
  summary?: string | null,
): Array<'clear' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'fog'> {
  const s = (summary ?? '').toLowerCase();
  const keys: Array<'clear' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'fog'> = [];

  if (s.includes('맑') || s.includes('clear') || s.includes('sun') || s.includes('sunny'))
    keys.push('clear');
  if (s.includes('흐림') || s.includes('구름') || s.includes('cloud') || s.includes('overcast'))
    keys.push('cloudy');
  if (s.includes('비') || s.includes('rain') || s.includes('shower')) keys.push('rain');
  if (s.includes('눈') || s.includes('snow') || s.includes('sleet')) keys.push('snow');
  if (s.includes('바람') || s.includes('wind')) keys.push('wind');
  if (s.includes('안개') || s.includes('fog') || s.includes('mist')) keys.push('fog');

  return keys.length ? keys : [];
}

function getTimeBucket(d = new Date()): 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 14 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

type LegacyCopy = {
  id?: string;
  headline?: string;
  conditions?: Record<string, any>;
  priority?: number;
};

function normalizeWeatherList(input: any): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input
    .map((x) => String(x).toLowerCase().trim())
    .filter(Boolean)
    .map((x) => (x === 'drizzle' ? 'rain' : x));
  return out.length ? out : undefined;
}

function timeRangesToBuckets(
  timeRanges: any,
): Array<'morning' | 'lunch' | 'afternoon' | 'evening' | 'night'> | undefined {
  if (!Array.isArray(timeRanges) || !timeRanges.length) return undefined;

  const buckets: Array<{ key: any; start: number; end: number }> = [
    { key: 'morning', start: 6, end: 11 },
    { key: 'lunch', start: 11, end: 14 },
    { key: 'afternoon', start: 14, end: 18 },
    { key: 'evening', start: 18, end: 22 },
  ];

  const selected = new Set<'morning' | 'lunch' | 'afternoon' | 'evening' | 'night'>();

  const addNightIfOverlap = (aStart: number, aEnd: number) => {
    const overlap1 = Math.max(0, Math.min(aEnd, 24) - Math.max(aStart, 22));
    const overlap2 = Math.max(0, Math.min(aEnd, 6) - Math.max(aStart, 0));
    if (overlap1 > 0 || overlap2 > 0) selected.add('night');
  };

  for (const tr of timeRanges) {
    const s = String(tr).trim();
    const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!m) continue;

    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a < 0 || a > 24 || b < 0 || b > 24) continue;

    const segments: Array<{ start: number; end: number }> =
      b >= a ? [{ start: a, end: b }] : [{ start: a, end: 24 }, { start: 0, end: b }];

    for (const seg of segments) {
      for (const bk of buckets) {
        const overlap = Math.max(0, Math.min(seg.end, bk.end) - Math.max(seg.start, bk.start));
        if (overlap > 0) selected.add(bk.key);
      }
      addNightIfOverlap(seg.start, seg.end);
    }
  }

  const arr = Array.from(selected);
  return arr.length ? arr : undefined;
}

function legacyCopyToRule(c: LegacyCopy): AICopyRule | null {
  const text = (c.headline ?? '').trim();
  if (!text) return null;

  const cond = c.conditions && typeof c.conditions === 'object' ? c.conditions : {};

  const weather_in = normalizeWeatherList(cond.weather);
  const temp_min = typeof cond.temp_min === 'number' ? cond.temp_min : undefined;
  const temp_max = typeof cond.temp_max === 'number' ? cond.temp_max : undefined;
  const time_in = timeRangesToBuckets(cond.time);

  const when: AICopyRule['when'] = {};
  if (weather_in) when.weather_in = weather_in as any;
  if (typeof temp_min === 'number') when.temp_min = temp_min;
  if (typeof temp_max === 'number') when.temp_max = temp_max;
  if (time_in) when.time_in = time_in;

  const hasWhen = Object.keys(when).length > 0;

  return {
    text,
    when: hasWhen ? when : undefined,
    priority: typeof c.priority === 'number' ? c.priority : undefined,
  };
}

function coerceRules(ai_copies?: BannerItemData['ai_copies']): AICopyRule[] {
  if (!ai_copies) return [];

  if (Array.isArray(ai_copies)) {
    if (!ai_copies.length) return [];
    const first = ai_copies[0] as any;

    if (typeof first === 'string') {
      return (ai_copies as any[])
        .filter((t) => typeof t === 'string' && t.trim().length > 0)
        .map((t) => ({ text: String(t).trim() }));
    }

    if (first && typeof first === 'object' && typeof first.text === 'string') {
      return (ai_copies as any[])
        .filter((x) => x && typeof x.text === 'string' && x.text.trim().length > 0)
        .map((x) => ({
          text: String(x.text).trim(),
          when: x.when && typeof x.when === 'object' ? x.when : undefined,
          priority: typeof x.priority === 'number' ? x.priority : undefined,
        }));
    }

    if (first && typeof first === 'object' && typeof first.headline === 'string') {
      return (ai_copies as any[]).map((x) => legacyCopyToRule(x)).filter(Boolean) as AICopyRule[];
    }

    return [];
  }

  if (ai_copies && typeof ai_copies === 'object') {
    const payload = ai_copies as any;
    const copiesArr = payload?.copies;

    if (Array.isArray(copiesArr) && copiesArr.length) {
      const first = copiesArr[0] as any;

      if (typeof first === 'string') {
        return copiesArr
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
          .map((t: any) => ({ text: String(t).trim() }));
      }

      if (first && typeof first === 'object' && typeof first.headline === 'string') {
        return copiesArr.map((x: any) => legacyCopyToRule(x)).filter(Boolean) as AICopyRule[];
      }

      if (first && typeof first === 'object' && typeof first.text === 'string') {
        return copiesArr
          .filter((x: any) => x && typeof x.text === 'string' && x.text.trim().length > 0)
          .map((x: any) => ({
            text: String(x.text).trim(),
            when: x.when && typeof x.when === 'object' ? x.when : undefined,
            priority: typeof x.priority === 'number' ? x.priority : undefined,
          }));
      }
    }
  }

  return [];
}

function ruleMatches(
  r: AICopyRule,
  ctx: {
    weatherKeys: string[];
    temp?: number | null;
    timeBucket: string;
    isOpen?: boolean | null;
  },
) {
  const w = r.when;
  if (!w) return true;

  if (w.open_only === true && ctx.isOpen !== true) return false;

  if (typeof w.temp_min === 'number') {
    if (typeof ctx.temp !== 'number' || !Number.isFinite(ctx.temp)) return false;
    if (ctx.temp < w.temp_min) return false;
  }
  if (typeof w.temp_max === 'number') {
    if (typeof ctx.temp !== 'number' || !Number.isFinite(ctx.temp)) return false;
    if (ctx.temp > w.temp_max) return false;
  }

  if (Array.isArray(w.time_in) && w.time_in.length) {
    if (!w.time_in.includes(ctx.timeBucket as any)) return false;
  }

  if (Array.isArray(w.weather_in) && w.weather_in.length) {
    const normalized = (w.weather_in ?? [])
      .map((x) => String(x).toLowerCase().trim())
      .filter(Boolean)
      .map((x) => (x === 'drizzle' ? 'rain' : x));
    const keys = ctx.weatherKeys.map((x) => String(x).toLowerCase());
    const ok = normalized.some((want) => keys.includes(want));
    if (!ok) return false;
  }

  return true;
}

function chooseHeadlineFromCopies(item: BannerItemData, weather?: WeatherData | null) {
  const rules = coerceRules(item.ai_copies);
  if (!rules.length) return null;

  const temp = weather?.snapshot?.temp_c ?? null;
  const summary = weather?.snapshot?.summary ?? null;
  const weatherKeys = normalizeWeatherKey(summary);
  const timeBucket = getTimeBucket();

  const ctx = {
    weatherKeys: weatherKeys as any as string[],
    temp: typeof temp === 'number' && Number.isFinite(temp) ? temp : null,
    timeBucket,
    isOpen: item.meta?.is_open_now ?? null,
  };

  const matched = rules.filter((r) => ruleMatches(r, ctx));
  if (!matched.length) return null;

  matched.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  const topPriority = matched[0]?.priority ?? 999;
  const top = matched.filter((r) => (r.priority ?? 999) === topPriority);

  const d = new Date();
  const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

  const seed = [
    item.business_id ?? '',
    dayKey,
    timeBucket,
    weatherKeys.join(','),
    typeof ctx.temp === 'number' ? Math.round(ctx.temp) : '',
    item.meta?.is_open_now === true ? 'open' : item.meta?.is_open_now === false ? 'closed' : 'unk',
  ].join('|');

  const picked = pickDeterministic(top, seed);
  return picked?.text ?? null;
}

function getBannerContent(item: BannerItemData, weather: WeatherData | null | undefined, t: (key: string) => string) {
  const pickedCopy = chooseHeadlineFromCopies(item, weather);
  let headline = (pickedCopy ?? item.title)?.trim?.() || null;

  if (!headline || headline === '오늘의 추천' || headline === '근처에서 새로 찾기') {
    if (item.ai_briefing && typeof item.ai_briefing === 'string') {
      const first = item.ai_briefing
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean)[0];
      headline = first || headline;
    } else if (item.one_line_intro) {
      headline = item.one_line_intro;
    } else {
      headline = t('home:banner_default_headline');
    }
  }

  const name = item.subtitle?.split('·')?.[0]?.trim() || item.subtitle?.trim() || t('home:banner_unknown_place');
  const dist = item.meta?.distance_m != null ? `${Math.round(Number(item.meta.distance_m))}m` : '';

  let status = '';
  if (item.meta?.is_open_now === true) status = t('home:banner_status_open');
  else if (item.meta?.is_open_now === false) status = t('home:banner_status_closed');

  const subline = [name, dist, status].filter(Boolean).join(' · ');

  return { headline, subline, isOpen: item.meta?.is_open_now };
}

export const AIBanner = ({ item, weather, onPress, style, loading }: AIBannerProps) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const appTheme = useAppTheme();
  const bannerTheme = useMemo(() => createAIBannerTheme(appTheme), [appTheme.mode]);

  const imageUrl = typeof item.image_url === 'string' ? item.image_url.trim() : '';
  const hasImageUrl = imageUrl.length > 0;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const imageFailed = hasImageUrl && failedImageUrl === imageUrl;
  const showRealImage = hasImageUrl && !imageFailed;
  const useLightFallbackTone = !showRealImage && !bannerTheme.isDark;

  const H_PADDING = 12;
  const bannerWidth = windowWidth - H_PADDING * 2;
  const bannerHeight = bannerWidth / ASPECT_RATIO;

  const { headline, subline, isOpen } = useMemo(() => getBannerContent(item, weather, t), [item, weather, t]);
  const adaptiveBgColor = showRealImage ? bannerTheme.background : bannerTheme.fallbackBackground;

  const temp = weather?.snapshot?.temp_c;
  const summary = weather?.snapshot?.summary;
  const showWeather = typeof temp === 'number' && Number.isFinite(temp);

  const tagBackground = useLightFallbackTone ? bannerTheme.fallbackTagBackground : bannerTheme.tagBackground;
  const tagBorder = useLightFallbackTone ? bannerTheme.fallbackTagBorder : bannerTheme.tagBorder;
  const tagText = useLightFallbackTone ? bannerTheme.fallbackTagText : bannerTheme.tagText;
  const tagIcon = useLightFallbackTone ? bannerTheme.fallbackTagIcon : bannerTheme.tagIcon;
  const loadingColor = useLightFallbackTone ? bannerTheme.fallbackLoading : bannerTheme.loading;
  const weatherBackground = useLightFallbackTone
    ? bannerTheme.fallbackWeatherBackground
    : bannerTheme.weatherBackground;
  const weatherBorder = useLightFallbackTone ? bannerTheme.fallbackWeatherBorder : bannerTheme.weatherBorder;
  const weatherText = useLightFallbackTone ? bannerTheme.fallbackWeatherText : bannerTheme.weatherText;
  const headlineColor = useLightFallbackTone ? bannerTheme.fallbackHeadline : bannerTheme.headline;
  const headlineShadowColor = useLightFallbackTone
    ? bannerTheme.fallbackHeadlineShadowColor
    : bannerTheme.headlineShadowColor;
  const headlineShadowRadius = useLightFallbackTone
    ? bannerTheme.fallbackHeadlineShadowRadius
    : bannerTheme.headlineShadowRadius;
  const subLineColor = useLightFallbackTone
    ? isOpen === false
      ? bannerTheme.fallbackClosedSubLine
      : bannerTheme.fallbackSubLine
    : isOpen === false
      ? bannerTheme.closedSubLine
      : bannerTheme.subLine;

  return (
    <Pressable
      onPress={() => {
        if (item.business_id) onPress?.(item.business_id);
      }}
      style={({ pressed }) => [
        styles.container,
        { width: bannerWidth, height: bannerHeight, backgroundColor: adaptiveBgColor },
        style,
        pressed && { opacity: bannerTheme.pressedOpacity },
      ]}
    >
      <View style={styles.imageWrapper}>
        {!showRealImage && (
          <View
            style={[
              styles.fallbackSurface,
              { backgroundColor: bannerTheme.imageFallbackBackground },
            ]}
          >
            <LinearGradient
              colors={bannerTheme.imageFallbackGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={bannerTheme.organicMistA}
              start={{ x: 0.05, y: 0.05 }}
              end={{ x: 1, y: 0.95 }}
              style={[styles.organicLayer, styles.organicLayerA]}
            />
            <LinearGradient
              colors={bannerTheme.organicMistB}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.organicLayer, styles.organicLayerB]}
            />
            <LinearGradient
              colors={bannerTheme.organicMistC}
              start={{ x: 0.1, y: 1 }}
              end={{ x: 0.9, y: 0 }}
              style={[styles.organicLayer, styles.organicLayerC]}
            />
            <LinearGradient
              colors={bannerTheme.organicShade}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.organicLayer, styles.organicShade]}
            />
          </View>
        )}

        {showRealImage && (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            fadeDuration={0}
            onError={() => setFailedImageUrl(imageUrl)}
          />
        )}

        {showRealImage && (
          <>
            <LinearGradient
              colors={bannerTheme.overlayGradient}
              locations={[0, 0.3, 0.6]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />

            <LinearGradient
              colors={bannerTheme.bottomGradient}
              start={{ x: 0.5, y: 0.3 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.tagBadge,
              { backgroundColor: tagBackground, borderColor: tagBorder },
            ]}
          >
            <ShoppingBag size={10} color={tagIcon} style={{ marginRight: 4 }} />
            <Text style={[styles.tagText, { color: tagText }]}>
              {item.tag || t('home:banner_tag_fallback')}
            </Text>
          </View>
        </View>
        {!!loading && (
          <View style={styles.loadingIcon} pointerEvents="none">
            <ActivityIndicator size="small" color={loadingColor} />
          </View>
        )}
        {showWeather && !loading && (
          <View
            style={[styles.weatherBadgeWrap, { borderColor: weatherBorder }]}
            pointerEvents="none"
          >
            <BlurView
              intensity={22}
              tint={useLightFallbackTone ? 'light' : 'dark'}
              style={[styles.weatherBadgeBlur, { backgroundColor: weatherBackground }]}
            >
              <Text style={[styles.weatherText, { color: weatherText }]} numberOfLines={1}>
                {summary ?? ''} {Math.round(temp)}°
              </Text>
            </BlurView>
          </View>
        )}

        <View style={styles.textGroup}>
          <Text
            style={[
              styles.headline,
              {
                color: headlineColor,
                textShadowColor: headlineShadowColor,
                textShadowRadius: headlineShadowRadius,
              },
            ]}
            numberOfLines={2}
          >
            {headline}
          </Text>

          <Text
            style={[
              styles.subLine,
              { color: subLineColor },
            ]}
            numberOfLines={1}
          >
            {subline}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },

  imageWrapper: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  fallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  image: {
    width: '75%',
    height: '100%',
    overflow: 'hidden',
  },
  organicLayer: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 999,
  },
  organicLayerA: {
    width: '88%',
    height: '168%',
    right: -72,
    top: -52,
    transform: [{ rotate: '-12deg' }, { scaleX: 1.26 }, { scaleY: 0.86 }],
  },
  organicLayerB: {
    width: '78%',
    height: '118%',
    right: 26,
    bottom: -54,
    transform: [{ rotate: '17deg' }, { scaleX: 1.18 }, { scaleY: 0.78 }],
  },
  organicLayerC: {
    width: '112%',
    height: '130%',
    left: -84,
    bottom: -64,
    transform: [{ rotate: '-24deg' }, { scaleX: 0.92 }, { scaleY: 0.72 }],
  },
  organicShade: {
    width: '94%',
    height: '150%',
    left: -68,
    top: -58,
    transform: [{ rotate: '9deg' }, { scaleX: 1.08 }, { scaleY: 0.82 }],
  },

  contentContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loadingIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  weatherBadgeWrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  weatherBadgeBlur: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  weatherText: {
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  textGroup: {
    width: '70%',
    marginBottom: 2,
  },
  headline: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: -0.5,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subLine: {
    fontSize: 12,
    fontWeight: '500',
  },
});