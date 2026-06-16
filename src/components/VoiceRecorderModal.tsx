// src/components/VoiceRecorderModal.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated as RNAnimated,
} from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause, Send, Mic, Square, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import ReAnimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming, 
  cancelAnimation 
} from 'react-native-reanimated';

import {
  getVoiceRecorderModalTheme,
  type ChatRoomType,
  type ChatTheme,
} from '../screens/chat/theme/chatTheme';

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

function resampleWaveform(data: number[], targetCount: number) {
  if (!data || data.length === 0) return Array(targetCount).fill(0.05);
  if (data.length === targetCount) return data;
  const result: number[] = [];
  const step = data.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    const avg = (end - start) > 0 ? sum / (end - start) : data[start];
    result.push(Math.max(0.05, Math.min(1, avg)));
  }
  return result;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (uri: string, durationMs: number, waveform: number[]) => Promise<void>;
  roomType?: ChatRoomType;
  room?: any;
  theme?: ChatTheme;
};

const MODAL_HEIGHT = 320;
const BAR_COUNT = 30;

export default function VoiceRecorderModal({
  visible,
  onClose,
  onSend,
  roomType,
  room,
  theme,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const background = theme?.background?.toLowerCase();
  const tintColor = theme?.tintColor?.toLowerCase();
  const isDark = background === '#000000' || background === '#111827';
  const isCoonnDark =
    roomType === 'coonn_dark' ||
    room?.type === 'coonn_dark' ||
    (background === '#000000' && tintColor === '#f2f2f7');

  const recorderTheme = getVoiceRecorderModalTheme(
    isCoonnDark ? 'coonn_dark' : room ?? roomType ?? 'dm',
  );

  const sheetBg = isCoonnDark
    ? recorderTheme.modalBg
    : theme?.headerBg ?? (isDark ? '#1F2937' : '#FFFFFF');
  const textColor = isCoonnDark
    ? recorderTheme.baseText
    : theme?.headerText ?? (isDark ? '#F9FAFB' : '#111827');
  const subTextColor = isCoonnDark
    ? recorderTheme.playbackText
    : isDark
      ? '#9CA3AF'
      : '#6B7280';
  const accentColor = isCoonnDark
    ? recorderTheme.centerButton
    : theme?.tintColor ?? theme?.sendButtonActive ?? '#3B82F6';
  const sendActiveColor = isCoonnDark ? recorderTheme.sendActive : accentColor;
  const dangerColor = isCoonnDark ? recorderTheme.waveHighlight : '#FF3B30';

  const waveInactiveColor = isDark ? '#4B5563' : '#D1D5DB';
  const disabledSendBtnBg = isDark ? '#374151' : '#E5E7EB';
  const disabledSendIconColor = isDark ? '#6B7280' : '#9CA3AF';

  const [mode, setMode] = useState<'idle' | 'recording' | 'review'>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [finalDurationMs, setFinalDurationMs] = useState(0);
  const [playbackPosMs, setPlaybackPosMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordedLevels, setRecordedLevels] = useState<number[]>([]);

  const translateY = useRef(new RNAnimated.Value(MODAL_HEIGHT)).current;

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    const shouldPulse = (mode === 'recording' && recording) || (mode === 'review' && isPlaying);
    if (shouldPulse) {
      pulseScale.value = withRepeat(withTiming(1.6, { duration: 1100 }), -1, false);
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 200 }), withTiming(0, { duration: 900 })),
        -1,
        false
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = 1;
      pulseOpacity.value = 0;
    }
  }, [mode, recording, isPlaying]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const closeSheet = useCallback(() => {
    RNAnimated.timing(translateY, {
      toValue: MODAL_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [translateY, onClose]);

  const cleanupAll = async () => {
    try { await recording?.stopAndUnloadAsync(); } catch {}
    try { await sound?.unloadAsync(); } catch {}
    setRecording(null);
    setSound(null);
    setIsPlaying(false);
  };

  const resetState = () => {
    setMode('idle');
    setElapsedMs(0);
    setRecordedUri(null);
    setFinalDurationMs(0);
    setPlaybackPosMs(0);
    setRecordedLevels([]);
  };

  useEffect(() => {
    if (visible) {
      resetState();
      RNAnimated.spring(translateY, {
        toValue: 0,
        damping: 24,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    } else {
      cleanupAll();
    }
    return () => { cleanupAll(); };
  }, [visible]);

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
        isMeteringEnabled: true,
        android: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android, extension: '.m4a' },
        ios: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios, extension: '.m4a' },
      });

      rec.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording) {
          setElapsedMs(status.durationMillis);
          const db = status.metering ?? -160;
          const MIN_DB = -50;
          const MAX_DB = -10;

          let level = 0.05;
          if (db > MIN_DB) {
            let normalized = (db - MIN_DB) / (MAX_DB - MIN_DB);
            normalized = Math.max(0, Math.min(1, normalized));
            level = Math.max(0.05, Math.pow(normalized, 1.5));
          }
          setRecordedLevels((prev) => [...prev, level]);
        }
      });
      rec.setProgressUpdateInterval(100);

      await rec.startAsync();
      setRecording(rec);
      setMode('recording');
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
      setRecordedUri(uri ?? null);
      setFinalDurationMs(st.durationMillis ?? 0);
      setPlaybackPosMs(0);
      setMode('review');
    } catch (err) {
      console.warn('stopRecording error:', err);
    }
  }, [recording]);

  const togglePlayPause = useCallback(async () => {
    if (!recordedUri) return;

    if (!sound) {
      const s = new Audio.Sound();
      await s.loadAsync({ uri: recordedUri }, {}, false);
      s.setOnPlaybackStatusUpdate(async (st: any) => {
        if (!st.isLoaded) return;
        if (st.positionMillis != null) setPlaybackPosMs(st.positionMillis);
        setIsPlaying(st.isPlaying);
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
      if (st.isPlaying) {
        await sound.pauseAsync();
      } else {
        if (st.positionMillis >= st.durationMillis) await sound.setPositionAsync(0);
        await sound.playAsync();
      }
    }
  }, [finalDurationMs, recordedUri, sound]);

  const handleSend = useCallback(async () => {
    if (!recordedUri) return;
    try {
      const compressedWaveform = resampleWaveform(recordedLevels, BAR_COUNT);
      await onSend(recordedUri, finalDurationMs, compressedWaveform);
      closeSheet();
    } catch (err) {
      console.warn('send voice failed:', err);
    }
  }, [finalDurationMs, closeSheet, onSend, recordedUri, recordedLevels]);

  const handleLeftPress = useCallback(() => {
    if (mode === 'review') {
      cleanupAll();
      resetState();
    } else {
      closeSheet();
    }
  }, [mode, closeSheet]);

  const handleCenterPress = useCallback(() => {
    if (mode === 'idle') startRecording();
    else if (mode === 'recording') stopRecording();
    else togglePlayPause();
  }, [mode, startRecording, stopRecording, togglePlayPause]);

  const renderWaveform = () => {
    let bars = Array(BAR_COUNT).fill(0.05);
    let color = waveInactiveColor;

    if (mode === 'recording') {
      const visibleLevels = recordedLevels.slice(-BAR_COUNT);
      bars = [...Array(Math.max(0, BAR_COUNT - visibleLevels.length)).fill(0.05), ...visibleLevels];
      color = dangerColor;
    } else if (mode === 'review') {
      bars = resampleWaveform(recordedLevels, BAR_COUNT);
      color = accentColor;
    }

    const playRatio = mode === 'review' && finalDurationMs > 0 ? playbackPosMs / finalDurationMs : 1;
    const progressIndex = Math.floor(playRatio * BAR_COUNT);

    return bars.map((lvl, i) => (
      <View 
        key={i} 
        style={[
          styles.waveBar, 
          { height: Math.max(4, lvl * 60), backgroundColor: (mode !== 'review' || i <= progressIndex) ? color : waveInactiveColor }
        ]} 
      />
    ));
  };

  if (!visible) return null;

  const centerBtnBg = mode === 'recording' ? dangerColor : accentColor;
  const currentPulseColor = mode === 'recording' ? withAlpha(dangerColor, 0.25) : withAlpha(accentColor, 0.25);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
        
        <RNAnimated.View style={[styles.sheet, { backgroundColor: sheetBg, transform: [{ translateY }], paddingBottom: Math.max(insets.bottom + 20, 30) }]}>
          
          <View style={styles.topArea}>
            <View style={styles.waveContainer}>
              {renderWaveform()}
            </View>
            
            <View style={styles.timerZone}>
              <Text style={[styles.timerText, { color: textColor }]}>
                {mode === 'review' ? fmt(playbackPosMs) : fmt(elapsedMs)}
              </Text>
              {mode === 'review' && (
                <Text style={[styles.durationText, { color: subTextColor }]}>
                  {t('chat:voiceRecorder.totalDuration', { duration: fmt(finalDurationMs) })}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.controlsRow}>
            <Pressable onPress={handleLeftPress} style={styles.sideBtnWrap}>
              <View style={styles.iconCircle}>
                {mode === 'review' 
                  ? <Trash2 color={subTextColor} size={26} strokeWidth={2} /> 
                  : <X color={subTextColor} size={30} strokeWidth={2} />
                }
              </View>
            </Pressable>

            <View style={styles.centerBtnWrap}>
              {mode === 'recording' && !recording ? (
                <ActivityIndicator color={dangerColor} size="large" />
              ) : (
                <View style={styles.mainBtnZone}>
                  <ReAnimated.View style={[StyleSheet.absoluteFill, styles.pulseCircle, { backgroundColor: currentPulseColor }, pulseStyle]} />
                  <Pressable onPress={handleCenterPress} style={[styles.mainBtn, { backgroundColor: centerBtnBg }]}>
                    {mode === 'idle' && <Mic color="#FFF" size={32} strokeWidth={2.5} />}
                    {mode === 'recording' && recording && <Square fill="#FFF" color="#FFF" size={24} />}
                    {mode === 'review' && (
                      isPlaying 
                        ? <Pause fill="#FFF" color="#FFF" size={30} /> 
                        : <Play fill="#FFF" color="#FFF" size={32} style={{ marginLeft: 4 }} />
                    )}
                  </Pressable>
                </View>
              )}
            </View>

            <Pressable 
              onPress={handleSend} 
              disabled={mode !== 'review'} 
              style={styles.sideBtnWrap}
            >
              <View style={[styles.sendCircle, { backgroundColor: mode === 'review' ? sendActiveColor : disabledSendBtnBg }]}>
                <Send color={mode === 'review' ? "#FFF" : disabledSendIconColor} size={20} strokeWidth={2.5} style={{ marginLeft: -2 }} />
              </View>
            </Pressable>
          </View>

        </RNAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 32, paddingHorizontal: 24 },
  topArea: { alignItems: 'center', marginBottom: 20 },
  waveContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 70, marginBottom: 12 },
  waveBar: { width: 2.5, borderRadius: 2, marginHorizontal: 1.5 },
  timerZone: { height: 70, alignItems: 'center', justifyContent: 'center' },
  timerText: { fontSize: 38, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  durationText: { fontSize: 14, fontWeight: '500', marginTop: 4 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  sideBtnWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  centerBtnWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainBtnZone: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  mainBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 2 },
  pulseCircle: { borderRadius: 36, zIndex: 1 },
  iconCircle: { padding: 10 },
  sendCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});