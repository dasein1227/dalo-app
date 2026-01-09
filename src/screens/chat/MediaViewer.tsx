// src/screens/chat/MediaViewer.tsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  Linking,
  Modal,
  ScrollView,
  FlatList,
  Alert,
  Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  Download as DownloadIcon,
  Share2 as ShareIcon,
  Trash2 as TrashIcon,
  Edit3 as EditIcon,
  Info as InfoIcon,
} from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

type Row = {
  id: string | number;
  type: 'image' | 'video';
  file_bucket: string;
  file_key: string;
  mime: string | null;
  sender?: string | null;
  nickname?: string | null;
  created_at?: string | null;
};

type Params = {
  roomId: number;
  rows?: Row[];
  index?: number;
  row?: Row;
  title?: any;
  subtitle?: any;

  // ✅ MessageItem에서 묶음 전달용
  bundleUris?: string[];
  bundleIndex?: number;
};

const { width: W, height: H } = Dimensions.get('window');

// optional native 모듈
let VideoComp: any = null;
let FileSystem: any = null;
let MediaLibrary: any = null;
let Sharing: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VideoComp = require('expo-av').Video;
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FileSystem = require('expo-file-system/legacy');
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MediaLibrary = require('expo-media-library');
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sharing = require('expo-sharing');
} catch {}

type ModalType = 'download' | 'share' | 'delete' | 'info-none' | 'edit-info' | null;

function formatDateTimeKorean(value?: string | Date | null): string {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** ✅ 안정적인 string 변환 (subtitle.trim() 크래시 방지용) */
function safeString(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return String(v);
  } catch {
    return '';
  }
}
function safeTrim(v: any): string {
  const s = safeString(v);
  return s.trim ? s.trim() : s;
}

/** ✅ 묶음 사진 지원: id 말고 file_key 기준 키 사용 */
const getRowKey = (r: Row): string => (r.file_key ? `fk:${r.file_key}` : `id:${String(r.id)}`);

/** “uuid처럼 보이는 값” 감지 */
function looksLikeUuid(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** clamp helper */
function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, n));
}

/** ✅ 개별 이미지: 핀치줌 + 더블탭줌 + 줌 상태 pan 이동
 *  - 핵심: “줌(>1) 상태에서만 pan이 activate”
 *  - 평상시는 FlatList가 스와이프를 먹어야 함(다음/이전 사진 슬라이드)
 */
type ZoomableImageProps = {
  uri: string;
  onToggleControls: () => void;
  onOpenExternally: () => void;
  setOuterScrollEnabled: (v: boolean) => void; // 줌중이면 FlatList 스크롤 막기
};

function ZoomableImage({ uri, onToggleControls, onOpenExternally, setOuterScrollEnabled }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // ✅ “줌 상태 변화”만 부모 state를 건드리기 위해 ref + sharedValue 같이 씀
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
      'worklet';
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

  // pinch (scale)
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

        // pan 범위 재클램프
        const maxX = (W * (s - 1)) / 2;
        const maxY = (H * (s - 1)) / 2;
        tx.value = clamp(tx.value, -maxX, maxX);
        ty.value = clamp(ty.value, -maxY, maxY);
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
  }, [reset, savedScale, scale, setZoomed, tx, ty, savedTx, savedTy]);

  // ✅ pan: manualActivation으로 “줌일 때만 activate”
  const pan = useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .activeOffsetX([-6, 6])
      .activeOffsetY([-6, 6])
      .onTouchesMove((_, state) => {
        if (scale.value <= 1.01) {
          state.fail(); // ✅ FlatList가 스와이프를 먹게 한다
          return;
        }
        state.activate(); // ✅ 줌이면 이미지가 pan을 먹는다
      })
      .onBegin(() => {
        setZoomed(scale.value > 1.01);
      })
      .onUpdate((e) => {
        const s = scale.value;
        if (s <= 1.01) return;

        const maxX = (W * (s - 1)) / 2;
        const maxY = (H * (s - 1)) / 2;

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
  }, [reset, savedTx, savedTy, scale, setZoomed, tx, ty]);

  // double tap: 2배 토글
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
        const dx = (W / 2 - e.x) * (target - 1);
        const dy = (H / 2 - e.y) * (target - 1);

        const maxX = (W * (target - 1)) / 2;
        const maxY = (H * (target - 1)) / 2;

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
  }, [reset, savedScale, scale, setZoomed, tx, ty, savedTx, savedTy]);

  // single tap: 컨트롤 토글
  const singleTap = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(1)
      .maxDelay(240)
      .onEnd(() => {
        runOnJS(onToggleControls)();
      });
  }, [onToggleControls]);

  // long press: 외부 열기
  const longPress = useMemo(() => {
    return Gesture.LongPress()
      .minDuration(320)
      .onEnd(() => {
        runOnJS(onOpenExternally)();
      });
  }, [onOpenExternally]);

  const taps = useMemo(() => Gesture.Exclusive(doubleTap, singleTap), [doubleTap, singleTap]);
  const composed = useMemo(() => Gesture.Simultaneous(pinch, pan, taps, longPress), [pinch, pan, taps, longPress]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.Image source={{ uri }} style={[st.mainImage as any, animatedStyle]} resizeMode="contain" />
    </GestureDetector>
  );
}

export default function MediaViewer() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const params = (route.params ?? {}) as Params;

  const roomId = params.roomId;
  const rowsParam = params.rows;
  const rowParam = params.row;
  const indexParam = typeof params.index === 'number' ? params.index : 0;

  // ✅ bundle
  const bundleUris = Array.isArray(params.bundleUris) ? params.bundleUris.filter(Boolean) : null;
  const bundleIndex = typeof params.bundleIndex === 'number' ? params.bundleIndex : null;

  // ✅ 초기 rows 구성: (우선순위) rowsParam > bundleUris > rowParam > []
  const initialRows = useMemo<Row[]>(() => {
    if (Array.isArray(rowsParam) && rowsParam.length) return rowsParam;

    if (bundleUris && bundleUris.length) {
      return bundleUris.map((u, i) => ({
        id: `bundle-${i}-${u}`,
        type: 'image',
        file_bucket: '',
        file_key: u,
        mime: 'image/jpeg',
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
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [fileUriMap, setFileUriMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(() => {
    // rowsParam/bundle/row 들어오면 로딩 아님
    if ((rowsParam && rowsParam.length) || (bundleUris && bundleUris.length) || rowParam) return false;
    return true;
  });

  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);

  // ✅ 줌중이면 FlatList 스크롤 막기
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);

  // ✅ senderId -> nickname 캐시
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const [downloadChoice, setDownloadChoice] = useState<'all' | 'current'>('current');
  const [shareChoice, setShareChoice] = useState<'all' | 'current' | 'other'>('current');

  const sliderRef = useRef<FlatList<Row>>(null);
  const current = rows[cur];

  /** ✅ rowsParam/bundleUris가 바뀌어 들어오는 케이스(네비게이션 파라미터 갱신)도 처리 */
  useEffect(() => {
    setRows(initialRows);
    setCur(initialCur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows.length, initialCur]);

  /** rows / row 가 없을 때: 방 전체 미디어 로드 */
  useEffect(() => {
    if ((rowsParam && rowsParam.length) || (bundleUris && bundleUris.length) || rowParam) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id,type,file_bucket,file_key,mime,created_at,sender_id')
          .eq('room_id', roomId)
          .in('type', ['image', 'video'])
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) console.warn('MediaViewer load error', error);
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

  /** ✅ URL 만들기 (file://, content://, http(s)://는 그대로) */
  const getUrl = useCallback(async (r: Row) => {
    const fk = safeTrim(r.file_key);

    if (/^(file|content):\/\//i.test(fk)) return fk;
    if (fk && /^https?:\/\//i.test(fk)) return fk;

    // storage bucket이 비어있는(bundle) 케이스는 fk 자체를 반환할 수밖에 없음
    if (!r.file_bucket) return fk;

    try {
      const { data: pub } = supabase.storage.from(r.file_bucket).getPublicUrl(fk);
      if (pub?.publicUrl) return pub.publicUrl;
    } catch {}

    try {
      const { data, error } = await supabase.storage.from(r.file_bucket).createSignedUrl(fk, 120);
      if (error) throw error;
      return data.signedUrl;
    } catch {
      return '';
    }
  }, []);

  /** ✅ URL 프리패치: 전체 말고 “현재 주변만(±6)” (버벅임/렌더폭발 방지) */
  useEffect(() => {
    let cancelled = false;
    if (!rows.length) return;

    const start = Math.max(0, cur - 6); // 필요하면 2로 줄여
    const end = Math.min(rows.length - 1, cur + 6);
    const targets = rows.slice(start, end + 1);

    (async () => {
      const nextEntries: Record<string, string> = {};
      for (const r of targets) {
        if (cancelled) return;
        const key = getRowKey(r);
        if (urlMap[key]) continue;
        const u = await getUrl(r);
        if (u) nextEntries[key] = u;
      }
      if (cancelled) return;
      if (Object.keys(nextEntries).length) {
        setUrlMap((prev) => ({ ...prev, ...nextEntries }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, cur, getUrl, urlMap]);

  /** ✅ 현재 sender의 닉네임 확보 */
  useEffect(() => {
    const sid = safeTrim(current?.sender);
    if (!sid) return;
    if (!looksLikeUuid(sid)) return;
    if (nameMap[sid]) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('nickname').eq('id', sid).maybeSingle();
        if (cancelled) return;
        if (error) return;

        const nick =
          (data as any)?.nickname ??
          (data as any)?.display_name ??
          (data as any)?.username ??
          (data as any)?.full_name ??
          (data as any)?.name ??
          '';

        if (nick) setNameMap((prev) => ({ ...prev, [sid]: nick }));
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [current?.sender, nameMap]);

  const openExternally = useCallback((u: string) => {
    if (!u) return;
    Linking.openURL(u).catch(() => {});
  }, []);

  const ensureUrl = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      if (urlMap[key]) return urlMap[key];
      const u = await getUrl(r);
      setUrlMap((prev) => ({ ...prev, [key]: u }));
      return u;
    },
    [urlMap, getUrl],
  );

  /** ✅ 원격 URL을 로컬 파일로 다운로드해서 file:// URI 반환 */
  const ensureFileUri = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      if (fileUriMap[key]) return fileUriMap[key];

      const remoteOrLocal = await ensureUrl(r);
      if (!remoteOrLocal) return '';

      if (/^(file|content):\/\//i.test(remoteOrLocal.trim())) {
        setFileUriMap((prev) => ({ ...prev, [key]: remoteOrLocal }));
        return remoteOrLocal;
      }

      if (!FileSystem) return '';

      try {
        const clean = remoteOrLocal.split('?')[0];
        const name = clean.split('/').pop() ?? `${String(r.id)}.jpg`;
        const dest = FileSystem.cacheDirectory + name;
        const { uri } = await FileSystem.downloadAsync(remoteOrLocal, dest);
        setFileUriMap((prev) => ({ ...prev, [key]: uri }));
        return uri;
      } catch {
        return '';
      }
    },
    [fileUriMap, ensureUrl],
  );

  /** 저장 공통 */
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
    async (mode: 'all' | 'current') => {
      if (!current) return;
      setBusy(true);
      try {
        let savedCount = 0;

        if (mode === 'current') {
          const ok = await saveToDevice(current);
          if (ok) savedCount = 1;
        } else {
          const targets = rows.filter((x) => x.type === 'image');
          for (const r of targets) {
            const ok = await saveToDevice(r);
            if (ok) savedCount += 1;
          }
        }

        if (savedCount > 0) {
          Alert.alert('저장 완료', savedCount === 1 ? '사진을 갤러리에 저장했어요.' : `${savedCount}장의 사진을 갤러리에 저장했어요.`);
        } else {
          Alert.alert('저장 실패', '사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
      } finally {
        setBusy(false);
        setModalType(null);
      }
    },
    [current, rows, saveToDevice],
  );

  const runShare = useCallback(
    async (mode: 'all' | 'current' | 'other') => {
      if (!current) return;
      setBusy(true);
      try {
        let target: Row = current;

        if (mode === 'all') {
          const imgs = rows.filter((x) => x.type === 'image');
          if (imgs.length === 0) {
            Alert.alert('공유할 사진이 없습니다.');
            return;
          }
          target = imgs[0];
          Alert.alert('알림', '여러 장 동시 공유는 아직 준비 중이라, 첫 번째 사진만 공유됩니다.');
        }

        const uri = await ensureFileUri(target);
        if (!uri) {
          Alert.alert('공유 실패', '이미지를 불러오지 못했어요.');
          return;
        }

        const canNative = Sharing && (await Sharing.isAvailableAsync());

        if (canNative) {
          await Sharing.shareAsync(uri, { mimeType: target.mime ?? 'image/jpeg' });
        } else {
          try {
            await RNShare.share({ url: uri, message: '', title: '사진 공유' });
          } catch {
            Alert.alert('공유 실패', '이미지를 공유하지 못했어요. 잠시 후 다시 시도해 주세요.');
          }
        }
      } finally {
        setBusy(false);
        setModalType(null);
      }
    },
    [current, rows, ensureFileUri],
  );

  const runDelete = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      // bundle에서 들어온건 서버 삭제할 게 없을 수 있음(file_bucket empty)
      if (current.file_bucket) {
        await supabase.from('chat_messages').delete().eq('id', current.id);
      }

      setRows((prev) => prev.filter((r) => r.id !== current.id));
      setCur((prev) => {
        const next = Math.min(prev, rows.length - 2);
        return next < 0 ? 0 : next;
      });

      setModalType(null);
      if (rows.length <= 1) navigation.goBack();
    } catch {
      setModalType(null);
    } finally {
      setBusy(false);
    }
  }, [current, rows.length, navigation]);

  const toggleControls = useCallback(() => {
    setControlsVisible((v) => !v);
  }, []);

  /** ✅ 스와이프(페이지 넘김)에서 현재 index 갱신 */
  const handleScrollEnd = useCallback(
    (e: any) => {
      const x = e?.nativeEvent?.contentOffset?.x ?? 0;
      const index = Math.round(x / W);
      if (index >= 0 && index < rows.length) setCur(index);
    },
    [rows.length],
  );

  useEffect(() => {
    if (modalType === 'download') setDownloadChoice('current');
    else if (modalType === 'share') setShareChoice('current');
  }, [modalType]);

  // ✅ 헤더 타이틀/서브타이틀 안전화
  const headerTitle = useMemo(() => {
    const t = safeTrim(params.title);
    if (t) return t;

    const nick = safeTrim(current?.nickname);
    if (nick) return nick;

    const sid = safeTrim(current?.sender);
    if (sid && nameMap[sid]) return nameMap[sid];

    if (looksLikeUuid(sid)) return '사진';
    if (sid) return sid;

    return '사진';
  }, [params.title, current?.nickname, current?.sender, nameMap]);

  const headerSub = useMemo(() => {
    const sub = safeTrim(params.subtitle);
    if (sub) return sub;

    if (current?.created_at) return formatDateTimeKorean(current.created_at);
    return '';
  }, [params.subtitle, current?.created_at]);

  const keyExtractor = useCallback((item: Row, index: number) => `${getRowKey(item)}-${index}`, []);

  const onScrollToIndexFailed = useCallback((info: any) => {
    requestAnimationFrame(() => {
      try {
        sliderRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      } catch {}
    });
  }, []);

  // ✅ initialScrollIndex 안정화: rows 변경 후 스크롤 보정
  useEffect(() => {
    if (!rows.length) return;
    const t = setTimeout(() => {
      try {
        sliderRef.current?.scrollToIndex({ index: cur, animated: false });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [rows.length, cur]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* 상단 */}
          <View
            style={[
              st.headerOverlay,
              {
                opacity: controlsVisible ? 1 : 0,
                pointerEvents: controlsVisible ? 'auto' : 'none',
              },
            ]}
          >
            <View style={st.headerRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={st.headerBack}>{'‹'}</Text>
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

              <Text style={st.headerIndex}>{`${cur + 1}/${rows.length || 1}`}</Text>
            </View>
          </View>

          {loading ? (
            <View style={st.center}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : !current ? (
            <View style={st.center}>
              <Text style={st.empty}>미디어가 없습니다.</Text>
            </View>
          ) : (
            <>
              {/* ✅ FlatList가 기본 스와이프 담당. 줌일 때만 scrollEnabled=false */}
              <FlatList
                ref={sliderRef}
                data={rows}
                horizontal
                pagingEnabled
                scrollEnabled={outerScrollEnabled}
                showsHorizontalScrollIndicator={false}
                keyExtractor={keyExtractor}
                initialScrollIndex={cur}
                onScrollToIndexFailed={onScrollToIndexFailed}
                getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
                onMomentumScrollEnd={handleScrollEnd}
                style={{ flex: 1 }}
                windowSize={3}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                removeClippedSubviews
                renderItem={({ item }) => {
                  const u = urlMap[getRowKey(item)];
                  const isImage = item.type === 'image';

                  return (
                    <View style={st.mainSlide}>
                      {isImage ? (
                        u ? (
                          <ZoomableImage
                            uri={u}
                            onToggleControls={toggleControls}
                            onOpenExternally={() => openExternally(u)}
                            setOuterScrollEnabled={setOuterScrollEnabled}
                          />
                        ) : (
                          <View style={st.center}>
                            <ActivityIndicator color="#fff" />
                          </View>
                        )
                      ) : u ? (
                        VideoComp ? (
                          <VideoComp
                            source={{ uri: u }}
                            style={st.mainImage}
                            useNativeControls
                            resizeMode="contain"
                            shouldPlay
                            isLooping={false}
                          />
                        ) : (
                          <Pressable style={st.playFallback} onPress={() => openExternally(u)}>
                            <Text style={st.playTxt}>▶ 동영상 열기</Text>
                            <Text style={st.playSub}>expo-av 미설치 환경</Text>
                          </Pressable>
                        )
                      ) : (
                        <View style={st.center}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      )}
                    </View>
                  );
                }}
              />

              {controlsVisible && (
                <View style={[st.toolbar, { opacity: 1 }]}>
                  <Pressable style={st.toolBtn} onPress={() => setModalType('download')}>
                    <DownloadIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable style={st.toolBtn} onPress={() => setModalType('share')}>
                    <ShareIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable style={st.toolBtn} onPress={() => setModalType('delete')}>
                    <TrashIcon size={22} color="#fecaca" />
                  </Pressable>

                  <Pressable style={st.toolBtn} onPress={() => setModalType('edit-info')}>
                    <EditIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable style={st.toolBtn} onPress={() => setInfoVisible(true)}>
                    <InfoIcon size={22} color="#fff" />
                  </Pressable>
                </View>
              )}

              {controlsVisible && rows.length > 1 && (
                <View style={st.thumbStrip}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.thumbContent}>
                    {rows.map((r, idx) => {
                      const u = urlMap[getRowKey(r)];
                      const isActive = idx === cur;
                      return (
                        <Pressable
                          key={`${getRowKey(r)}-${idx}`}
                          onPress={() => {
                            sliderRef.current?.scrollToIndex({ index: idx, animated: true });
                            setCur(idx);
                          }}
                          style={[st.thumbItem, isActive && st.thumbItemActive]}
                        >
                          {u ? (
                            <Image source={{ uri: u }} style={st.thumbImage} resizeMode="cover" />
                          ) : (
                            <View style={st.thumbPlaceholder}>
                              <ActivityIndicator color="#fff" />
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>

        {/* 사진 정보 모달 */}
        <Modal transparent visible={infoVisible} animationType="fade" onRequestClose={() => setInfoVisible(false)}>
          <Pressable style={st.modalBackdrop} onPress={() => setInfoVisible(false)}>
            <Pressable style={st.modalCard} onPress={() => {}}>
              <Text style={st.modalTitle}>사진 정보</Text>
              {current ? (
                <>
                  <Text style={st.modalText}>ID: {String(current.id)}</Text>
                  <Text style={st.modalText}>타입: {current.type === 'image' ? '이미지' : '동영상'}</Text>
                  <Text style={st.modalText}>버킷: {current.file_bucket || '-'}</Text>
                  <Text style={st.modalText}>경로: {current.file_key || '-'}</Text>
                  <Text style={st.modalText}>MIME: {current.mime ?? '-'}</Text>
                  <Text style={st.modalText}>
                    위치: {cur + 1} / {rows.length || 1}
                  </Text>
                </>
              ) : (
                <Text style={st.modalText}>정보를 불러올 수 없습니다.</Text>
              )}
              <View style={st.modalButtonsRow}>
                <Pressable style={[st.modalButton, st.modalButtonSecondary]} onPress={() => setInfoVisible(false)}>
                  <Text style={st.modalButtonSecondaryText}>닫기</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* 다운로드/공유/삭제/편집 모달 */}
        <Modal transparent visible={modalType !== null} animationType="fade" onRequestClose={() => setModalType(null)}>
          <Pressable style={st.modalBackdrop} onPress={() => !busy && setModalType(null)}>
            {modalType && (
              <Pressable style={st.modalCard} onPress={() => {}}>
                <Text style={st.modalTitle}>
                  {modalType === 'download'
                    ? '사진 저장'
                    : modalType === 'share'
                      ? '사진 공유'
                      : modalType === 'delete'
                        ? '사진 삭제'
                        : '준비 중'}
                </Text>

                {modalType === 'download' && (
                  <>
                    <Text style={st.modalText}>저장 방법을 선택하세요.</Text>
                    <Pressable style={st.choiceRow} disabled={busy} onPress={() => setDownloadChoice('all')}>
                      <View style={st.choiceRadioOuter}>{downloadChoice === 'all' && <View style={st.choiceRadioInner} />}</View>
                      <Text style={st.choiceLabel}>묶음사진 전체 저장</Text>
                    </Pressable>
                    <Pressable style={st.choiceRow} disabled={busy} onPress={() => setDownloadChoice('current')}>
                      <View style={st.choiceRadioOuter}>{downloadChoice === 'current' && <View style={st.choiceRadioInner} />}</View>
                      <Text style={st.choiceLabel}>이 사진만 저장</Text>
                    </Pressable>
                  </>
                )}

                {modalType === 'share' && (
                  <>
                    <Text style={st.modalText}>공유 방법을 선택하세요.</Text>
                    <Pressable style={st.choiceRow} disabled={busy} onPress={() => setShareChoice('all')}>
                      <View style={st.choiceRadioOuter}>{shareChoice === 'all' && <View style={st.choiceRadioInner} />}</View>
                      <Text style={st.choiceLabel}>묶음사진 전체 공유</Text>
                    </Pressable>
                    <Pressable style={st.choiceRow} disabled={busy} onPress={() => setShareChoice('current')}>
                      <View style={st.choiceRadioOuter}>{shareChoice === 'current' && <View style={st.choiceRadioInner} />}</View>
                      <Text style={st.choiceLabel}>이 사진만 공유</Text>
                    </Pressable>
                    <Pressable style={st.choiceRow} disabled={busy} onPress={() => setShareChoice('other')}>
                      <View style={st.choiceRadioOuter}>{shareChoice === 'other' && <View style={st.choiceRadioInner} />}</View>
                      <Text style={st.choiceLabel}>다른 앱으로 공유</Text>
                    </Pressable>
                  </>
                )}

                {modalType === 'delete' && (
                  <>
                    <Text style={st.modalText}>선택한 사진 또는 동영상을 삭제하시겠습니까?</Text>
                    <Text style={st.modalSubText}>묶음 사진은 전체 사진이 함께 삭제됩니다.</Text>
                  </>
                )}

                {modalType === 'edit-info' && <Text style={st.modalText}>사진 편집 기능은 추후 제공될 예정입니다.</Text>}

                <View style={st.modalButtonsRow}>
                  <Pressable style={[st.modalButton, st.modalButtonSecondary]} disabled={busy} onPress={() => setModalType(null)}>
                    <Text style={st.modalButtonSecondaryText}>취소</Text>
                  </Pressable>

                  {modalType === 'delete' && (
                    <Pressable style={[st.modalButton, st.modalButtonPrimary]} disabled={busy} onPress={runDelete}>
                      <Text style={st.modalButtonPrimaryText}>{busy ? '삭제중…' : '확인'}</Text>
                    </Pressable>
                  )}

                  {modalType === 'download' && (
                    <Pressable style={[st.modalButton, st.modalButtonPrimary]} disabled={busy} onPress={() => runDownload(downloadChoice)}>
                      <Text style={st.modalButtonPrimaryText}>{busy ? '저장중…' : '확인'}</Text>
                    </Pressable>
                  )}

                  {modalType === 'share' && (
                    <Pressable style={[st.modalButton, st.modalButtonPrimary]} disabled={busy} onPress={() => runShare(shareChoice)}>
                      <Text style={st.modalButtonPrimaryText}>{busy ? '공유중…' : '확인'}</Text>
                    </Pressable>
                  )}

                  {modalType === 'edit-info' && (
                    <Pressable style={[st.modalButton, st.modalButtonPrimary]} disabled={busy} onPress={() => setModalType(null)}>
                      <Text style={st.modalButtonPrimaryText}>확인</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            )}
          </Pressable>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#9ca3af' },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: '#000000b3',
  },
  headerRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerBack: {
    fontSize: 26,
    color: '#f9fafb',
    width: 32,
    textAlign: 'left',
  },
  headerTextWrap: { flex: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#f9fafb' },
  headerSub: { marginTop: 2, fontSize: 11, color: '#d1d5db' },
  headerIndex: { fontSize: 12, color: '#e5e7eb', width: 40, textAlign: 'right' },
  mainSlide: { width: W, height: H, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  mainImage: { width: '100%', height: '100%' },
  playFallback: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827cc',
    borderRadius: 12,
    alignItems: 'center',
  },
  playTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  playSub: { color: '#cbd5e1', marginTop: 4, fontSize: 12 },
  thumbStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    height: 84,
    backgroundColor: '#000000b3',
    paddingVertical: 8,
  },
  thumbContent: { paddingHorizontal: 10, alignItems: 'center' },
  thumbItem: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#111827',
  },
  thumbItemActive: { borderColor: '#facc15', borderWidth: 2 },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f2937' },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    backgroundColor: '#000000b3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  toolBtn: { alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: '#00000080', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: W * 0.82, borderRadius: 18, backgroundColor: '#ffffff', paddingHorizontal: 18, paddingVertical: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 13, color: '#4b5563', marginBottom: 6 },
  modalSubText: { fontSize: 12, color: '#9ca3af', marginBottom: 10 },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalButton: {
    minWidth: 72,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  modalButtonSecondary: { backgroundColor: '#e5e7eb' },
  modalButtonSecondaryText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  modalButtonPrimary: { backgroundColor: '#ef4444' },
  modalButtonPrimaryText: { fontSize: 13, color: '#f9fafb', fontWeight: '700' },
  choiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  choiceRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  choiceRadioInner: { width: 10, height: 10, borderRadius: 999, backgroundColor: '#ef4444' },
  choiceLabel: { fontSize: 13, color: '#111827' },
});
