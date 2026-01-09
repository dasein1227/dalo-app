// src/screens/chat/theme/global/ChatThemeGate.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ImageBackground } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import ChatEffectOverlay, { type OverlayMode, type Intensity } from './ChatEffectOverlay';

type BackgroundMode = 'none' | 'color' | 'image';

type GlobalThemeRow = {
  id: number;
  enabled: boolean;

  theme_id: string | null; // ✅ 테마별 분기 키 (NULL = global)

  background_mode: BackgroundMode | string | null;
  background_color: string | null;
  background_opacity: number | null;
  background_key: string | null; // 있음(사용 안 해도 됨)
  background_url: string | null;
  background_blur: number | null;

  overlay_enabled: boolean | null;
  overlay_mode: OverlayMode | string | null;
  effect_intensity: number | null;

  force: boolean | null;

  starts_at: string | null;
  ends_at: string | null;
  updated_at: string | null;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function withinWindow(startsAt?: string | null, endsAt?: string | null, now = Date.now()) {
  const s = startsAt ? new Date(startsAt).getTime() : NaN;
  const e = endsAt ? new Date(endsAt).getTime() : NaN;

  const okStart = Number.isFinite(s) ? now >= s : true;
  const okEnd = Number.isFinite(e) ? now <= e : true;
  return okStart && okEnd;
}

function normalizeBackgroundMode(v: any): BackgroundMode {
  const s = (v ?? '').toString();
  if (s === 'none' || s === 'color' || s === 'image') return s;
  return 'none';
}

function normalizeOverlayMode(v: any): OverlayMode {
  const s = (v ?? '').toString();
  const ok: OverlayMode[] = ['none', 'snow', 'rain', 'cherry', 'leaf', 'dust', 'confetti', 'emergency'];
  return (ok.includes(s as any) ? s : 'none') as OverlayMode;
}

type Resolved = {
  active: boolean;

  bgMode: BackgroundMode;
  bgColor: string | null;
  bgOpacity: number;
  bgUrl: string | null;
  bgBlur: number;

  overlayEnabled: boolean;
  overlayMode: OverlayMode;
  overlayIntensity: Intensity;
};

function resolve(row: GlobalThemeRow | null): Resolved | null {
  if (!row) return null;

  const active = !!row.enabled && withinWindow(row.starts_at, row.ends_at);

  const bgMode = normalizeBackgroundMode(row.background_mode);
  const bgColor = row.background_color ?? null;
  const bgOpacity = clamp(Number(row.background_opacity ?? 1), 0, 1);
  const bgUrl = row.background_url ?? null;
  const bgBlur = clamp(Number(row.background_blur ?? 0), 0, 20);

  const overlayEnabled = !!row.overlay_enabled;
  const overlayMode = normalizeOverlayMode(row.overlay_mode);

  const intensityRaw = Math.trunc(Number(row.effect_intensity ?? 1));
  const overlayIntensity: Intensity = intensityRaw <= 1 ? 1 : intensityRaw === 2 ? 2 : 3;

  return { active, bgMode, bgColor, bgOpacity, bgUrl, bgBlur, overlayEnabled, overlayMode, overlayIntensity };
}

/**
 * ✅ 선택 우선순위:
 * 1) force=true & active
 * 2) theme_id = roomType & active
 * 3) theme_id IS NULL(global) & active
 * 같은 우선순위면 updated_at 최신
 */
function pickBest(rows: GlobalThemeRow[], roomType: string) {
  const now = Date.now();

  const scored = rows
    .filter((r) => !!r && !!r.enabled && withinWindow(r.starts_at, r.ends_at, now))
    .map((r) => {
      const isGlobal = r.theme_id == null;
      const isTheme = r.theme_id === roomType;
      const isForce = !!r.force;

      const pri = isForce ? 3 : isTheme ? 2 : isGlobal ? 1 : 0;
      const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return { r, pri, t };
    })
    .filter((x) => x.pri > 0)
    .sort((a, b) => (b.pri !== a.pri ? b.pri - a.pri : b.t - a.t));

  return scored[0]?.r ?? null;
}

async function fetchRows(roomType: string): Promise<GlobalThemeRow[]> {
  // theme_id = roomType OR theme_id IS NULL(global)
  const { data, error } = await supabase
    .from('ui_global_theme')
    .select('*')
    .or(`theme_id.eq.${roomType},theme_id.is.null`);

  if (error) {
    console.warn('[ChatThemeGate] fetch error:', error.message ?? error);
    return [];
  }
  return (data as any as GlobalThemeRow[]) ?? [];
}

function subscribeRows(roomType: string, onAnyChange: () => void) {
  const ch = supabase
    .channel(`ui_global_theme_watch_${roomType}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ui_global_theme' }, (payload: any) => {
      const row = (payload?.new ?? payload?.old) as GlobalThemeRow | null;
      if (!row) return;

      // 관련 row만 반응: 현재 theme_id 또는 global(NULL)
      if (row.theme_id == null || row.theme_id === roomType) onAnyChange();
    })
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(ch);
    } catch {}
  };
}

type Props = {
  theme: ChatTheme;
  roomType: string; // ✅ dm/group/... (너의 ChatRoomType string 그대로)
  children: React.ReactNode;
};

export default function ChatThemeGate({ theme, roomType, children }: Props) {
  const [rows, setRows] = useState<GlobalThemeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsub: null | (() => void) = null;

    const load = async () => {
      const next = await fetchRows(roomType);
      if (cancelled) return;
      setRows(next);
    };

    load();
    unsub = subscribeRows(roomType, load);

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [roomType]);

  const chosen = useMemo(() => pickBest(rows, roomType), [rows, roomType]);
  const resolved = useMemo(() => resolve(chosen), [chosen]);

  const baseColor = theme.background;

  const shouldOverlay = !!resolved && resolved.active && resolved.overlayEnabled && resolved.overlayMode !== 'none';
  const overlayNode = shouldOverlay ? (
    <ChatEffectOverlay mode={resolved!.overlayMode} intensity={resolved!.overlayIntensity} />
  ) : null;

  if (!resolved || !resolved.active || resolved.bgMode === 'none') {
    return (
      <View style={[styles.root, { backgroundColor: baseColor }]}>
        {overlayNode}
        {children}
      </View>
    );
  }

  if (resolved.bgMode === 'color' && resolved.bgColor) {
    return (
      <View style={[styles.root, { backgroundColor: baseColor }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: resolved.bgColor, opacity: resolved.bgOpacity }]} />
        {overlayNode}
        {children}
      </View>
    );
  }

  if (resolved.bgMode === 'image' && resolved.bgUrl) {
    const blurRadius = resolved.bgBlur > 0 ? Math.round(resolved.bgBlur) : undefined;

    return (
      <View style={[styles.root, { backgroundColor: baseColor }]}>
        <ImageBackground
          source={{ uri: resolved.bgUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={blurRadius}
        />
        {overlayNode}
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: baseColor }]}>
      {overlayNode}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
