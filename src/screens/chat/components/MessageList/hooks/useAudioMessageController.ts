import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import { ensureOriginalCached, isLocalMediaUri, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

function isLoadedStatus(
  status: AVPlaybackStatus,
): status is AVPlaybackStatus & {
  isLoaded: true;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis?: number;
  didJustFinish: boolean;
} {
  return (status as any)?.isLoaded === true;
}

export function useAudioMessageController(opts: {
  msgIdStr: string;
  rawContent: string;
  rawOriginal: any;
  maskOnly: boolean;
  meta: any;
  /** 보안모드 음성은 일반 보존 저장소에 남기지 않는다. */
  disableCache?: boolean;
  /** 데이터관리에서 채팅방 단위로 집계/삭제하기 위한 room id. */
  cacheRoomId?: number | string | null;
  mime?: string | null;
}) {
  const {
    msgIdStr,
    rawContent,
    rawOriginal,
    maskOnly,
    meta,
    disableCache = false,
    cacheRoomId = null,
    mime = 'audio/m4a',
  } = opts;
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [durMs, setDurMs] = useState<number>(() => {
    const d = typeof meta?.durationMs === 'number' ? meta.durationMs : 0;
    return d > 0 ? d : 0;
  });

  useEffect(() => {
    if (maskOnly) return;
    setIsPlaying(false);
    setPosMs(0);
    const d = typeof meta?.durationMs === 'number' ? meta.durationMs : 0;
    setDurMs(d > 0 ? d : 0);
  }, [msgIdStr, rawContent, rawOriginal, maskOnly, meta]);

  useEffect(() => {
    if (maskOnly) return;
    return () => {
      const s = soundRef.current;
      soundRef.current = null;
      if (s) s.unloadAsync().catch(() => {});
    };
  }, [maskOnly]);

  const attachStatusListener = (sound: Audio.Sound) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!isLoadedStatus(status)) return;
      const d = status.durationMillis ?? 0;
      if (d > 0) setDurMs(d);
      setPosMs(status.positionMillis ?? 0);
      setIsPlaying(!!status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosMs(0);
      }
    });
  };

  const ensureSoundLoaded = useCallback(async (uri: string) => {
    if (soundRef.current) return soundRef.current;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, positionMillis: 0 });
    attachStatusListener(sound);
    soundRef.current = sound;
    return sound;
  }, []);

  const resolvePlayableUri = useCallback(
    async (uri: string) => {
      const rawUri = String(uri ?? '').trim();
      if (!rawUri) return '';

      // 보안모드/이미 로컬인 파일/비원격 URI는 절대 일반 보존 저장소에 넣지 않는다.
      if (disableCache || isLocalMediaUri(rawUri) || !isRemoteHttpUrl(rawUri)) {
        return rawUri;
      }

      try {
        const localUri = await ensureOriginalCached(rawUri, {
          roomId: cacheRoomId,
          assetType: 'audio',
          mime: mime || 'audio/m4a',
        });
        return localUri || rawUri;
      } catch {
        return rawUri;
      }
    },
    [cacheRoomId, disableCache, mime],
  );

  const toggleVoice = useCallback(
    async (uri: string) => {
      if (maskOnly) return;

      try {
        const playableUri = await resolvePlayableUri(uri);
        if (!playableUri) return;

        const sound = await ensureSoundLoaded(playableUri);
        const st = await sound.getStatusAsync();
        if (!isLoadedStatus(st)) return;

        if (st.isPlaying) await sound.pauseAsync();
        else {
          const effectiveDur = durMs > 0 ? durMs : (st.durationMillis ?? 0);
          if (st.didJustFinish || (effectiveDur > 0 && st.positionMillis >= effectiveDur)) {
            await sound.setPositionAsync(0);
          }
          await sound.playAsync();
        }
      } catch {}
    },
    [durMs, ensureSoundLoaded, maskOnly, resolvePlayableUri],
  );

  const progress = durMs > 0 ? Math.max(0, Math.min(1, posMs / durMs)) : 0;

  return { isPlaying, posMs, durMs, progress, toggleVoice };
}
