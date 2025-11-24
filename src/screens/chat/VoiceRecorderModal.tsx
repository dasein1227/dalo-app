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

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (uri: string, durationMs: number) => Promise<void>;
  themeColor: string; // 우리 포인트 컬러 (빨강)
};

export default function VoiceRecorderModal({
  visible,
  onClose,
  onSend,
  themeColor,
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
    Array.from({ length: BAR_COUNT }, () => 0.2)
  );

  const playRatio =
    finalDurationMs > 0
      ? Math.min(playbackPosMs / finalDurationMs, 1)
      : 0;

  // ───────────────── helpers ─────────────────
  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const mm = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
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
        setAmplitudeBars(prev =>
          prev.map(() => Math.random() * 0.8 + 0.2) // 0.2 ~ 1.0
        );
      }, 100);
    } else {
      if (waveTimerRef.current) clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
      setAmplitudeBars(prev => prev.map(() => 0.2));
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
    const rgb = hexToRgb(themeColor) ?? { r: 217, g: 76, b: 43 }; // fallback 빨강
    return (
      <View style={styles.waveRow}>
        {amplitudeBars.map((v, idx) => {
          const barH = 16 * v;
          const ratio = idx / Math.max(1, amplitudeBars.length - 1); // 0~1
          // 왼쪽(진) -> 오른쪽(옅음) 그라데이션 + 약간의 밝기 랜덤
          const alphaBase = 0.55 + 0.45 * (1 - ratio);
          const brightness = 0.9 + Math.random() * 0.1; // 0.9~1.0
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
          <View style={styles.reviewPillNew}>
            <Pressable style={styles.reviewPlayBtn} onPress={togglePlayPause}>
              {isPlaying ? (
                <Pause size={20} color="#0f172a" strokeWidth={2} />
              ) : (
                <Play size={20} color="#0f172a" strokeWidth={2} />
              )}
            </Pressable>

            <View style={styles.reviewBarAreaNew}>
              <View style={styles.reviewBarBgNew}>
                <View
                  style={[
                    styles.reviewBarFgNew,
                    {
                      width: `${playRatio * 100}%`,
                      backgroundColor: themeColor,
                    },
                  ]}
                />
              </View>
            </View>

            <Text style={styles.timeTextReviewNew}>{fmt(playbackPosMs)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.pillRow}>
        <View style={styles.recordPill}>
          <View style={styles.recordLeftArea}>
            {mode === 'recording' ? renderAmplitudeWave() : <View style={styles.idleLineBg} />}
          </View>

          <Text style={styles.timeTextRecord}>
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
            <Text style={styles.bottomLabel}>취소</Text>
          </Pressable>

          <View style={styles.bottomCenter}>
            <Pressable style={styles.circleBtnBorder} onPress={redo}>
              <RotateCcw size={24} color="#0f172a" strokeWidth={2} />
            </Pressable>
          </View>

          <Pressable style={styles.bottomSideRight} onPress={handleSend}>
            <View style={[styles.circleBtnSolid, styles.sendBtnBgActive]}>
              <Send size={22} color="#0A4BFF" strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      );
    }

    const middleBtn =
      mode === 'idle' ? (
        <Pressable style={styles.circleBtnBorder} onPress={startRecording}>
          <View style={styles.idleDot} />
        </Pressable>
      ) : (
        <Pressable
          style={[styles.circleBtnSolid, { backgroundColor: themeColor }]}
          onPress={stopRecording}
        >
          <View style={styles.stopSquare} />
        </Pressable>
      );

    return (
      <View style={styles.bottomRow}>
        <Pressable style={styles.bottomSide} onPress={onClose}>
          <Text style={styles.bottomLabel}>취소</Text>
        </Pressable>

        <View style={styles.bottomCenter}>{middleBtn}</View>

        <View style={styles.bottomSideRight}>
          <View style={[styles.circleBtnBorderDisabled]}>
            <Send size={22} color="rgba(10,75,255,0.4)" strokeWidth={2.5} />
          </View>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {renderTopPill()}
          {renderBottomRow()}

          <View style={styles.bottomHandleWrap}>
            <View style={styles.bottomHandleLine} />
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
    backgroundColor: '#fff',
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
    backgroundColor: '#F1F2F5',
    borderRadius: PILL_RADIUS,
    paddingHorizontal: 12,
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
    backgroundColor: '#D7DAE1',
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
    // backgroundColor는 코드에서 동적으로 덮어씀
  },

  timeTextRecord: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E2533',
    minWidth: 56,
    textAlign: 'right',
  },

  reviewPillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    backgroundColor: '#F1F2F5',
    borderRadius: PILL_RADIUS,
    paddingHorizontal: 12,
  },

  reviewPlayBtn: {
    width: REVIEW_PLAY_BTN,
    height: REVIEW_PLAY_BTN,
    borderRadius: REVIEW_PLAY_BTN / 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
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
    backgroundColor: '#D7DAE1',
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
    color: '#0f172a',
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
    color: '#0f172a',
  },

  circleBtnBorder: {
    width: MAIN_BTN_SIZE,
    height: MAIN_BTN_SIZE,
    borderRadius: MAIN_BTN_SIZE / 2,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E0E3E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnBorderDisabled: {
    width: MAIN_BTN_SIZE,
    height: MAIN_BTN_SIZE,
    borderRadius: MAIN_BTN_SIZE / 2,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E0E3E9',
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
  sendBtnBgActive: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E0E3E9',
  },

  idleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D94C2B',
  },
  stopSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#fff',
  },

  bottomHandleWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  bottomHandleLine: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7DAE1',
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
