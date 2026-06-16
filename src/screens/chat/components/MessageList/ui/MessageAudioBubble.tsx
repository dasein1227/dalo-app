// src/screens/chat/components/MessageList/ui/MessageAudioBubble.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming, 
  cancelAnimation 
} from 'react-native-reanimated';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { ensureOriginalCached, isRemoteHttpUrl, isLocalMediaUri } from '@/lib/media/chatMediaCache';

type Props = {
  uri: string;
  isMe: boolean;
  maskOnly?: boolean;
  selectionMode?: boolean;
  interactionLocked?: boolean;
  theme: ChatTheme;
  bubbleShadowStyle?: any;
  replyBlockNode?: React.ReactNode;
  dividerColor: string;
  durMs: number;
  progress: number;
  isPlaying: boolean;
  waveform?: number[]; // 🚀 리얼 파형 데이터 배열!
  onToggleVoice: (uri: string) => void;
  onLongPress?: () => void;
  /** 보안모드 음성은 일반 보존 저장소에 남기지 않는다. */
  disableCache?: boolean;
  /** 채팅방 단위 데이터관리/삭제를 위한 room id. */
  cacheRoomId?: number | string | null;
  mime?: string | null;
};

// --- 유틸리티 ---
function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) return { r: parseInt(h[0]+h[0], 16), g: parseInt(h[1]+h[1], 16), b: parseInt(h[2]+h[2], 16) };
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function withAlpha(hex: string, alpha01: number) {
  const rgb = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha01));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function formatTime(ms: number) {
  if (!ms || Number.isNaN(ms)) return '00:00';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

// 리얼 파형이 없을 때(예전 메시지)를 대비한 가짜 파형 생성기
function generateFallbackWaveform(seedStr: string, count: number) {
  let seed = 0;
  for (let i = 0; i < (seedStr?.length || 0); i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) % 10000;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const fade = 1 - (i / count);
    const rawSound = Math.abs(Math.sin(seed + i * 1.3) * Math.cos(seed * 0.5 + i * 0.7));
    const val = (rawSound * fade) * 0.8 + 0.2;
    bars.push(val);
  }
  return bars;
}

const BAR_COUNT = 30; // 🚀 카카오톡/텔레그램처럼 얇고 촘촘하게 개수 늘림
const BAR_WIDTH = 2;  // 두께는 2px
const BAR_MARGIN = 1.5;
const WAVE_TOTAL_WIDTH = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_MARGIN;

export function MessageAudioBubble({
  uri,
  isMe,
  maskOnly = false,
  selectionMode = false,
  interactionLocked = false,
  theme,
  bubbleShadowStyle,
  replyBlockNode,
  dividerColor,
  durMs,
  progress,
  isPlaying,
  waveform: realWaveform,
  onToggleVoice,
  onLongPress,
  disableCache = false,
  cacheRoomId = null,
  mime = 'audio/m4a',
}: Props) {
  
  const pillBg = maskOnly ? 'transparent' : isMe ? theme.myBubble : theme.opponentBubble;
  const fg = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  
  const btnBg = maskOnly ? 'transparent' : withAlpha(fg, 0.12);
  const pulseBg = maskOnly ? 'transparent' : withAlpha(fg, 0.25); // 펄스 애니메이션 색상
  const waveInactiveColor = maskOnly ? 'transparent' : withAlpha(fg, 0.25);
  const waveActiveColor = maskOnly ? 'transparent' : fg;
  
  const safeProgress = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  
  // 🚀 다이내믹 타이머: 재생 중이면 현재 흐른 시간, 아니면 전체 시간
  const currentDisplayMs = isPlaying ? (durMs * safeProgress) : durMs;
  const timeLabelVoice = formatTime(currentDisplayMs);

  // 🚀 펄스(Pulse) 애니메이션 로직
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (isPlaying) {
      pulseScale.value = withRepeat(withTiming(1.6, { duration: 1000 }), -1, false);
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 200 }),
          withTiming(0, { duration: 800 })
        ), -1, false
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = 1;
      pulseOpacity.value = 0;
    }
  }, [isPlaying, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // 🚀 리얼 파형 or 가짜 파형 결정
  const finalWaveform = useMemo(() => {
    if (realWaveform && realWaveform.length > 0) {
      if (realWaveform.length === BAR_COUNT) return realWaveform;
      // 데이터가 부족하면 0.05로 패딩, 넘치면 자르기
      const padded = [...realWaveform, ...Array(BAR_COUNT).fill(0.05)].slice(0, BAR_COUNT);
      return padded;
    }
    return generateFallbackWaveform(uri, BAR_COUNT);
  }, [uri, realWaveform]);


  const [preparingLocal, setPreparingLocal] = useState(false);

  const handlePressVoice = useCallback(async () => {
    if (interactionLocked || preparingLocal) return;

    const rawUri = String(uri ?? '').trim();
    if (!rawUri) return;

    // 보안모드/로컬 uri/비원격 uri는 기존 흐름을 그대로 따른다.
    if (disableCache || isLocalMediaUri(rawUri) || !isRemoteHttpUrl(rawUri)) {
      onToggleVoice(rawUri);
      return;
    }

    try {
      setPreparingLocal(true);
      const localUri = await ensureOriginalCached(rawUri, {
        mime: mime || 'audio/m4a',
        roomId: cacheRoomId,
        assetType: 'audio',
      });
      onToggleVoice(localUri || rawUri);
    } catch {
      onToggleVoice(rawUri);
    } finally {
      setPreparingLocal(false);
    }
  }, [cacheRoomId, disableCache, interactionLocked, mime, onToggleVoice, preparingLocal, uri]);

  const renderWaveformBars = (color: string) => (
    <View style={styles.waveRow}>
      {finalWaveform.map((val, idx) => (
        <View 
          key={idx} 
          style={[
            styles.waveBar, 
            { 
              height: Math.max(4, val * 24), 
              backgroundColor: color,
              marginRight: idx === finalWaveform.length - 1 ? 0 : BAR_MARGIN
            }
          ]} 
        />
      ))}
    </View>
  );

  const content = (
    <>
      {!!replyBlockNode && (
        <>
          {replyBlockNode}
          <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />
        </>
      )}
      <View style={styles.contentRow}>
        
        {/* 1. 플레이 버튼 구역 (펄스 애니메이션 포함) */}
        <View style={styles.btnZone}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.pulseCircle, { backgroundColor: pulseBg }, pulseStyle]} />
          <View style={[styles.playBtn, { backgroundColor: btnBg }]}>
            {maskOnly ? null : isPlaying ? (
              <Pause fill={fg} color={fg} size={15} />
            ) : (
              <Play fill={fg} color={fg} size={16} style={{ marginLeft: 2 }} />
            )}
          </View>
        </View>

        {/* 2. 파형 구역 (얇은 리얼 파형) */}
        <View style={[styles.waveContainer, { width: WAVE_TOTAL_WIDTH }]}>
          <View style={styles.waveBase}>
            {renderWaveformBars(waveInactiveColor)}
          </View>
          <View style={[styles.waveOverlayMask, { width: `${safeProgress * 100}%` }]}>
            {renderWaveformBars(waveActiveColor)}
          </View>
        </View>

        {/* 3. 다이내믹 시간 구역 */}
        <Text style={[styles.timeText, { color: fg }]}>{timeLabelVoice}</Text>
        
      </View>
    </>
  );

  const inner = (
    <View style={[styles.bubbleOuter, bubbleShadowStyle, { backgroundColor: pillBg }]}>
      <View style={styles.bubbleInner}>{content}</View>
    </View>
  );

  if (selectionMode || maskOnly) {
    return <View style={styles.wrapper}>{inner}</View>;
  }

  return (
    <Pressable
      onLongPress={interactionLocked ? undefined : onLongPress}
      delayLongPress={220}
      hitSlop={6}
      onPress={interactionLocked ? undefined : handlePressVoice}
    >
      {({ pressed }) => (
        <View style={pressed ? { opacity: 0.85 } : { opacity: 1 }}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: 'transparent' },
  bubbleOuter: { 
    overflow: 'visible',
    borderRadius: 24, // 🚀 알약(Pill) 형태 극대화
    minWidth: 200,
    maxWidth: 280, 
  },
  bubbleInner: { 
    paddingHorizontal: 14, 
    paddingVertical: 10,
    justifyContent: 'center',
  },
  contentRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  
  // 구역 1: 버튼 & 펄스
  btnZone: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  playBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    alignItems: 'center', 
    justifyContent: 'center', 
    zIndex: 2,
  },
  pulseCircle: {
    borderRadius: 18,
    zIndex: 1,
  },
  
  // 구역 2: 파형
  waveContainer: { 
    height: 32,
    justifyContent: 'center',
    marginHorizontal: 10, 
  },
  waveBase: { flexDirection: 'row', alignItems: 'center' },
  waveOverlayMask: {
    position: 'absolute', 
    left: 0, top: 0, bottom: 0,
    overflow: 'hidden', 
    justifyContent: 'center', 
  },
  waveRow: { flexDirection: 'row', alignItems: 'center' },
  waveBar: { 
    width: BAR_WIDTH, 
    borderRadius: 1, // 얇은 막대에 맞춰 라운드 축소
    flexShrink: 0, 
  },

  // 구역 3: 시간
  timeText: { 
    width: 40, 
    textAlign: 'right', 
    fontSize: 12, 
    fontWeight: '700',
    fontVariant: ['tabular-nums'], 
  },
  replyDivider: { height: StyleSheet.hairlineWidth, marginBottom: 8, opacity: 0.6 },
});