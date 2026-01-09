// src/screens/chat/VoiceRecorderModal.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause, RotateCcw, Send } from 'lucide-react-native';

import type { ChatRoomType, VoiceRecorderModalTheme } from './theme/chatTheme';
import { getVoiceRecorderModalTheme } from './theme/chatTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (uri: string, durationMs: number) => Promise<void>;

  /**
   * (기존 호환) 우리 포인트 컬러 (빨강)
   * - 호출부 깨지지 않게 남겨둠
   * - 표 기반 테마가 없을 때 fallback 용도로만 사용
   */
  themeColor: string;

  /**
   * ✅ NEW(선택): 방 타입/방 객체/직접 테마 전달
   * - 셋 중 하나만 줘도 됨
   */
  roomType?: ChatRoomType;
  room?: any;
  modalTheme?: VoiceRecorderModalTheme;
};

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function withAlpha(hex: string, alpha01: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, alpha01));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function isDark(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lum < 0.6;
}

function pickReadableText(bgHex: string, dark: string, light: string) {
  return isDark(bgHex) ? light : dark;
}

export default function VoiceRecorderModal({
  visible,
  onClose,
  onSend,
  themeColor,
  roomType,
  room,
  modalTheme,
}: Props) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'review'>('idle');

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const [startTimeMs, setStartTimeMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [finalDurationMs, setFinalDurationMs] = useState(0);
  const [playbackPosMs, setPlaybackPosMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const waveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const BAR_COUNT = 24;
  const [amplitudeBars, setAmplitudeBars] = useState<number[]>(
    Array.from({ length: BAR_COUNT }, () => 0.2),
  );

  const t: VoiceRecorderModalTheme =
    modalTheme ?? getVoiceRecorderModalTheme(roomType ?? room ?? 'dm');

  // 표 기준: 파형/중앙 버튼은 Red 고정 (#FF3B30)
  const waveRed = t.waveHighlight || '#FF3B30';
  const centerRed = t.centerButton || '#FF3B30';
  const sendActive = t.sendActive || '#0044CC';

  const playRatio =
    finalDurationMs > 0
      ? Math.min(playbackPosMs / finalDurationMs, 1)
      : 0;

  // ───────────────── theme-derived UI tokens (하드코딩 제거 핵심) ─────────────────
  const sheetBg = t.modalBg;

  // pill 배경/라인을 테마 기반으로
  const pillBg = React.useMemo(() => {
    // 모달 배경이 흰색 계열이면 아주 옅은 회색, 아니면 약간 더 밝은 오버레이
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.10) : withAlpha('#0F172A', 0.06);
  }, [sheetBg]);

  const pillLine = React.useMemo(() => {
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.18) : withAlpha('#0F172A', 0.10);
  }, [sheetBg]);

  const pillTrackBg = React.useMemo(() => {
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.18) : withAlpha('#0F172A', 0.12);
  }, [sheetBg]);

  const playBtnBg = React.useMemo(() => {
    // play 버튼은 pill 안에서 살짝 떠 보이게
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.14) : withAlpha('#FFFFFF', 0.85);
  }, [sheetBg]);

  const circleBg = React.useMemo(() => {
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.10) : '#FFFFFF';
  }, [sheetBg]);

  const circleBorder = React.useMemo(() => {
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.22) : withAlpha('#0F172A', 0.10);
  }, [sheetBg]);

  const handleLineBg = React.useMemo(() => {
    return isDark(sheetBg) ? withAlpha('#FFFFFF', 0.18) : withAlpha('#0F172A', 0.12);
  }, [sheetBg]);

  const sendIconDisabled = withAlpha(sendActive, 0.4);
  const stopSquareColor = pickReadableText(centerRed, '#111827', '#FFFFFF');

  // ───────────────── helpers ─────────────────
  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const resetState = () => {
    setMode('idle');
    setRecording(null);
    setSound(null);
    setStartTimeMs(null);
    setElapsedMs(0);
    setRecordedUri(null);
    setFinalDurationMs(0);
    setPlaybackPosMs(0);
    setIsPlaying(false);
    setAmplitudeBars(Array.from({ length: BAR_COUNT }, () => 0.2));
  };

  const cleanupAll = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    if (waveTimerRef.current) clearInterval(waveTimerRef.current);
    waveTimerRef.current = null;

    try {
      await recording?.stopAndUnloadAsync();
    } catch {}
    try {
      await sound?.unloadAsync();
    } catch {}

    setRecording(null);
    setSound(null);
    setIsPlaying(false);
  };

  // ───────────────── effects ─────────────────
  useEffect(() => {
    if (!visible) {
      cleanupAll();
      return;
    }
    resetState();
    return () => {
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (mode === 'recording' && startTimeMs != null) {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        const diff = Date.now() - startTimeMs;
        setElapsedMs(diff);
      }, 200);
      return () => {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      };
    } else {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, [mode, startTimeMs]);

  useEffect(() => {
    if (mode === 'recording') {
      waveTimerRef.current = setInterval(() => {
        setAmplitudeBars((prev) => prev.map(() => Math.random() * 0.8 + 0.2));
      }, 100);
    } else {
      if (waveTimerRef.current) clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
      setAmplitudeBars((prev) => prev.map(() => 0.2));
    }
    return () => {
      if (waveTimerRef.current) clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
    };
  }, [mode]);

  // ───────────────── recording ─────────────────
  const startRecording = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });

      await rec.startAsync();

      setRecording(rec);
      setMode('recording');
      setStartTimeMs(Date.now());
      setElapsedMs(0);
    } catch (err) {
      console.warn('startRecording error:', err);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const st: any = await recording.getStatusAsync();
      const dur = st.durationMillis ?? 0;

      setRecordedUri(uri ?? null);
      setFinalDurationMs(dur);
      setPlaybackPosMs(0);

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;

      setMode('review');
    } catch (err) {
      console.warn('stopRecording error:', err);
    }
  }, [recording]);

  // ───────────────── playback ─────────────────
  const togglePlayPause = useCallback(async () => {
    if (!recordedUri) return;

    if (!sound) {
      const s = new Audio.Sound();
      await s.loadAsync({ uri: recordedUri }, {}, false);

      s.setOnPlaybackStatusUpdate(async (st: any) => {
        if (!st.isLoaded) return;

        if (st.positionMillis != null) {
          setPlaybackPosMs(st.positionMillis);
        }

        if (st.isPlaying) setIsPlaying(true);
        else setIsPlaying(false);

        if (st.didJustFinish) {
          setIsPlaying(false);
          setPlaybackPosMs(finalDurationMs);
        }
      });

      setSound(s);
      await s.playAsync();
      setIsPlaying(true);
    } else {
      const st: any = await sound.getStatusAsync();
      const ended =
        st.isLoaded &&
        st.durationMillis != null &&
        st.positionMillis != null &&
        st.positionMillis >= st.durationMillis;

      if (st.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        if (ended) {
          await sound.setPositionAsync(0);
          setPlaybackPosMs(0);
        }
        await sound.playAsync();
        setIsPlaying(true);
      }
    }
  }, [finalDurationMs, recordedUri, sound]);

  // ───────────────── redo/send ─────────────────
  const redo = useCallback(async () => {
    try {
      await cleanupAll();
    } catch {}
    resetState();
  }, []);

  const handleSend = useCallback(async () => {
    if (!recordedUri) return;
    try {
      await onSend(recordedUri, finalDurationMs);
      onClose();
    } catch (err) {
      console.warn('send voice failed:', err);
    }
  }, [finalDurationMs, onClose, onSend, recordedUri]);

  // ───────────────── UI parts ─────────────────
  const renderAmplitudeWave = () => {
    // 표 기준: 파형은 Red(#FF3B30)
    // (themeColor는 fallback만)
    const rgb = hexToRgb(waveRed) ?? hexToRgb(themeColor) ?? { r: 255, g: 59, b: 48 };
    return (
      <View style={styles.waveRow}>
        {amplitudeBars.map((v, idx) => {
          const barH = 16 * v;
          const ratio = idx / Math.max(1, amplitudeBars.length - 1); // 0~1
          const alphaBase = 0.55 + 0.45 * (1 - ratio);
          const brightness = 0.9 + Math.random() * 0.1;
          const alpha = Math.max(0.1, Math.min(1, alphaBase * brightness));
          const color = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;

          return (
            <View
              key={idx}
              style={[
                styles.waveBar,
                {
                  height: barH,
                  backgroundColor: color,
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  const renderTopPill = () => {
    if (mode === 'review') {
      return (
        <View style={styles.pillRow}>
          <View style={[styles.reviewPillNew, { backgroundColor: pillBg, borderColor: pillLine }]}>
            <Pressable style={[styles.reviewPlayBtn, { backgroundColor: playBtnBg }]} onPress={togglePlayPause}>
              {isPlaying ? (
                <Pause size={20} color={t.baseText} strokeWidth={2} />
              ) : (
                <Play size={20} color={t.baseText} strokeWidth={2} />
              )}
            </Pressable>

            <View style={styles.reviewBarAreaNew}>
              <View style={[styles.reviewBarBgNew, { backgroundColor: pillTrackBg }]}>
                <View
                  style={[
                    styles.reviewBarFgNew,
                    {
                      width: `${playRatio * 100}%`,
                      backgroundColor: t.playbackText,
                    },
                  ]}
                />
              </View>
            </View>

            <Text style={[styles.timeTextReviewNew, { color: t.playbackText }]}>{fmt(playbackPosMs)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.pillRow}>
        <View style={[styles.recordPill, { backgroundColor: pillBg, borderColor: pillLine }]}>
          <View style={styles.recordLeftArea}>
            {mode === 'recording' ? renderAmplitudeWave() : <View style={[styles.idleLineBg, { backgroundColor: pillTrackBg }]} />}
          </View>

          <Text style={[styles.timeTextRecord, { color: t.baseText }]}>
            {mode === 'recording' ? fmt(elapsedMs) : fmt(0)}
          </Text>
        </View>
      </View>
    );
  };

  const renderBottomRow = () => {
    if (mode === 'review') {
      return (
        <View style={styles.bottomRow}>
          <Pressable style={styles.bottomSide} onPress={onClose}>
            <Text style={[styles.bottomLabel, { color: t.cancelText }]}>취소</Text>
          </Pressable>

          <View style={styles.bottomCenter}>
            <Pressable
              style={[
                styles.circleBtnBorder,
                { backgroundColor: circleBg, borderColor: circleBorder },
              ]}
              onPress={redo}
            >
              <RotateCcw size={24} color={t.baseText} strokeWidth={2} />
            </Pressable>
          </View>

          <Pressable style={styles.bottomSideRight} onPress={handleSend}>
            <View
              style={[
                styles.circleBtnSolid,
                {
                  backgroundColor: circleBg,
                  borderWidth: 2,
                  borderColor: circleBorder,
                },
              ]}
            >
              <Send size={22} color={sendActive} strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      );
    }

    const middleBtn =
      mode === 'idle' ? (
        <Pressable
          style={[
            styles.circleBtnBorder,
            { backgroundColor: circleBg, borderColor: circleBorder },
          ]}
          onPress={startRecording}
        >
          <View style={[styles.idleDot, { backgroundColor: centerRed }]} />
        </Pressable>
      ) : (
        <Pressable
          style={[styles.circleBtnSolid, { backgroundColor: centerRed }]}
          onPress={stopRecording}
        >
          <View style={[styles.stopSquare, { backgroundColor: stopSquareColor }]} />
        </Pressable>
      );

    return (
      <View style={styles.bottomRow}>
        <Pressable style={styles.bottomSide} onPress={onClose}>
          <Text style={[styles.bottomLabel, { color: t.cancelText }]}>취소</Text>
        </Pressable>

        <View style={styles.bottomCenter}>{middleBtn}</View>

        <View style={styles.bottomSideRight}>
          <View
            style={[
              styles.circleBtnBorderDisabled,
              { backgroundColor: circleBg, borderColor: circleBorder, opacity: 0.6 },
            ]}
          >
            <Send size={22} color={sendIconDisabled} strokeWidth={2.5} />
          </View>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          {renderTopPill()}
          {renderBottomRow()}

          <View style={styles.bottomHandleWrap}>
            <View style={[styles.bottomHandleLine, { backgroundColor: handleLineBg }]} />
          </View>
        </View>
      </View>

      {mode === 'recording' && !recording ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator />
        </View>
      ) : null}
    </Modal>
  );
}

/* ================= styles ================= */

const PILL_HEIGHT = 40;
const PILL_RADIUS = 8;
const MAIN_BTN_SIZE = 44;
const REVIEW_PLAY_BTN = 32;
const MAX_WAVE_HEIGHT = 16;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },

  pillRow: {
    width: '100%',
    marginBottom: 20,
  },

  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  recordLeftArea: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  idleLineBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
  },

  waveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: MAX_WAVE_HEIGHT,
  },
  waveBar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
  },

  timeTextRecord: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'right',
  },

  reviewPillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  reviewPlayBtn: {
    width: REVIEW_PLAY_BTN,
    height: REVIEW_PLAY_BTN,
    borderRadius: REVIEW_PLAY_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  reviewBarAreaNew: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  reviewBarBgNew: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  reviewBarFgNew: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },

  timeTextReviewNew: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  bottomSide: {
    minWidth: 60,
    justifyContent: 'flex-start',
  },
  bottomSideRight: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCenter: {
    flex: 1,
    alignItems: 'center',
  },

  bottomLabel: {
    fontSize: 16,
    fontWeight: '700',
  },

  circleBtnBorder: {
    width: MAIN_BTN_SIZE,
    height: MAIN_BTN_SIZE,
    borderRadius: MAIN_BTN_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnBorderDisabled: {
    width: MAIN_BTN_SIZE,
    height: MAIN_BTN_SIZE,
    borderRadius: MAIN_BTN_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnSolid: {
    width: MAIN_BTN_SIZE,
    height: MAIN_BTN_SIZE,
    borderRadius: MAIN_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  idleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  stopSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },

  bottomHandleWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  bottomHandleLine: {
    width: '100%',
    height: 4,
    borderRadius: 2,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
