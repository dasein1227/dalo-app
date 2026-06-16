// src/components/MediaViewer.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  StatusBar,
  Modal,
  FlatList,
  Alert,
  Share as RNShare,
  useWindowDimensions,
  Platform,
  DeviceEventEmitter,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import {
  Download as DownloadIcon,
  Share2 as ShareIcon,
  Info as InfoIcon,
  MessageCircle,
  ArrowRight,
  ChevronLeft,
  Play as PlayIcon,
  Pause as PauseIcon,
  Volume2 as VolumeOnIcon,
  VolumeX as VolumeOffIcon,
} from "lucide-react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import PagerView from "react-native-pager-view";

import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import CoonnFloatingToast from "@/components/feedback/CoonnFloatingToast";
import { createCoonnFloatingToastTheme } from "@/components/feedback/CoonnFloatingToast.theme";
import { useCoonnFloatingToast } from "@/components/feedback/useCoonnFloatingToast";
import {
  ensureOriginalCached,
  ensureThumbnailCached,
  isRemoteHttpUrl,
} from "@/lib/media/chatMediaCache";

// expo-image를 Reanimated에서 사용할 수 있도록 래핑
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
const THUMB_STRIP_HEIGHT = 88;

// --- [테마 상수] ---
const THEME = {
  bg: "#F8F9FA",
  textMain: "#111827",
  textSub: "#6B7280",
  accent: "#FF5A7A",
};

type Row = {
  id: string | number;
  type: "image" | "video";
  file_bucket?: string | null;
  file_key?: string | null;
  mime?: string | null;
  sender?: string | null;
  sender_id?: string | null;
  nickname?: string | null;
  created_at?: string | null;
  message_uid?: string | null;
  messageUid?: string | null;
  room_seq?: number | null;
  roomSeq?: number | null;
  url?: string | null;
  uri?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  thumb_url?: string | null;
  thumbUrl?: string | null;
  is_secure?: boolean | null;
  isSecure?: boolean | null;
};

type Params = {
  roomId: number;
  rows?: Row[];
  index?: number;
  row?: Row;
  title?: any;
  subtitle?: any;
  bundleUris?: string[];
  bundleIndex?: number;
};

type ModalType = "download" | "share" | null;

type VideoControlState = {
  itemKey: string;
  isPlaying: boolean;
  hasEnded: boolean;
};

type VideoControlHandle = {
  itemKey: string;
  togglePlay: () => void;
  pause: () => void;
};

type MediaViewerNoticeTone = "default" | "success" | "danger";

let FileSystem: any = null;
let MediaLibrary: any = null;
let Sharing: any = null;

try {
  FileSystem = require("expo-file-system/legacy");
} catch {}
try {
  MediaLibrary = require("expo-media-library");
} catch {}
try {
  Sharing = require("expo-sharing");
} catch {}

function formatDateTimeKorean(value?: string | Date | null): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function safeString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}
function safeTrim(v: any): string {
  return safeString(v).trim();
}

const getRowKey = (r: Row): string => {
  const direct =
    safeTrim(r.url) ||
    safeTrim(r.uri) ||
    safeTrim(r.media_url) ||
    safeTrim(r.mediaUrl);
  if (direct) return `url:${direct}`;
  if (r.file_key) return `fk:${r.file_key}`;
  return `id:${String(r.id)}`;
};

function looksLikeUuid(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function isMeaninglessSubtitle(v: any) {
  const s = safeTrim(v);
  if (!s) return true;
  if (/^\d{6,}$/.test(s)) return true;
  if (/^\d{2,4}-\d{3,4}-\d{4}$/.test(s)) return true;
  if (looksLikeUuid(s)) return true;
  return false;
}

function isGenericMediaTitle(v: any) {
  const s = safeTrim(v);
  return (
    !s ||
    s === "사진" ||
    s === "사진/동영상" ||
    s === "이미지" ||
    s === "모아보기"
  );
}

function getSenderId(row?: Row | null) {
  return safeTrim(row?.sender ?? row?.sender_id);
}

function getMessageUid(row?: Row | null) {
  return safeTrim(row?.message_uid ?? row?.messageUid);
}

function getRoomSeq(row?: Row | null) {
  const value = Number(row?.room_seq ?? row?.roomSeq ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function getDirectMediaUri(row?: Row | null) {
  if (!row) return "";

  return (
    safeTrim(row.url) ||
    safeTrim(row.uri) ||
    safeTrim(row.media_url) ||
    safeTrim(row.mediaUrl) ||
    (/^https?:\/\//i.test(safeTrim(row.file_key)) ? safeTrim(row.file_key) : "")
  );
}

function getDirectThumbUri(row?: Row | null) {
  if (!row) return "";
  return safeTrim(row.thumb_url) || safeTrim(row.thumbUrl);
}

function isSecureMediaRow(row?: Row | null) {
  return row?.is_secure === true || row?.isSecure === true;
}

function getImmediatePublicUrl(row?: Row | null, isThumb: boolean = false) {
  if (!row) return "";

  if (isThumb) {
    const directThumb = getDirectThumbUri(row);
    if (directThumb) return directThumb;
  }

  const direct = getDirectMediaUri(row);
  if (direct) return direct;

  const bucket = safeTrim(row.file_bucket);
  const key = safeTrim(row.file_key);
  if (
    !bucket ||
    !key ||
    /^https?:\/\//i.test(key) ||
    /^(file|content):\/\//i.test(key)
  )
    return key;

  try {
    const transformOpt = isThumb
      ? { transform: { width: 120, height: 120, resize: "cover" as const } }
      : undefined;

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(key, transformOpt);
    return data?.publicUrl || "";
  } catch {
    return "";
  }
}

function clamp(n: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, n));
}

function GlassIconButton({
  onPress,
  children,
  disabled,
  variant = "dark",
  hitSlop = 10,
}: {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "dark" | "light";
  hitSlop?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        st.iconBtnBase,
        variant === "light" ? st.iconBtnLight : st.iconBtnDark,
        pressed && !disabled ? st.iconBtnPressed : null,
        disabled ? st.iconBtnDisabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

// --- [ZoomableImage] ---
type ZoomableImageProps = {
  uri: string;
  width: number;
  height: number;
  onToggleControls: () => void;
  setOuterScrollEnabled: (v: boolean) => void;
};

function ZoomableImage({
  uri,
  width,
  height,
  onToggleControls,
  setOuterScrollEnabled,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const isZoomedRef = useRef(false);
  const zoomedSV = useSharedValue(0);

  const notifyZoom = useCallback(
    (zoomed: boolean) => {
      if (isZoomedRef.current === zoomed) return;
      isZoomedRef.current = zoomed;
      setOuterScrollEnabled(!zoomed);
    },
    [setOuterScrollEnabled],
  );

  const setZoomed = useCallback(
    (zoomed: boolean) => {
      "worklet";
      const next = zoomed ? 1 : 0;
      if (zoomedSV.value === next) return;
      zoomedSV.value = next;
      runOnJS(notifyZoom)(zoomed);
    },
    [notifyZoom, zoomedSV],
  );

  const reset = useCallback(() => {
    scale.value = withTiming(1, { duration: 180 });
    savedScale.value = 1;
    tx.value = withTiming(0, { duration: 180 });
    ty.value = withTiming(0, { duration: 180 });
    savedTx.value = 0;
    savedTy.value = 0;
    runOnJS(notifyZoom)(false);
  }, [notifyZoom, scale, savedScale, tx, ty, savedTx, savedTy]);

  const pinch = useMemo(() => {
    return Gesture.Pinch()
      .onBegin(() => {
        setZoomed(true);
      })
      .onUpdate((e) => {
        const nextScale = clamp(savedScale.value * e.scale, 1, 4);
        scale.value = nextScale;
        setZoomed(nextScale > 1.01);
      })
      .onEnd(() => {
        const s = scale.value;
        if (s <= 1.01) {
          runOnJS(reset)();
          return;
        }
        savedScale.value = s;
        setZoomed(true);
        const maxX = (width * (s - 1)) / 2;
        const maxY = (height * (s - 1)) / 2;
        tx.value = clamp(tx.value, -maxX, maxX);
        ty.value = clamp(ty.value, -maxY, maxY);
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
  }, [
    height,
    reset,
    savedScale,
    scale,
    setZoomed,
    tx,
    ty,
    savedTx,
    savedTy,
    width,
  ]);

  const pan = useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .activeOffsetX([-6, 6])
      .activeOffsetY([-6, 6])
      .onTouchesMove((_, state) => {
        if (scale.value <= 1.01) {
          state.fail();
          return;
        }
        state.activate();
      })
      .onBegin(() => {
        setZoomed(scale.value > 1.01);
      })
      .onUpdate((e) => {
        const s = scale.value;
        if (s <= 1.01) return;
        const maxX = (width * (s - 1)) / 2;
        const maxY = (height * (s - 1)) / 2;
        const nextX = savedTx.value + e.translationX;
        const nextY = savedTy.value + e.translationY;
        tx.value = clamp(nextX, -maxX, maxX);
        ty.value = clamp(nextY, -maxY, maxY);
      })
      .onEnd(() => {
        const s = scale.value;
        if (s <= 1.01) {
          runOnJS(reset)();
          return;
        }
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        setZoomed(true);
      });
  }, [height, reset, savedTx, savedTy, scale, setZoomed, tx, ty, width]);

  const doubleTap = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(220)
      .onEnd((e) => {
        const s = scale.value;
        if (s > 1.01) {
          runOnJS(reset)();
          return;
        }
        const target = 2;
        const dx = (width / 2 - e.x) * (target - 1);
        const dy = (height / 2 - e.y) * (target - 1);
        const maxX = (width * (target - 1)) / 2;
        const maxY = (height * (target - 1)) / 2;
        const cx = clamp(dx, -maxX, maxX);
        const cy = clamp(dy, -maxY, maxY);
        scale.value = withTiming(target, { duration: 160 });
        savedScale.value = target;
        tx.value = withTiming(cx, { duration: 160 });
        ty.value = withTiming(cy, { duration: 160 });
        savedTx.value = cx;
        savedTy.value = cy;
        setZoomed(true);
      });
  }, [
    height,
    reset,
    savedScale,
    scale,
    setZoomed,
    tx,
    ty,
    savedTx,
    savedTy,
    width,
  ]);

  const singleTap = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(1)
      .maxDelay(240)
      .onEnd(() => {
        runOnJS(onToggleControls)();
      });
  }, [onToggleControls]);

  const taps = useMemo(
    () => Gesture.Exclusive(doubleTap, singleTap),
    [doubleTap, singleTap],
  );
  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, pan, taps),
    [pinch, pan, taps],
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <AnimatedExpoImage
        source={{ uri }}
        style={[st.mainImage as any, animatedStyle]}
        contentFit="contain"
      />
    </GestureDetector>
  );
}

type MediaUrlResolver = (row: Row, isThumb?: boolean) => Promise<string>;

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

type VideoPlayerSurfaceProps = {
  itemKey: string;
  uri: string;
  isActive: boolean;
  width: number;
  height: number;
  controlsVisible: boolean;
  bottomReserve: number;
  onToggleControls: () => void;
  onAutoHideControls: () => void;
  onShowControls: () => void;
  onVideoControlChange?: (state: VideoControlState) => void;
  onRegisterVideoControl?: (itemKey: string, control: VideoControlHandle | null) => void;
};

function VideoPlayerSurface({
  itemKey,
  uri,
  isActive,
  width,
  height,
  controlsVisible,
  bottomReserve,
  onToggleControls,
  onAutoHideControls,
  onShowControls,
  onVideoControlChange,
  onRegisterVideoControl,
}: VideoPlayerSurfaceProps) {
  const stableUri = useMemo(() => String(uri ?? "").trim(), [uri]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const progressWidthRef = useRef(1);
  const mountedRef = useRef(true);

  const player = useVideoPlayer(stableUri, (nextPlayer: any) => {
    try {
      nextPlayer.loop = false;
      nextPlayer.muted = false;
      nextPlayer.timeUpdateEventInterval = 0.22;
      nextPlayer.staysActiveInBackground = false;
      nextPlayer.showNowPlayingNotification = false;
    } catch {}
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        player.pause?.();
      } catch {}
    };
  }, [player]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsMuted(false);
    setHasEnded(false);
    try {
      player.pause?.();
      player.currentTime = 0;
      player.muted = false;
    } catch {}
  }, [player, stableUri]);

  useEffect(() => {
    if (isActive) return;
    try {
      player.pause?.();
    } catch {}
    setIsPlaying(false);
  }, [isActive, player]);

  useEffect(() => {
    try {
      player.muted = isMuted;
    } catch {}
  }, [isMuted, player]);

  useEffect(() => {
    if (!isActive) return;

    const readPlayerState = () => {
      if (!mountedRef.current) return;
      try {
        const nextCurrent = Math.max(0, Number(player.currentTime ?? 0));
        const nextDuration = Math.max(0, Number(player.duration ?? 0));
        const nextPlaying = Boolean(player.playing);
        const nextMuted = Boolean(player.muted);
        const ended =
          nextDuration > 0 && nextCurrent >= Math.max(0, nextDuration - 0.12) && !nextPlaying;

        setCurrentTime((prev) =>
          Math.abs(prev - nextCurrent) < 0.08 ? prev : nextCurrent,
        );
        setDuration((prev) =>
          Math.abs(prev - nextDuration) < 0.08 ? prev : nextDuration,
        );
        setIsPlaying((prev) => (prev === nextPlaying ? prev : nextPlaying));
        setIsMuted((prev) => (prev === nextMuted ? prev : nextMuted));
        setHasEnded((prev) => (prev === ended ? prev : ended));
      } catch {}
    };

    readPlayerState();
    const interval = setInterval(readPlayerState, 220);
    return () => clearInterval(interval);
  }, [isActive, player]);

  useEffect(() => {
    if (!isActive || !controlsVisible || !isPlaying || hasEnded) return;

    const timer = setTimeout(() => {
      onAutoHideControls();
    }, 2800);

    return () => clearTimeout(timer);
  }, [controlsVisible, hasEnded, isActive, isPlaying, onAutoHideControls]);

  useEffect(() => {
    if (!isActive || !hasEnded) return;

    onShowControls();
  }, [hasEnded, isActive, onShowControls]);

  const seekToRatio = useCallback(
    (ratioInput: number) => {
      const ratio = clamp01(ratioInput);
      const baseDuration = Number(duration || 0);
      if (!Number.isFinite(baseDuration) || baseDuration <= 0) return;

      const nextTime = Math.max(
        0,
        Math.min(baseDuration, baseDuration * ratio),
      );
      setCurrentTime(nextTime);
      setHasEnded(false);

      try {
        player.currentTime = nextTime;
      } catch {}
    },
    [duration, player],
  );

  const seekFromResponder = useCallback(
    (event: any) => {
      const x = Number(event?.nativeEvent?.locationX ?? 0);
      seekToRatio(x / Math.max(1, progressWidthRef.current));
    },
    [seekToRatio],
  );

  const pauseVideo = useCallback(() => {
    try {
      player.pause?.();
    } catch {}
    setIsPlaying(false);
  }, [player]);

  const togglePlay = useCallback(() => {
    try {
      const ended =
        hasEnded ||
        (duration > 0 && currentTime >= Math.max(0, duration - 0.12));

      if (isPlaying && !ended) {
        player.pause?.();
        setIsPlaying(false);
        return;
      }

      if (ended) {
        setCurrentTime(0);
        setHasEnded(false);
        try {
          player.replay?.();
        } catch {
          player.currentTime = 0;
        }
      }

      player.play?.();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [currentTime, duration, hasEnded, isPlaying, player]);

  useEffect(() => {
    onVideoControlChange?.({ itemKey, isPlaying, hasEnded });
  }, [hasEnded, isPlaying, itemKey, onVideoControlChange]);

  useEffect(() => {
    if (!onRegisterVideoControl) return;

    onRegisterVideoControl(itemKey, {
      itemKey,
      togglePlay,
      pause: pauseVideo,
    });

    return () => {
      onRegisterVideoControl(itemKey, null);
    };
  }, [itemKey, onRegisterVideoControl, pauseVideo, togglePlay]);

  const toggleMuted = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      player.muted = next;
    } catch {}
  }, [isMuted, player]);

  const progressRatio = duration > 0 ? clamp01(currentTime / duration) : 0;
  const videoControlsBottom = Math.max(6, bottomReserve + 4);
  const showCenterButton = controlsVisible && (!isPlaying || hasEnded);

  return (
    <View style={[st.videoStage, { width, height }]}>
      <VideoView
        player={player}
        style={st.videoPlayer}
        nativeControls={false}
        contentFit="contain"
        surfaceType={Platform.OS === "android" ? "textureView" : undefined}
        allowsPictureInPicture={false}
        startsPictureInPictureAutomatically={false}
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onToggleControls}
        android_disableSound
      />

      {showCenterButton && (
        <Pressable
          style={({ pressed }) => [
            st.videoCenterButton,
            pressed ? st.videoCenterButtonPressed : null,
          ]}
          onPress={togglePlay}
          hitSlop={12}
          android_disableSound
        >
          <PlayIcon
            size={36}
            color="#FFFFFF"
            fill="#FFFFFF"
            strokeWidth={0}
            style={st.videoPlayIcon}
          />
        </Pressable>
      )}

      {controlsVisible && (
        <View
          pointerEvents="box-none"
          style={[st.videoControlsOverlay, { bottom: videoControlsBottom }]}
        >
          <View style={st.videoControlsBar}>
            <Text style={st.videoTimeText}>{formatVideoTime(currentTime)}</Text>

            <View
              style={st.videoProgressTrack}
              onLayout={(event) => {
                progressWidthRef.current = Math.max(
                  1,
                  Number(event.nativeEvent.layout.width || 1),
                );
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={seekFromResponder}
              onResponderMove={seekFromResponder}
            >
              <View pointerEvents="none" style={st.videoProgressRail} />
              <View
                style={[
                  st.videoProgressFill,
                  { width: `${Math.max(0.5, progressRatio * 100)}%` },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  st.videoProgressKnob,
                  { left: `${progressRatio * 100}%` },
                ]}
              />
            </View>

            <Text style={st.videoTimeTextMuted}>
              {formatVideoTime(duration)}
            </Text>

            <Pressable
              style={st.videoMuteButton}
              onPress={toggleMuted}
              hitSlop={12}
              android_disableSound
            >
              {isMuted ? (
                <VolumeOffIcon size={21} color="#FFFFFF" strokeWidth={2.1} />
              ) : (
                <VolumeOnIcon size={21} color="#FFFFFF" strokeWidth={2.1} />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

type MediaPageProps = {
  item: Row;
  index: number;
  width: number;
  height: number;
  isActive: boolean;
  getUrl: MediaUrlResolver;
  onToggleControls: () => void;
  setOuterScrollEnabled: (v: boolean) => void;
  controlsVisible: boolean;
  videoBottomReserve: number;
  onAutoHideControls: () => void;
  onShowControls: () => void;
  onVideoControlChange: (state: VideoControlState) => void;
  onRegisterVideoControl: (itemKey: string, control: VideoControlHandle | null) => void;
};

const MediaPage = React.memo(
  function MediaPage({
    item,
    width,
    height,
    isActive,
    getUrl,
    onToggleControls,
    setOuterScrollEnabled,
    controlsVisible,
    videoBottomReserve,
    onAutoHideControls,
    onShowControls,
    onVideoControlChange,
    onRegisterVideoControl,
  }: MediaPageProps) {
    const itemKey = getRowKey(item);
    const isImage = item.type === "image";

    // Video must not mount with an immediate remote URL and then remount again
    // when the cached/original URL resolves. That public -> cached URI swap is
    // the main cause of black-frame flicker on Android. Images can still show
    // an immediate URL because Expo Image handles the transition cheaply.
    const [uri, setUri] = useState<string>(() =>
      isImage ? getImmediatePublicUrl(item, false) : "",
    );

    useEffect(() => {
      let cancelled = false;

      const immediate = getImmediatePublicUrl(item, false);

      if (isImage) {
        setUri((prev) => (prev === immediate ? prev : immediate));
      }

      void getUrl(item, false).then((nextUrl) => {
        if (cancelled) return;
        const resolved = nextUrl || immediate;
        if (!resolved) return;
        setUri((prev) => (prev === resolved ? prev : resolved));
      });

      return () => {
        cancelled = true;
      };
    }, [getUrl, itemKey, isImage]);

    return (
      <View style={[st.mainSlide, { width, height }]}>
        {isImage ? (
          uri ? (
            <ZoomableImage
              uri={uri}
              width={width}
              height={height}
              onToggleControls={onToggleControls}
              setOuterScrollEnabled={setOuterScrollEnabled}
            />
          ) : (
            <View style={st.center}>
              <ActivityIndicator color="#fff" />
            </View>
          )
        ) : uri ? (
          isActive ? (
            <VideoPlayerSurface
              itemKey={itemKey}
              uri={uri}
              isActive={isActive}
              width={width}
              height={height}
              controlsVisible={controlsVisible}
              bottomReserve={videoBottomReserve}
              onToggleControls={onToggleControls}
              onAutoHideControls={onAutoHideControls}
              onShowControls={onShowControls}
              onVideoControlChange={onVideoControlChange}
              onRegisterVideoControl={onRegisterVideoControl}
            />
          ) : (
            <View style={st.videoInactivePlaceholder} />
          )
        ) : (
          <View style={st.center}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  },
  (prev, next) => {
    const prevKey = getRowKey(prev.item);
    const nextKey = getRowKey(next.item);
    if (prevKey !== nextKey || prev.item.type !== next.item.type) return false;
    if (prev.width !== next.width || prev.height !== next.height) return false;

    // 이미지는 현재 index 변화에 따라 다시 그릴 필요가 없다.
    // video만 shouldPlay 때문에 isActive 변화를 반영한다.
    if (prev.item.type === "image" && next.item.type === "image") return true;

    return (
      prev.isActive === next.isActive &&
      prev.controlsVisible === next.controlsVisible &&
      prev.videoBottomReserve === next.videoBottomReserve
    );
  },
);

type ThumbnailItemProps = {
  item: Row;
  index: number;
  isActive: boolean;
  getUrl: MediaUrlResolver;
  onPress: (index: number) => void;
};

const ThumbnailItem = React.memo(
  function ThumbnailItem({
    item,
    index,
    isActive,
    getUrl,
    onPress,
  }: ThumbnailItemProps) {
    const itemKey = getRowKey(item);
    const [uri, setUri] = useState<string>(() => {
      return (
        getImmediatePublicUrl(item, true) || getImmediatePublicUrl(item, false)
      );
    });

    useEffect(() => {
      let cancelled = false;

      const immediate =
        getImmediatePublicUrl(item, true) || getImmediatePublicUrl(item, false);
      setUri((prev) => (prev === immediate ? prev : immediate));

      void getUrl(item, true).then((nextUrl) => {
        if (!cancelled && nextUrl && nextUrl !== immediate) {
          setUri((prev) => (prev === nextUrl ? prev : nextUrl));
        }
      });

      return () => {
        cancelled = true;
      };
    }, [getUrl, itemKey]);

    return (
      <Pressable
        onPress={() => onPress(index)}
        style={[st.thumbItem, isActive && st.thumbItemActive]}
        hitSlop={6}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={st.thumbImage}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={st.thumbPlaceholder}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>
    );
  },
  (prev, next) => {
    return (
      prev.item === next.item &&
      prev.index === next.index &&
      prev.isActive === next.isActive
    );
  },
);

type ThumbnailStripProps = {
  rows: Row[];
  cur: number;
  bottom: number;
  getUrl: MediaUrlResolver;
  onSelect: (index: number) => void;
  fadeStyle?: any;
  interactive?: boolean;
};

const THUMB_ITEM_WIDTH = 62;
const PAGER_RENDER_RADIUS = 1;

const ThumbnailStrip = React.memo(function ThumbnailStrip({
  rows,
  cur,
  bottom,
  getUrl,
  onSelect,
  fadeStyle,
  interactive = true,
}: ThumbnailStripProps) {
  const listRef = useRef<FlatList<Row>>(null);

  const renderThumb = useCallback(
    ({ item, index }: { item: Row; index: number }) => (
      <ThumbnailItem
        item={item}
        index={index}
        isActive={index === cur}
        getUrl={getUrl}
        onPress={onSelect}
      />
    ),
    [cur, getUrl, onSelect],
  );

  useEffect(() => {
    if (!rows.length) return;

    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: Math.max(0, Math.min(cur, rows.length - 1)),
          animated: false,
          viewPosition: 0.5,
        });
      } catch {}
    }, 0);

    return () => clearTimeout(t);
  }, [cur, rows.length]);

  if (rows.length <= 1) return null;

  return (
    <Animated.View
      pointerEvents={interactive ? "auto" : "none"}
      style={[st.thumbStrip, { bottom }, fadeStyle]}
    >
      <FlatList
        ref={listRef}
        horizontal
        data={rows}
        keyExtractor={(item, index) => `${getRowKey(item)}-thumb-${index}`}
        renderItem={renderThumb}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.thumbContent}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={24}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        getItemLayout={(_, index) => ({
          length: THUMB_ITEM_WIDTH,
          offset: THUMB_ITEM_WIDTH * index,
          index,
        })}
        onScrollToIndexFailed={() => {}}
      />
    </Animated.View>
  );
});

function EditSendGlyph() {
  return (
    <View style={st.editSendGlyph}>
      <MessageCircle size={23} color="#fff" strokeWidth={1.85} />
      <View style={st.editSendArrowBadge}>
        <ArrowRight size={11} color="#111827" strokeWidth={2.4} />
      </View>
    </View>
  );
}

// --- [Main Component] ---
export default function MediaViewer() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const params = (route.params ?? {}) as Params;
  const roomId = params.roomId;
  const rowsParam = params.rows;
  const rowParam = params.row;
  const indexParam = typeof params.index === "number" ? params.index : 0;
  const bundleUris = Array.isArray(params.bundleUris)
    ? params.bundleUris.filter(Boolean)
    : null;
  const bundleIndex =
    typeof params.bundleIndex === "number" ? params.bundleIndex : null;
  const isBundleMode = !!(bundleUris && bundleUris.length);

  const initialRows = useMemo<Row[]>(() => {
    if (Array.isArray(rowsParam) && rowsParam.length) return rowsParam;
    if (bundleUris && bundleUris.length) {
      return bundleUris.map((u, i) => ({
        id: `bundle-${i}-${u}`,
        type: "image",
        file_bucket: "",
        file_key: u,
        mime: "image/jpeg",
        created_at: null,
        sender: null,
        nickname: null,
      }));
    }
    if (rowParam) return [rowParam];
    return [];
  }, [rowsParam, bundleUris, rowParam]);

  const initialCur = useMemo(() => {
    if (bundleUris && bundleUris.length) {
      const idx = bundleIndex ?? 0;
      return Math.max(0, Math.min(idx, bundleUris.length - 1));
    }
    if (Array.isArray(rowsParam) && rowsParam.length) {
      return Math.max(0, Math.min(indexParam, rowsParam.length - 1));
    }
    return 0;
  }, [bundleIndex, bundleUris, indexParam, rowsParam]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [cur, setCur] = useState(initialCur);
  const [loading, setLoading] = useState<boolean>(() => {
    if (
      (rowsParam && rowsParam.length) ||
      (bundleUris && bundleUris.length) ||
      rowParam
    )
      return false;
    return true;
  });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsMounted, setControlsMounted] = useState(true);
  const controlsOpacity = useSharedValue(1);
  const [infoVisible, setInfoVisible] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);
  const [playbackSuspended, setPlaybackSuspended] = useState(false);

  const [nameVersion, setNameVersion] = useState(0);
  const nameMapRef = useRef<Record<string, string>>({});

  const urlMapRef = useRef<Record<string, string>>({});

  const thumbUrlMapRef = useRef<Record<string, string>>({});

  const [fileVersion, setFileVersion] = useState(0);
  const fileUriMapRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (controlsVisible) {
      setControlsMounted(true);
      controlsOpacity.value = withTiming(1, { duration: 180 });
    } else {
      controlsOpacity.value = withTiming(0, { duration: 360 });
      timer = setTimeout(() => {
        setControlsMounted(false);
      }, 380);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [controlsOpacity, controlsVisible]);

  const controlsFadeStyle = useAnimatedStyle(() => {
    return { opacity: controlsOpacity.value };
  });

  const [downloadChoice, setDownloadChoice] = useState<"all" | "current">(
    "current",
  );
  const [shareChoice, setShareChoice] = useState<"all" | "current" | "other">(
    "current",
  );

  const pagerRef = useRef<React.ElementRef<typeof PagerView>>(null);
  const current = rows[cur];
  const currentKey = current ? getRowKey(current) : "";
  const videoControlMapRef = useRef<Record<string, VideoControlHandle>>({});
  const [activeVideoControlState, setActiveVideoControlState] =
    useState<VideoControlState | null>(null);

  const shareableRows = useMemo(
    () => rows.filter((x) => x.type === "image" || x.type === "video"),
    [rows],
  );
  const shareableImageCount = useMemo(
    () => shareableRows.filter((x) => x.type === "image").length,
    [shareableRows],
  );
  const shareableVideoCount = useMemo(
    () => shareableRows.filter((x) => x.type === "video").length,
    [shareableRows],
  );

  const currentShareLabel = useMemo(() => {
    if (current?.type === "video") {
      return t("mediaViewer:label_share_current_video", {
        defaultValue: "이 동영상만 공유",
      });
    }

    return t("mediaViewer:label_share_current_image", {
      defaultValue: "이 사진만 공유",
    });
  }, [current?.type, t]);

  const allShareLabel = useMemo(() => {
    if (shareableImageCount > 0 && shareableVideoCount > 0) {
      return t("mediaViewer:label_share_all_media", {
        defaultValue: "모든 사진/동영상 공유",
      });
    }

    if (shareableVideoCount > 0) {
      return t("mediaViewer:label_share_all_videos", {
        defaultValue: "모든 동영상 공유",
      });
    }

    return t("mediaViewer:label_share_all_images", {
      defaultValue: "모든 사진 공유",
    });
  }, [shareableImageCount, shareableVideoCount, t]);

  const showShareChoiceSheet = shareableRows.length > 1;

  const showNotice = useCallback(
    (message: string, tone: MediaViewerNoticeTone = "default") => {
      showToast({
        message,
        tone,
        showMark: tone === "success" || tone === "danger",
      });
    },
    [showToast],
  );

  const handleRegisterVideoControl = useCallback(
    (itemKey: string, control: VideoControlHandle | null) => {
      if (!itemKey) return;

      if (control) {
        videoControlMapRef.current[itemKey] = control;
        return;
      }

      delete videoControlMapRef.current[itemKey];
    },
    [],
  );

  const handleVideoControlChange = useCallback((state: VideoControlState) => {
    setActiveVideoControlState((prev) => {
      if (
        prev &&
        prev.itemKey === state.itemKey &&
        prev.isPlaying === state.isPlaying &&
        prev.hasEnded === state.hasEnded
      ) {
        return prev;
      }

      return state;
    });
  }, []);

  useEffect(() => {
    if (!current || current.type !== "video") {
      setActiveVideoControlState(null);
      return;
    }

    setActiveVideoControlState((prev) => {
      if (prev?.itemKey === currentKey) return prev;
      return { itemKey: currentKey, isPlaying: false, hasEnded: false };
    });
  }, [current, currentKey]);

  const mediaViewerToastTheme = createCoonnFloatingToastTheme(
    {
      isDark: true,
      surface:
        toast.tone === "danger"
          ? "rgba(127,29,29,0.94)"
          : "rgba(17,24,39,0.94)",
      textPrimary: "#FFFFFF",
      border: "rgba(255,255,255,0.12)",
      accentColor: "#FFFFFF",
      dangerColor: "#FCA5A5",
      shadowColor: "#000000",
    },
    toast.tone,
  );

  useEffect(() => {
    setRows(initialRows);
    setCur(initialCur);
    urlMapRef.current = {};
    thumbUrlMapRef.current = {};
    fileUriMapRef.current = {};
    setFileVersion((v) => v + 1);
  }, [initialRows.length, initialCur]);

  useEffect(() => {
    if (
      (rowsParam && rowsParam.length) ||
      (bundleUris && bundleUris.length) ||
      rowParam
    )
      return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id,type,file_bucket,file_key,mime,created_at,sender_id")
          .eq("room_id", roomId)
          .in("type", ["image", "video"])
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) console.warn("MediaViewer load error", error);
        if (!mounted) return;
        const normalized: Row[] =
          (data ?? []).map((d: any) => ({
            id: String(d.id),
            type: d.type,
            file_bucket: d.file_bucket,
            file_key: d.file_key,
            mime: d.mime ?? null,
            created_at: d.created_at ?? null,
            sender: d.sender_id ?? null,
            nickname: null,
          })) ?? [];
        setRows(normalized);
        setCur(0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roomId, rowsParam, rowParam, bundleUris]);

  const getUrl = useCallback(
    async (r: Row, isThumb: boolean = false) => {
      const direct = isThumb
        ? getDirectThumbUri(r) || getDirectMediaUri(r)
        : getDirectMediaUri(r);

      let resolved = "";

      if (/^(file|content):\/\//i.test(direct)) return direct;
      if (/^https?:\/\//i.test(direct)) {
        resolved = direct;
      } else {
        const fk = safeTrim(r.file_key);
        if (/^(file|content):\/\//i.test(fk)) return fk;
        if (fk && /^https?:\/\//i.test(fk)) {
          resolved = fk;
        } else if (!r.file_bucket) {
          resolved = fk;
        } else {
          const transformOpt = isThumb
            ? {
                transform: {
                  width: 120,
                  height: 120,
                  resize: "cover" as const,
                },
              }
            : undefined;

          try {
            const { data: pub } = supabase.storage
              .from(r.file_bucket)
              .getPublicUrl(fk, transformOpt);
            if (pub?.publicUrl) resolved = pub.publicUrl;
          } catch {}

          if (!resolved) {
            try {
              const { data, error } = await supabase.storage
                .from(r.file_bucket)
                .createSignedUrl(fk, 86400, transformOpt);
              if (error) throw error;
              resolved = data.signedUrl;
            } catch {
              resolved = "";
            }
          }
        }
      }

      if (!resolved) return "";
      if (
        (r.type !== "image" && r.type !== "video") ||
        isSecureMediaRow(r) ||
        !isRemoteHttpUrl(resolved)
      )
        return resolved;

      const cacheKey = getRowKey(r);
      if (isThumb)
        return ensureThumbnailCached(resolved, {
          cacheKey,
          mime: r.mime,
          roomId,
          assetType: "image",
        });
      return ensureOriginalCached(resolved, {
        cacheKey,
        mime: r.mime,
        roomId,
        assetType: r.type === "video" ? "video" : "image",
      });
    },
    [roomId],
  );

  const ensureUrl = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      const cached = urlMapRef.current[key];
      if (cached) return cached;

      const u = await getUrl(r, false);
      if (u) urlMapRef.current[key] = u;

      return u;
    },
    [getUrl],
  );

  const ensureThumbUrl = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      const cached = thumbUrlMapRef.current[key];
      if (cached) return cached;

      const u = await getUrl(r, true);
      if (u) thumbUrlMapRef.current[key] = u;

      return u;
    },
    [getUrl],
  );

  useEffect(() => {
    const sid = getSenderId(current);
    if (!sid || !looksLikeUuid(sid) || nameMapRef.current[sid]) return;

    let cancelled = false;

    (async () => {
      try {
        let nickname = "";

        const byUserId = await supabase
          .from("profiles")
          .select("nickname")
          .eq("user_id", sid)
          .maybeSingle();

        if (!byUserId.error && byUserId.data?.nickname) {
          nickname = String(byUserId.data.nickname);
        } else {
          const byId = await supabase
            .from("profiles")
            .select("nickname")
            .eq("id", sid)
            .maybeSingle();

          if (!byId.error && byId.data?.nickname) {
            nickname = String(byId.data.nickname);
          }
        }

        if (cancelled || !nickname) return;

        nameMapRef.current[sid] = nickname;
        setNameVersion((v) => v + 1);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [current?.sender, current?.sender_id]);

  const ensureFileUri = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      const cached = fileUriMapRef.current[key];
      if (cached) return cached;

      const remoteOrLocal = await ensureUrl(r);
      if (!remoteOrLocal) return "";

      if (/^(file|content):\/\//i.test(remoteOrLocal.trim())) {
        fileUriMapRef.current[key] = remoteOrLocal;
        setFileVersion((v) => v + 1);
        return remoteOrLocal;
      }

      if (
        (r.type === "image" || r.type === "video") &&
        !isSecureMediaRow(r) &&
        isRemoteHttpUrl(remoteOrLocal)
      ) {
        const local = await ensureOriginalCached(remoteOrLocal, {
          cacheKey: key,
          mime: r.mime,
          roomId,
          assetType: r.type === "video" ? "video" : "image",
        });
        if (local) {
          fileUriMapRef.current[key] = local;
          setFileVersion((v) => v + 1);
          return local;
        }
      }

      if (!FileSystem || !isRemoteHttpUrl(remoteOrLocal)) return "";
      try {
        const clean = remoteOrLocal.split("?")[0];
        const name = clean.split("/").pop() ?? `${String(r.id)}.jpg`;
        const dest = `${FileSystem.cacheDirectory ?? ""}${name}`;
        const { uri } = await FileSystem.downloadAsync(remoteOrLocal, dest);
        fileUriMapRef.current[key] = uri;
        setFileVersion((v) => v + 1);
        return uri;
      } catch {
        return "";
      }
    },
    [ensureUrl],
  );

  const saveToDevice = useCallback(
    async (r: Row): Promise<boolean> => {
      if (!MediaLibrary || !FileSystem) return false;
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) return false;
        const fileUri = await ensureFileUri(r);
        if (!fileUri) return false;
        await MediaLibrary.saveToLibraryAsync(fileUri);
        return true;
      } catch {
        return false;
      }
    },
    [ensureFileUri],
  );

  const runDownload = useCallback(
    async (mode: "all" | "current") => {
      if (!current) return;

      setModalType(null);
      setBusy(true);
      showNotice(t("mediaViewer:toast_saving"), "default");

      try {
        let savedCount = 0;

        if (mode === "current") {
          const ok = await saveToDevice(current);
          if (ok) savedCount = 1;
        } else {
          const targets = rows.filter((x) => x.type === "image");
          for (const r of targets) {
            const ok = await saveToDevice(r);
            if (ok) savedCount += 1;
          }
        }

        if (savedCount > 0) {
          showNotice(
            savedCount === 1
              ? t("mediaViewer:toast_saved")
              : t("mediaViewer:toast_saved_count", { count: savedCount }),
            "success",
          );
        } else {
          showNotice(t("mediaViewer:toast_save_failed"), "danger");
        }
      } finally {
        setBusy(false);
      }
    },
    [current, rows, saveToDevice, showNotice, t],
  );

  const runShare = useCallback(
    async (mode: "all" | "current" | "other") => {
      if (!current) return;
      setBusy(true);
      try {
        let target: Row = current;
        if (mode === "all") {
          if (shareableRows.length === 0) {
            Alert.alert(t("mediaViewer:alert_share_empty"));
            return;
          }
          target = shareableRows[0];
          Alert.alert(
            t("mediaViewer:alert_share_bundle_info"),
            t("mediaViewer:alert_share_bundle_msg"),
          );
        }
        const uri = await ensureFileUri(target);
        if (!uri) {
          Alert.alert(
            t("mediaViewer:alert_share_fail_title"),
            t("mediaViewer:alert_share_fail_load"),
          );
          return;
        }
        const mimeType =
          target.mime || (target.type === "video" ? "video/mp4" : "image/jpeg");
        const canNative = Sharing && (await Sharing.isAvailableAsync());
        if (canNative) await Sharing.shareAsync(uri, { mimeType });
        else {
          try {
            await RNShare.share({
              url: uri,
              message: "",
              title:
                target.type === "video"
                  ? t("mediaViewer:modal_share_video", {
                      defaultValue: "동영상 공유",
                    })
                  : t("mediaViewer:modal_share_image", {
                      defaultValue: "사진 공유",
                    }),
            });
          } catch {
            Alert.alert(
              t("mediaViewer:alert_share_fail_title"),
              t("mediaViewer:alert_share_fail_msg"),
            );
          }
        }
      } finally {
        setBusy(false);
        setModalType(null);
      }
    },
    [current, ensureFileUri, shareableRows, t],
  );

  const openShareSheetOrRun = useCallback(() => {
    if (!current) return;
    if (showShareChoiceSheet) {
      setShareChoice("current");
      setModalType("share");
      return;
    }

    void runShare("current");
  }, [current, runShare, showShareChoiceSheet]);

  const openChatAtCurrent = useCallback(() => {
    if (!roomId || !current) return;

    // 동영상 재생 중 채팅으로 이동하면 native player가 백그라운드에서
    // 계속 도는 문제가 생길 수 있으므로, 먼저 현재 viewer의 video surface를
    // 비활성화시킨 뒤 채팅 포커스 이벤트를 전달한다.
    setPlaybackSuspended(true);

    const messageUid = getMessageUid(current);
    const roomSeq = getRoomSeq(current);
    const fallbackId = safeTrim(current.id);
    const anchorId = messageUid || fallbackId;

    const payload = {
      roomId,
      messageId: anchorId,
      targetMessageId: anchorId,
      focusMessageId: anchorId,
      highlightMessageId: anchorId,
      messageUid: messageUid || null,
      roomSeq,
      createdAt: current.created_at ?? null,
      mediaRowId: fallbackId,
      mediaType: current.type,
      mediaUri: getDirectMediaUri(current),
      source: "media_viewer",
    };

    const emitFocus = () => {
      DeviceEventEmitter.emit("chat:mediaViewer:openMessage", payload);
    };

    // 기존 Chat 위에 MediaViewer가 올라온 경우에는 새 Chat을 다시 navigate하지 않는다.
    // 새로 navigate하면 route params가 덮이면서 상단 제목이 "채팅"으로 회귀할 수 있다.
    const state =
      typeof navigation.getState === "function" ? navigation.getState() : null;
    const routes = Array.isArray(state?.routes) ? state.routes : [];
    const prevRoute = routes.length >= 2 ? routes[routes.length - 2] : null;
    const prevParams = (prevRoute as any)?.params ?? {};
    const prevRoomId = Number(
      prevParams?.roomId ?? prevParams?.room_id ?? prevParams?.id ?? 0,
    );
    const previousIsSameChat =
      (prevRoute as any)?.name === "Chat" &&
      Number.isFinite(prevRoomId) &&
      prevRoomId === Number(roomId);

    if (previousIsSameChat && navigation.canGoBack?.()) {
      navigation.goBack();
      // goBack 직후 Chat screen이 focused로 전환되는 타이밍을 기다려 한 번 더 보낸다.
      setTimeout(emitFocus, 80);
      setTimeout(emitFocus, 220);
      return;
    }

    emitFocus();

    navigation.navigate({
      name: "Chat",
      params: {
        roomId,
        messageId: anchorId,
        targetMessageId: anchorId,
        focusMessageId: anchorId,
        highlightMessageId: anchorId,
        messageUid: messageUid || null,
        roomSeq,
        createdAt: current.created_at ?? null,
        source: "media_viewer",
      },
      merge: true,
    });
  }, [current, navigation, roomId]);

  const toggleControls = useCallback(() => {
    setControlsVisible((v) => !v);
  }, []);

  const hideControls = useCallback(() => {
    setControlsVisible(false);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
  }, []);

  const toggleCurrentVideoPlayback = useCallback(() => {
    if (!current || current.type !== "video" || !currentKey) return;

    showControls();
    videoControlMapRef.current[currentKey]?.togglePlay();
  }, [current, currentKey, showControls]);

  const isCurrentVideoPlaying =
    current?.type === "video" &&
    activeVideoControlState?.itemKey === currentKey &&
    activeVideoControlState.isPlaying &&
    !activeVideoControlState.hasEnded;

  const handlePageSelected = useCallback(
    (e: any) => {
      const index = Number(e?.nativeEvent?.position ?? 0);
      if (!Number.isFinite(index) || index < 0 || index >= rows.length) return;

      setPlaybackSuspended(false);
      setOuterScrollEnabled(true);
      setCur((prev) => (prev === index ? prev : index));
    },
    [rows.length],
  );

  useEffect(() => {
    setPlaybackSuspended(false);
  }, [cur]);

  useEffect(() => {
    if (modalType === "download") setDownloadChoice("current");
    else if (modalType === "share") setShareChoice("current");
  }, [modalType]);

  const senderName = useMemo(() => {
    const nick = safeTrim(current?.nickname);
    if (nick) return nick;

    const sid = getSenderId(current);
    if (sid && nameMapRef.current[sid]) return nameMapRef.current[sid];

    const tVal = safeTrim(params.title);
    if (!isGenericMediaTitle(tVal) && !isMeaninglessSubtitle(tVal)) return tVal;

    return t("mediaViewer:sender_fallback");
  }, [
    params.title,
    current?.nickname,
    current?.sender,
    current?.sender_id,
    nameVersion,
    t,
  ]);

  const sentAtText = useMemo(() => {
    if (current?.created_at) return formatDateTimeKorean(current.created_at);

    const sub = safeTrim(params.subtitle);
    if (sub && !isMeaninglessSubtitle(sub) && !isGenericMediaTitle(sub))
      return sub;

    return "";
  }, [params.subtitle, current?.created_at]);

  const headerTitle = senderName;
  const headerSub = sentAtText;

  const handleThumbnailSelect = useCallback(
    (index: number) => {
      if (index === cur) return;

      const next = Math.max(0, Math.min(index, rows.length - 1));
      setCur(next);

      requestAnimationFrame(() => {
        try {
          pagerRef.current?.setPage(next);
        } catch {}
      });
    },
    [cur, rows.length],
  );

  const safeBottomPadding = Math.max(insets.bottom, 10);
  const toolbarHeight = 60 + safeBottomPadding;
  const thumbStripBottom = toolbarHeight;
  const videoChromeReserve =
    toolbarHeight + (rows.length > 1 ? THUMB_STRIP_HEIGHT : 0);
  const videoBottomReserve = controlsVisible ? videoChromeReserve : 0;

  const renderPagerPage = useCallback(
    (item: Row, index: number) => {
      const shouldRender = Math.abs(index - cur) <= PAGER_RENDER_RADIUS;

      return (
        <View
          key={`${getRowKey(item)}-${index}`}
          style={[st.mainSlide, { width, height }]}
          collapsable={false}
        >
          {shouldRender ? (
            <MediaPage
              item={item}
              index={index}
              width={width}
              height={height}
              isActive={index === cur && !playbackSuspended}
              getUrl={getUrl}
              onToggleControls={toggleControls}
              setOuterScrollEnabled={setOuterScrollEnabled}
              controlsVisible={controlsVisible}
              videoBottomReserve={videoBottomReserve}
              onAutoHideControls={hideControls}
              onShowControls={showControls}
              onVideoControlChange={handleVideoControlChange}
              onRegisterVideoControl={handleRegisterVideoControl}
            />
          ) : null}
        </View>
      );
    },
    [
      cur,
      getUrl,
      height,
      toggleControls,
      hideControls,
      width,
      controlsVisible,
      videoBottomReserve,
      playbackSuspended,
      handleVideoControlChange,
      handleRegisterVideoControl,
    ],
  );

  const pagerKey = useMemo(() => {
    const firstKey = rows[0] ? getRowKey(rows[0]) : "empty";
    const lastKey = rows[rows.length - 1]
      ? getRowKey(rows[rows.length - 1])
      : "empty";
    return `${rows.length}:${firstKey}:${lastKey}`;
  }, [rows]);

  useEffect(() => {
    if (!rows.length) return;

    const t = setTimeout(() => {
      try {
        pagerRef.current?.setPageWithoutAnimation(
          Math.max(0, Math.min(cur, rows.length - 1)),
        );
      } catch {}
    }, 0);

    return () => clearTimeout(t);
  }, [rows.length, pagerKey]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <AnimatedLinearGradient
          colors={[
            "rgba(0,0,0,0.82)",
            "rgba(0,0,0,0.58)",
            "rgba(0,0,0,0.24)",
            "rgba(0,0,0,0.0)",
          ]}
          locations={[0, 0.44, 0.76, 1]}
          pointerEvents={controlsVisible ? "auto" : "none"}
          style={[
            st.headerOverlay,
            {
              height: insets.top + 178,
              paddingTop: insets.top,
            },
            controlsFadeStyle,
          ]}
        >
          <View style={st.headerRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={st.backPlainBtn}
              hitSlop={12}
            >
              <ChevronLeft size={25} color="#ffffff" strokeWidth={2.1} />
            </Pressable>
            <View style={st.headerTextWrap}>
              {!!headerTitle && (
                <Text numberOfLines={1} style={st.headerTitle}>
                  {headerTitle}
                </Text>
              )}
              {!!headerSub && (
                <Text numberOfLines={1} style={st.headerSub}>
                  {headerSub}
                </Text>
              )}
            </View>
            <Text
              style={st.headerIndex}
            >{`${cur + 1}/${rows.length || 1}`}</Text>
          </View>
        </AnimatedLinearGradient>

        {loading ? (
          <View style={st.center}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : !current ? (
          <View style={st.center}>
            <Text style={st.empty}>{t("mediaViewer:empty")}</Text>
          </View>
        ) : (
          <>
            <PagerView
              key={pagerKey}
              ref={pagerRef}
              style={{ flex: 1 }}
              initialPage={Math.max(0, Math.min(cur, rows.length - 1))}
              scrollEnabled={outerScrollEnabled}
              orientation="horizontal"
              overdrag={false}
              offscreenPageLimit={1}
              onPageSelected={handlePageSelected}
            >
              {rows.map(renderPagerPage)}
            </PagerView>

            {controlsMounted && (
              <Animated.View
                pointerEvents={controlsVisible ? "auto" : "none"}
                style={[
                  st.toolbar,
                  { paddingBottom: safeBottomPadding },
                  controlsFadeStyle,
                ]}
              >
                {current?.type === "video" && (
                  <Pressable
                    style={st.toolbarAction}
                    onPress={toggleCurrentVideoPlayback}
                    hitSlop={10}
                    android_disableSound
                  >
                    {isCurrentVideoPlaying ? (
                      <PauseIcon size={24} color="#fff" strokeWidth={2.05} />
                    ) : (
                      <PlayIcon
                        size={24}
                        color="#fff"
                        fill="#fff"
                        strokeWidth={0}
                        style={st.toolbarPlayIcon}
                      />
                    )}
                  </Pressable>
                )}

                <Pressable
                  style={st.toolbarAction}
                  onPress={() => setModalType("download")}
                  hitSlop={10}
                >
                  <DownloadIcon size={24} color="#fff" strokeWidth={1.85} />
                </Pressable>

                <Pressable
                  style={st.toolbarAction}
                  onPress={openShareSheetOrRun}
                  hitSlop={10}
                >
                  <ShareIcon size={24} color="#fff" strokeWidth={1.85} />
                </Pressable>

                <Pressable
                  style={[
                    st.toolbarAction,
                    !roomId || !current ? st.toolbarActionDisabled : null,
                  ]}
                  onPress={openChatAtCurrent}
                  disabled={!roomId || !current}
                  hitSlop={10}
                >
                  <EditSendGlyph />
                </Pressable>

                <Pressable
                  style={st.toolbarAction}
                  onPress={() => setInfoVisible(true)}
                  hitSlop={10}
                >
                  <InfoIcon size={24} color="#fff" strokeWidth={1.85} />
                </Pressable>
              </Animated.View>
            )}

            {controlsMounted && (
              <ThumbnailStrip
                rows={rows}
                cur={cur}
                bottom={thumbStripBottom}
                getUrl={getUrl}
                onSelect={handleThumbnailSelect}
                fadeStyle={controlsFadeStyle}
                interactive={controlsVisible}
              />
            )}
          </>
        )}
      </View>

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={mediaViewerToastTheme}
        bottomOffset={118}
        durationMs={1800}
        maxWidth="88%"
        onHidden={hideToast}
      />

      <Modal
        visible={infoVisible || modalType !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setInfoVisible(false);
          setModalType(null);
        }}
      >
        <Pressable
          style={st.modalOverlay}
          onPress={() => {
            if (!busy) {
              setInfoVisible(false);
              setModalType(null);
            }
          }}
        >
          <View
            style={[
              st.bottomSheet,
              { paddingBottom: Math.max(insets.bottom, 20) + 20 },
            ]}
          >
            <View style={st.sheetHandle} />

            <View style={st.modalHeaderRow}>
              <Text style={st.modalTitle}>
                {infoVisible
                  ? t("mediaViewer:modal_info")
                  : modalType === "download"
                    ? t("mediaViewer:modal_save")
                    : modalType === "share"
                      ? t("mediaViewer:modal_share")
                      : t("common:preparing")}
              </Text>
            </View>

            {infoVisible && current && (
              <>
                <Text style={st.modalText}>
                  {t("mediaViewer:info_sender")}: {senderName}
                </Text>
                <Text style={st.modalText}>
                  {t("mediaViewer:info_sent_at")}: {sentAtText || "-"}
                </Text>
                <Text style={st.modalText}>
                  {t("mediaViewer:info_location")}: {cur + 1} /{" "}
                  {rows.length || 1}
                </Text>
              </>
            )}

            {modalType === "download" && (
              <>
                <Text style={st.modalSubText}>
                  {t("mediaViewer:label_save_option")}
                </Text>
                <Pressable
                  style={st.choiceRow}
                  disabled={busy}
                  onPress={() => setDownloadChoice("current")}
                >
                  <View style={st.choiceRadioOuter}>
                    {downloadChoice === "current" && (
                      <View style={st.choiceRadioInner} />
                    )}
                  </View>
                  <Text style={st.choiceLabel}>
                    {t("mediaViewer:label_save_current")}
                  </Text>
                </Pressable>
                <Pressable
                  style={st.choiceRow}
                  disabled={busy}
                  onPress={() => setDownloadChoice("all")}
                >
                  <View style={st.choiceRadioOuter}>
                    {downloadChoice === "all" && (
                      <View style={st.choiceRadioInner} />
                    )}
                  </View>
                  <Text style={st.choiceLabel}>
                    {t("mediaViewer:label_save_all", { count: rows.length })}
                  </Text>
                </Pressable>
              </>
            )}

            {modalType === "share" && (
              <>
                <Text style={st.modalSubText}>
                  {t("mediaViewer:label_share_option")}
                </Text>
                <Pressable
                  style={st.choiceRow}
                  disabled={busy}
                  onPress={() => setShareChoice("current")}
                >
                  <View style={st.choiceRadioOuter}>
                    {shareChoice === "current" && (
                      <View style={st.choiceRadioInner} />
                    )}
                  </View>
                  <Text style={st.choiceLabel}>{currentShareLabel}</Text>
                </Pressable>
                <Pressable
                  style={st.choiceRow}
                  disabled={busy}
                  onPress={() => setShareChoice("all")}
                >
                  <View style={st.choiceRadioOuter}>
                    {shareChoice === "all" && (
                      <View style={st.choiceRadioInner} />
                    )}
                  </View>
                  <Text style={st.choiceLabel}>{allShareLabel}</Text>
                </Pressable>
              </>
            )}

            <View style={st.modalButtonsRow}>
              <Pressable
                style={[
                  st.modalButton,
                  st.modalButtonSecondary,
                  infoVisible && modalType === null ? st.modalButtonFull : null,
                ]}
                disabled={busy}
                onPress={() => {
                  setInfoVisible(false);
                  setModalType(null);
                }}
              >
                <Text style={st.modalButtonSecondaryText}>
                  {infoVisible && modalType === null
                    ? t("common:close")
                    : t("common:cancel")}
                </Text>
              </Pressable>

              {modalType === "download" ? (
                <Pressable
                  style={[st.modalButton, st.modalButtonPrimary]}
                  disabled={busy}
                  onPress={() => runDownload(downloadChoice)}
                >
                  <Text style={st.modalButtonPrimaryText}>
                    {busy ? t("mediaViewer:state_saving") : t("common:save")}
                  </Text>
                </Pressable>
              ) : modalType === "share" ? (
                <Pressable
                  style={[st.modalButton, st.modalButtonPrimary]}
                  disabled={busy}
                  onPress={() => runShare(shareChoice)}
                >
                  <Text style={st.modalButtonPrimaryText}>
                    {busy ? t("mediaViewer:state_sharing") : t("common:share")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#9ca3af" },
  iconBtnBase: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDark: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  iconBtnLight: {
    backgroundColor: "#F3F4F6",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  iconBtnPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  iconBtnDisabled: { opacity: 0.55 },

  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  headerRow: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  backPlainBtn: {
    width: 34,
    height: 40,
    marginLeft: -7,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: { flex: 1, justifyContent: "center" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#f9fafb" },
  headerSub: { fontSize: 11.5, color: "rgba(255,255,255,0.78)" },
  headerSubPress: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  headerSubChevron: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 17,
    lineHeight: 17,
    fontWeight: "800",
    marginLeft: 3,
    marginTop: -1,
  },
  headerIndex: {
    fontSize: 12,
    color: "rgba(255,255,255,0.86)",
    width: 56,
    textAlign: "right",
  },

  mainSlide: {
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  mainImage: { width: "100%", height: "100%" },
  videoStage: {
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  videoPlayer: { width: "100%", height: "100%", backgroundColor: "#000" },
  videoInactivePlaceholder: { width: "100%", height: "100%", backgroundColor: "#000" },
  videoCenterButton: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 74,
    height: 74,
    marginLeft: -37,
    marginTop: -37,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.46)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  videoCenterButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  videoPlayIcon: { marginLeft: 4 },
  videoControlsOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 18,
  },
  videoControlsBar: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.54)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  videoTimeRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  videoTimeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  videoTimeTextMuted: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  videoTimeDivider: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 13,
    fontWeight: "800",
    includeFontPadding: false,
    marginHorizontal: 7,
  },
  videoTimeSpacer: { flex: 1 },
  videoMuteButton: {
    width: 30,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  videoProgressTrack: {
    flex: 1,
    height: 18,
    minWidth: 64,
    justifyContent: "center",
  },
  videoProgressRail: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 3,
    marginTop: -1.5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  videoProgressFill: {
    position: "absolute",
    left: 0,
    top: "50%",
    height: 3,
    marginTop: -1.5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  videoProgressKnob: {
    position: "absolute",
    top: "50%",
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  playFallback: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(17,24,39,0.82)",
    borderRadius: 14,
    alignItems: "center",
  },
  playTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },
  playSub: { color: "#cbd5e1", marginTop: 4, fontSize: 12 },

  thumbStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    height: THUMB_STRIP_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  thumbContent: { paddingHorizontal: 12, alignItems: "center" },
  thumbItem: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  thumbItemActive: {
    borderColor: "#facc15",
    borderWidth: 2,
    backgroundColor: "rgba(250,204,21,0.10)",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31,41,55,0.8)",
  },

  toolbar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 58,
    backgroundColor: "rgba(0,0,0,0.54)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  toolbarAction: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarActionDisabled: { opacity: 0.34 },
  toolbarPlayIcon: { marginLeft: 2 },
  editSendGlyph: {
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  editSendArrowBadge: {
    position: "absolute",
    right: 0,
    bottom: 1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    width: "100%",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 18,
  },
  modalHeaderRow: { marginBottom: 14, alignItems: "flex-start" },
  modalTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: THEME.textMain,
    textAlign: "left",
  },
  modalText: {
    fontSize: 14.5,
    color: THEME.textMain,
    marginBottom: 8,
    lineHeight: 22,
    fontWeight: "500",
  },
  modalSubText: {
    fontSize: 13.5,
    color: THEME.textSub,
    marginBottom: 12,
    lineHeight: 19,
  },

  modalButtonsRow: { flexDirection: "row", marginTop: 18, gap: 10 },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonFull: { flex: 1 },
  modalButtonSecondary: {
    backgroundColor: "#F3F4F6",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600",
  },
  modalButtonPrimary: { backgroundColor: "#111827" },
  modalButtonPrimaryText: { fontSize: 15, color: "#ffffff", fontWeight: "700" },
  modalButtonDestructive: { backgroundColor: "#FEE2E2" },
  modalButtonDestructiveText: {
    fontSize: 15,
    color: "#DC2626",
    fontWeight: "700",
  },

  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F3F5",
  },
  choiceRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  choiceRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#111827",
  },
  choiceLabel: { fontSize: 15, color: "#111827", fontWeight: "600" },
});
