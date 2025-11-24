// src/screens/chat/MediaViewer.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

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
  /** 상단바: 보낸 사람 닉네임 / 보낸 날짜+시간 */
  title?: string;
  subtitle?: string;
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

type ModalType =
  | 'download'
  | 'share'
  | 'delete'
  | 'info-none'
  | 'edit-info'
  | null;

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

/** ✅ 묶음 사진 지원: id 말고 file_key 기준 키 사용 */
const getRowKey = (r: Row): string =>
  r.file_key ? `fk:${r.file_key}` : `id:${String(r.id)}`;

/** 개별 이미지에 핀치줌 + 탭/롱탭을 적용하는 컴포넌트 */
type ZoomableImageProps = {
  uri: string;
  onToggleControls: () => void;
  onOpenExternally: () => void;
};

function ZoomableImage({
  uri,
  onToggleControls,
  onOpenExternally,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      const nextScale = Math.min(Math.max(e.scale, 1), 4);
      scale.value = nextScale;
      focalX.value = e.focalX - W / 2;
      focalY.value = e.focalY - H / 2;
    })
    .onEnd(() => {
      if (scale.value < 1.01) {
        scale.value = withTiming(1);
        focalX.value = withTiming(0);
        focalY.value = withTiming(0);
      }
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    runOnJS(onToggleControls)();
  });

  const longPress = Gesture.LongPress()
    .minDuration(300)
    .onEnd(() => {
      runOnJS(onOpenExternally)();
    });

  const composed = Gesture.Simultaneous(pinch, singleTap, longPress);

  const animatedStyle = useAnimatedStyle(() => {
    const s = scale.value;
    return {
      transform: [
        { translateX: focalX.value },
        { translateY: focalY.value },
        { scale: s },
        { translateX: -focalX.value },
        { translateY: -focalY.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.Image
        source={{ uri }}
        style={[st.mainImage as any, animatedStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  );
}

export default function MediaViewer() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {
    roomId,
    rows: rowsParam,
    index: indexParam = 0,
    row,
    title,
    subtitle,
  } = (route.params ?? {}) as Params;

  const [rows, setRows] = useState<Row[]>(
    () => rowsParam ?? (row ? [row] : []),
  );
  const [cur, setCur] = useState(
    Math.max(0, Math.min(indexParam, (rowsParam?.length ?? 1) - 1)),
  );
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [fileUriMap, setFileUriMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!rowsParam && !row);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);

  // 라디오 선택 상태 (다운로드 / 공유)
  const [downloadChoice, setDownloadChoice] = useState<'all' | 'current'>(
    'current',
  );
  const [shareChoice, setShareChoice] = useState<
    'all' | 'current' | 'other'
  >('current');

  const sliderRef = useRef<FlatList<Row>>(null);

  const current = rows[cur];

  /** rows / row 가 없을 때: 방 전체 미디어 로드 */
  useEffect(() => {
    if (rowsParam || row) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id,type,file_bucket,file_key,mime,created_at')
          .eq('room_id', roomId)
          .in('type', ['image', 'video'])
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) console.warn('MediaViewer load error', error);
        if (!mounted) return;
        const normalized: Row[] =
          (data ?? []).map(d => ({
            ...d,
            id: String(d.id),
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
  }, [roomId, rowsParam, row]);

  /** URL 만들기 (Chat.tsx 에서 file_key 에 완성 URL 넣으면 그대로 사용) */
  const getUrl = useCallback(async (r: Row) => {
    if (r.file_key && /^https?:\/\//.test(r.file_key)) {
      return r.file_key;
    }
    try {
      const { data: pub } = supabase.storage
        .from(r.file_bucket)
        .getPublicUrl(r.file_key);
      if (pub?.publicUrl) return pub.publicUrl;
    } catch {}
    try {
      const { data, error } = await supabase.storage
        .from(r.file_bucket)
        .createSignedUrl(r.file_key, 120);
      if (error) throw error;
      return data.signedUrl;
    } catch {
      return '';
    }
  }, []);

  /** 모든 rows 에 대해 URL 미리 확보 */
  useEffect(() => {
    let cancelled = false;
    if (!rows.length) return;

    (async () => {
      for (const r of rows) {
        if (cancelled) return;
        const key = getRowKey(r);
        if (urlMap[key]) continue;
        const u = await getUrl(r);
        if (!cancelled) {
          setUrlMap(prev => ({ ...prev, [key]: u }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, getUrl, urlMap]);

  const openExternally = useCallback((u: string) => {
    if (!u) return;
    Linking.openURL(u).catch(() => {});
  }, []);

  const label = useMemo(
    () => `${cur + 1}/${rows.length || 1}`,
    [cur, rows.length],
  );

  const ensureUrl = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      if (urlMap[key]) return urlMap[key];
      const u = await getUrl(r);
      setUrlMap(prev => ({ ...prev, [key]: u }));
      return u;
    },
    [urlMap, getUrl],
  );

  /** 원격 URL을 로컬 파일로 다운로드해서 file:// URI 반환 */
  const ensureFileUri = useCallback(
    async (r: Row): Promise<string> => {
      const key = getRowKey(r);
      if (fileUriMap[key]) return fileUriMap[key];
      if (!FileSystem) return '';

      const remote = await ensureUrl(r);
      if (!remote) return '';

      try {
        const clean = remote.split('?')[0];
        const name = clean.split('/').pop() ?? `${String(r.id)}.jpg`;
        const dest = FileSystem.cacheDirectory + name;
        const { uri } = await FileSystem.downloadAsync(remote, dest);
        setFileUriMap(prev => ({ ...prev, [key]: uri }));
        return uri;
      } catch {
        return '';
      }
    },
    [fileUriMap, ensureUrl],
  );

  /** 저장 공통 함수: Row -> 로컬 파일 -> 앨범 저장 */
  const saveToDevice = useCallback(
    async (r: Row): Promise<boolean> => {
      if (!MediaLibrary || !FileSystem) {
        return false;
      }
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

  /** 다운로드 실행 (전체/현재) */
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
          const targets = rows.filter(x => x.type === 'image');
          for (const r of targets) {
            const ok = await saveToDevice(r);
            if (ok) savedCount += 1;
          }
        }

        if (savedCount > 0) {
          Alert.alert(
            '저장 완료',
            savedCount === 1
              ? '사진을 갤러리에 저장했어요.'
              : `${savedCount}장의 사진을 갤러리에 저장했어요.`,
          );
        } else {
          Alert.alert(
            '저장 실패',
            '사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
          );
        }
      } finally {
        setBusy(false);
        setModalType(null);
      }
    },
    [current, rows, saveToDevice],
  );

  /** 공유 실행 (전체/현재/다른앱) - 실제 이미지 파일 공유 */
  const runShare = useCallback(
    async (mode: 'all' | 'current' | 'other') => {
      if (!current) return;
      setBusy(true);
      try {
        let target: Row = current;

        if (mode === 'all') {
          const imgs = rows.filter(x => x.type === 'image');
          if (imgs.length === 0) {
            Alert.alert('공유할 사진이 없습니다.');
            return;
          }
          // TODO: 여러 장 동시 공유 구현. 지금은 첫 장만.
          target = imgs[0];
          Alert.alert(
            '알림',
            '여러 장 동시 공유는 아직 준비 중이라, 첫 번째 사진만 공유됩니다.',
          );
        }

        const uri = await ensureFileUri(target);
        if (!uri) {
          Alert.alert('공유 실패', '이미지를 불러오지 못했어요.');
          return;
        }

        const canNative =
          Sharing && (await Sharing.isAvailableAsync());

        if (canNative) {
          await Sharing.shareAsync(uri, {
            mimeType: target.mime ?? 'image/jpeg',
          });
        } else {
          try {
            await RNShare.share({
              url: uri,
              message: '',
              title: '사진 공유',
            });
          } catch {
            Alert.alert(
              '공유 실패',
              '이미지를 공유하지 못했어요. 잠시 후 다시 시도해 주세요.',
            );
          }
        }
      } finally {
        setBusy(false);
        setModalType(null);
      }
    },
    [current, rows, ensureFileUri],
  );

  /** 삭제 실행 (지금은 메시지 자체만 삭제) */
  const runDelete = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      await supabase.from('chat_messages').delete().eq('id', current.id);
      setRows(prev => prev.filter(r => r.id !== current.id));
      setCur(prev => {
        const next = Math.min(prev, rows.length - 2);
        return next < 0 ? 0 : next;
      });
      setModalType(null);
      if (rows.length <= 1) {
        navigation.goBack();
      }
    } catch {
      setModalType(null);
    } finally {
      setBusy(false);
    }
  }, [current, rows.length, navigation]);

  /** 탭으로 상/하단 UI 숨기기 */
  const toggleControls = useCallback(() => {
    setControlsVisible(v => !v);
  }, []);

  /** 슬라이더 스크롤 끝나면 index 계산 */
  const handleScrollEnd = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const index = Math.round(x / W);
    if (index >= 0 && index < rows.length) {
      setCur(index);
    }
  };

  // 모달 열릴 때마다 라디오 기본값 리셋
  useEffect(() => {
    if (modalType === 'download') {
      setDownloadChoice('current');
    } else if (modalType === 'share') {
      setShareChoice('current');
    }
  }, [modalType]);

  // 헤더: param 우선, 없으면 현재 Row 기준으로 보낸사람/날짜, 그래도 없으면 '사진'
  const headerTitle =
    title ?? current?.nickname ?? current?.sender ?? '사진';
  const headerSub =
    subtitle ??
    (current?.created_at
      ? formatDateTimeKorean(current.created_at)
      : '');

  const headerOpacity = controlsVisible ? 1 : 0;
  const toolbarOpacity = controlsVisible ? 1 : 0;

  const keyExtractor = (item: Row, index: number) =>
    `${getRowKey(item)}-${index}`;

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: '#000' }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* 상단: 반투명 검정, 좌측 ←, 가운데 닉네임/날짜, 우측 index */}
          <View
            style={[
              st.headerOverlay,
              {
                opacity: headerOpacity,
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
              <Text style={st.headerIndex}>{label}</Text>
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
              {/* 메인 슬라이더 */}
              <FlatList
                ref={sliderRef}
                data={rows}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={keyExtractor}
                initialScrollIndex={cur}
                getItemLayout={(_, index) => ({
                  length: W,
                  offset: W * index,
                  index,
                })}
                onMomentumScrollEnd={handleScrollEnd}
                style={{ flex: 1 }}
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
                          <Pressable
                            style={st.playFallback}
                            onPress={() => openExternally(u)}
                          >
                            <Text style={st.playTxt}>▶ 동영상 열기</Text>
                            <Text style={st.playSub}>
                              expo-av 미설치 환경
                            </Text>
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

              {/* 하단 툴바 */}
              {controlsVisible && (
                <View style={[st.toolbar, { opacity: toolbarOpacity }]}>
                  <Pressable
                    style={st.toolBtn}
                    onPress={() => setModalType('download')}
                  >
                    <DownloadIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable
                    style={st.toolBtn}
                    onPress={() => setModalType('share')}
                  >
                    <ShareIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable
                    style={st.toolBtn}
                    onPress={() => setModalType('delete')}
                  >
                    <TrashIcon size={22} color="#fecaca" />
                  </Pressable>

                  <Pressable
                    style={st.toolBtn}
                    onPress={() => setModalType('edit-info')}
                  >
                    <EditIcon size={22} color="#fff" />
                  </Pressable>

                  <Pressable
                    style={st.toolBtn}
                    onPress={() => setInfoVisible(true)}
                  >
                    <InfoIcon size={22} color="#fff" />
                  </Pressable>
                </View>
              )}

              {/* 썸네일 스트립 */}
              {controlsVisible && rows.length > 1 && (
                <View style={st.thumbStrip}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={st.thumbContent}
                  >
                    {rows.map((r, idx) => {
                      const u = urlMap[getRowKey(r)];
                      const isActive = idx === cur;
                      return (
                        <Pressable
                          key={`${getRowKey(r)}-${idx}`}
                          onPress={() => {
                            sliderRef.current?.scrollToIndex({
                              index: idx,
                              animated: true,
                            });
                            setCur(idx);
                          }}
                          style={[
                            st.thumbItem,
                            isActive && st.thumbItemActive,
                          ]}
                        >
                          {u ? (
                            <Image
                              source={{ uri: u }}
                              style={st.thumbImage}
                              resizeMode="cover"
                            />
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
        <Modal
          transparent
          visible={infoVisible}
          animationType="fade"
          onRequestClose={() => setInfoVisible(false)}
        >
          <Pressable
            style={st.modalBackdrop}
            onPress={() => setInfoVisible(false)}
          >
            <Pressable style={st.modalCard} onPress={() => {}}>
              <Text style={st.modalTitle}>사진 정보</Text>
              {current ? (
                <>
                  <Text style={st.modalText}>
                    ID: {String(current.id)}
                  </Text>
                  <Text style={st.modalText}>
                    타입:{' '}
                    {current.type === 'image' ? '이미지' : '동영상'}
                  </Text>
                  <Text style={st.modalText}>
                    버킷: {current.file_bucket || '-'}
                  </Text>
                  <Text style={st.modalText}>
                    경로: {current.file_key || '-'}
                  </Text>
                  <Text style={st.modalText}>
                    MIME: {current.mime ?? '-'}
                  </Text>
                  <Text style={st.modalText}>
                    위치: {cur + 1} / {rows.length || 1}
                  </Text>
                </>
              ) : (
                <Text style={st.modalText}>
                  정보를 불러올 수 없습니다.
                </Text>
              )}
              <View style={st.modalButtonsRow}>
                <Pressable
                  style={[st.modalButton, st.modalButtonSecondary]}
                  onPress={() => setInfoVisible(false)}
                >
                  <Text style={st.modalButtonSecondaryText}>닫기</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* 다운로드/공유/삭제/편집 모달 */}
        <Modal
          transparent
          visible={modalType !== null}
          animationType="fade"
          onRequestClose={() => setModalType(null)}
        >
          <Pressable
            style={st.modalBackdrop}
            onPress={() => !busy && setModalType(null)}
          >
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
                    <Text style={st.modalText}>
                      저장 방법을 선택하세요.
                    </Text>
                    <Pressable
                      style={st.choiceRow}
                      disabled={busy}
                      onPress={() => setDownloadChoice('all')}
                    >
                      <View style={st.choiceRadioOuter}>
                        {downloadChoice === 'all' && (
                          <View style={st.choiceRadioInner} />
                        )}
                      </View>
                      <Text style={st.choiceLabel}>
                        묶음사진 전체 저장
                      </Text>
                    </Pressable>
                    <Pressable
                      style={st.choiceRow}
                      disabled={busy}
                      onPress={() => setDownloadChoice('current')}
                    >
                      <View style={st.choiceRadioOuter}>
                        {downloadChoice === 'current' && (
                          <View style={st.choiceRadioInner} />
                        )}
                      </View>
                      <Text style={st.choiceLabel}>
                        이 사진만 저장
                      </Text>
                    </Pressable>
                  </>
                )}

                {modalType === 'share' && (
                  <>
                    <Text style={st.modalText}>
                      공유 방법을 선택하세요.
                    </Text>
                    <Pressable
                      style={st.choiceRow}
                      disabled={busy}
                      onPress={() => setShareChoice('all')}
                    >
                      <View style={st.choiceRadioOuter}>
                        {shareChoice === 'all' && (
                          <View style={st.choiceRadioInner} />
                        )}
                      </View>
                      <Text style={st.choiceLabel}>
                        묶음사진 전체 공유
                      </Text>
                    </Pressable>
                    <Pressable
                      style={st.choiceRow}
                      disabled={busy}
                      onPress={() => setShareChoice('current')}
                    >
                      <View style={st.choiceRadioOuter}>
                        {shareChoice === 'current' && (
                          <View style={st.choiceRadioInner} />
                        )}
                      </View>
                      <Text style={st.choiceLabel}>
                        이 사진만 공유
                      </Text>
                    </Pressable>
                    <Pressable
                      style={st.choiceRow}
                      disabled={busy}
                      onPress={() => setShareChoice('other')}
                    >
                      <View style={st.choiceRadioOuter}>
                        {shareChoice === 'other' && (
                          <View style={st.choiceRadioInner} />
                        )}
                      </View>
                      <Text style={st.choiceLabel}>
                        다른 앱으로 공유
                      </Text>
                    </Pressable>
                  </>
                )}

                {modalType === 'delete' && (
                  <>
                    <Text style={st.modalText}>
                      선택한 사진 또는 동영상을 삭제하시겠습니까?
                    </Text>
                    <Text style={st.modalSubText}>
                      묶음 사진은 전체 사진이 함께 삭제됩니다.
                    </Text>
                  </>
                )}

                {modalType === 'edit-info' && (
                  <>
                    <Text style={st.modalText}>
                      사진 편집 기능은 추후 제공될 예정입니다.
                    </Text>
                  </>
                )}

                <View style={st.modalButtonsRow}>
                  <Pressable
                    style={[
                      st.modalButton,
                      st.modalButtonSecondary,
                    ]}
                    disabled={busy}
                    onPress={() => setModalType(null)}
                  >
                    <Text style={st.modalButtonSecondaryText}>
                      취소
                    </Text>
                  </Pressable>

                  {modalType === 'delete' && (
                    <Pressable
                      style={[
                        st.modalButton,
                        st.modalButtonPrimary,
                      ]}
                      disabled={busy}
                      onPress={runDelete}
                    >
                      <Text style={st.modalButtonPrimaryText}>
                        {busy ? '삭제중…' : '확인'}
                      </Text>
                    </Pressable>
                  )}

                  {modalType === 'download' && (
                    <Pressable
                      style={[
                        st.modalButton,
                        st.modalButtonPrimary,
                      ]}
                      disabled={busy}
                      onPress={() => runDownload(downloadChoice)}
                    >
                      <Text style={st.modalButtonPrimaryText}>
                        {busy ? '저장중…' : '확인'}
                      </Text>
                    </Pressable>
                  )}

                  {modalType === 'share' && (
                    <Pressable
                      style={[
                        st.modalButton,
                        st.modalButtonPrimary,
                      ]}
                      disabled={busy}
                      onPress={() => runShare(shareChoice)}
                    >
                      <Text style={st.modalButtonPrimaryText}>
                        {busy ? '공유중…' : '확인'}
                      </Text>
                    </Pressable>
                  )}

                  {modalType === 'edit-info' && (
                    <Pressable
                      style={[
                        st.modalButton,
                        st.modalButtonPrimary,
                      ]}
                      disabled={busy}
                      onPress={() => setModalType(null)}
                    >
                      <Text style={st.modalButtonPrimaryText}>
                        확인
                      </Text>
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
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f9fafb',
  },
  headerSub: {
    marginTop: 2,
    fontSize: 11,
    color: '#d1d5db',
  },
  headerIndex: {
    fontSize: 12,
    color: '#e5e7eb',
    width: 40,
    textAlign: 'right',
  },
  mainSlide: {
    width: W,
    height: H,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
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
  thumbContent: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  thumbItem: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#111827',
  },
  thumbItemActive: {
    borderColor: '#facc15',
    borderWidth: 2,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
  },
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
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: W * 0.82,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 6,
  },
  modalSubText: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 10,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  modalButton: {
    minWidth: 72,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  modalButtonSecondary: {
    backgroundColor: '#e5e7eb',
  },
  modalButtonSecondaryText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  modalButtonPrimary: {
    backgroundColor: '#ef4444',
  },
  modalButtonPrimaryText: {
    fontSize: 13,
    color: '#f9fafb',
    fontWeight: '700',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
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
  choiceRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  choiceLabel: {
    fontSize: 13,
    color: '#111827',
  },
});
