// src/screens/chat/components/MessageList/MessageAudio.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  uri: string;          // 오디오 URL (normalizeMessage → msg.content)
  isMe: boolean;        // 내가 보낸 메시지인지 여부
  durationMs?: number;  // (선택) 서버/메타에서 받은 전체 길이
};

// mm:ss 표시 전용 (숫자만 쓰면 되므로 단순 버전)
const formatTime = (ms: number) => {
  const secRaw = Math.round(ms / 1000);
  const sec = secRaw < 0 ? 0 : secRaw;
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function MessageAudio({ uri, isMe, durationMs }: Props) {
  // ====== 오디오 재생 상태 ======
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(durationMs ?? 0);

  // 언마운트 시 사운드 해제
  useEffect(() => {
    return () => {
      (async () => {
        try {
          await sound?.unloadAsync();
        } catch {}
      })();
    };
  }, [sound]);

  const onStatusUpdate = (st: any) => {
    if (!st.isLoaded) return;
    if (typeof st.durationMillis === 'number') {
      setDur(st.durationMillis);
    }
    setPlaying(!!st.isPlaying);
    setPos(st.positionMillis ?? 0);
  };

  const togglePlay = async () => {
    if (!uri) return;

    // 아직 로드 안 했으면 로드 후 재생
    if (!sound) {
      const s = new Audio.Sound();
      await s.loadAsync({ uri }, {}, false);
      s.setOnPlaybackStatusUpdate(onStatusUpdate);
      setSound(s);
      await s.playAsync();
      return;
    }

    const st: any = await sound.getStatusAsync();
    if (!st.isLoaded) return;

    if (st.isPlaying) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      // 끝까지 간 상태면 처음으로 되감기
      if (
        st.didJustFinish ||
        (typeof st.positionMillis === 'number' &&
          typeof st.durationMillis === 'number' &&
          st.positionMillis >= st.durationMillis - 250)
      ) {
        await sound.setPositionAsync(0);
      }
      await sound.playAsync();
      setPlaying(true);
    }
  };

  // 진행률 계산
  const total = dur || durationMs || 0;
  const effectivePos = playing ? pos : total;
  const ratio =
    total > 0 ? Math.max(0, Math.min(1, effectivePos / total)) : 0;

  // ====== y 값 기반 그라데이션 (텍스트 메시지와 동일 로직) ======
  const rowRef = useRef<View | null>(null);
  const rowY = useSharedValue(0);

  useEffect(() => {
    const updatePosition = () => {
      if (rowRef.current) {
        rowRef.current.measureInWindow((_x, y) => {
          rowY.value = withTiming(y, { duration: 100 });
        });
      }
    };
    updatePosition();
    const id = setInterval(updatePosition, 80);
    return () => clearInterval(id);
  }, [rowY]);

  const animatedColor = useDerivedValue(() => {
    const relativeY =
      (rowY.value % (SCREEN_HEIGHT * 1.2)) /
      (SCREEN_HEIGHT * 1.2);
    const t = Math.max(0, Math.min(1, relativeY));

    const mineColor = interpolateColor(
      t,
      [0, 0.5, 1],
      ['#833ab4', '#fd1d1d', '#fcb045'], // 인스타 그라데이션
    );
    const theirsColor = interpolateColor(
      t,
      [0, 0.5, 1],
      [
        'rgba(131,58,180,0.08)',
        'rgba(253,29,29,0.08)',
        'rgba(252,176,69,0.08)',
      ],
    );

    return isMe ? mineColor : theirsColor;
  });

  const bubblePositionStyle = useAnimatedStyle(() => ({
    backgroundColor: withSpring(animatedColor.value, {
      stiffness: 200,
      damping: 15,
      mass: 0.5,
    }),
  }));

  const timeColor = isMe
    ? 'rgba(255,255,255,0.9)'
    : '#0f172a';

  return (
    <View
      style={[
        styles.row,
        isMe ? styles.rowMe : styles.rowYou,
      ]}
    >
      <Animated.View
        ref={rowRef}
        style={[
          isMe ? styles.voiceMine : styles.voiceTheirs,
          bubblePositionStyle,
        ]}
      >
        <View style={styles.audioBubbleWrap}>
          {/* ▶ / || 버튼 */}
          <Pressable
            style={styles.audioPlayBtn}
            onPress={togglePlay}
          >
            <View style={styles.audioPlayIconCircle}>
              <Text
                style={[
                  styles.audioPlayIcon,
                  isMe ? { color: '#fff' } : { color: '#0f172a' },
                ]}
              >
                {playing ? '❚❚' : '▶'}
              </Text>
            </View>
          </Pressable>

          {/* 진행 바 + 길이 */}
          <View style={styles.audioBarOuter}>
            <View
              style={[
                styles.audioBar,
                isMe
                  ? {
                      backgroundColor: 'rgba(255,255,255,0.3)',
                      minWidth: 130,
                    }
                  : { backgroundColor: '#e2e8f0', minWidth: 130 },
              ]}
            >
              <View
                style={[
                  styles.audioBarFill,
                  { width: `${ratio * 100}%` },
                  isMe
                    ? { backgroundColor: '#fff' }
                    : { backgroundColor: '#0f172a' },
                ]}
              />
            </View>
            <Text
              style={[styles.audioDur, { color: timeColor }]}
            >
              {formatTime(playing ? pos : total || 0)}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingHorizontal: 10,
    marginVertical: 2,
  },
  rowMe: {
    alignItems: 'flex-end',
  },
  rowYou: {
    alignItems: 'flex-start',
  },

  // 원래 Chat.tsx 의 voiceMine / voiceTheirs 기반
  voiceMine: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  voiceTheirs: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: '#f8fafc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },

  audioBubbleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  audioPlayBtn: {
    height: 40,
    justifyContent: 'center',
  },
  audioPlayIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayIcon: {
    fontSize: 13,
    fontWeight: '800',
  },
  audioBarOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioBar: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  audioBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  audioDur: {
    fontSize: 12,
    fontWeight: '700',
  },
});
