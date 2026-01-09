// src/screens/chat/MediaPickerModal.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  ImageSourcePropType,
  Platform,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';

type PickedAsset = {
  uri: string;
  filename: string;
  isVideo: boolean;

  /** ✅ 레이아웃(깜빡임 제거)용 메타 */
  width?: number;
  height?: number;

  /** (선택) 영상 길이도 원하면 여기 */
  durationSec?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  photoQuality: 'low' | 'standard' | 'original';
  videoQuality: 'standard' | 'high';
  onChangePhotoQuality: (q: 'low' | 'standard' | 'original') => void;
  onChangeVideoQuality: (q: 'standard' | 'high') => void;
  onSendSelected: (assets: PickedAsset[], bundleSend: boolean) => Promise<void>;
  themeColor: string;

  /** 아이콘 소스 (이미지) */
  downArrowSource?: ImageSourcePropType;
  editIconSource?: ImageSourcePropType;
  qualityIconSource?: ImageSourcePropType;
};

export default function MediaPickerModal({
  visible,
  onClose,
  photoQuality,
  videoQuality,
  onChangePhotoQuality,
  onChangeVideoQuality,
  onSendSelected,
  themeColor,
  downArrowSource,
  editIconSource,
  qualityIconSource,
}: Props) {
  if (!visible) return null;

  const { width: W, height: H } = Dimensions.get('window');

  /** ===== Sheet geometry ===== */
  const SHEET_MAX = Math.round(H * 0.9); // 시트 전체 높이
  const SHEET_MIN = Math.round(H * 0.45); // 축소 상태의 전체 보이는 높이(하단바 별개)
  const BOTTOM_BAR_H = 56; // 고정 하단 바 높이

  const _rawOffset = SHEET_MAX - (SHEET_MIN + Math.floor(BOTTOM_BAR_H * 0.35));
  const COMPACT_OFFSET = Math.max(0, _rawOffset);

  /** ===== Layout constants ===== */
  const SELECTED_STRIP_H = 60;
  const SAFE_PAD = Platform.OS === 'android' ? 10 : 6;

  // 썸네일 격자
  const GRID_SIDE_PAD = 12;
  const GRID_COL_GAP = 6;
  const GRID_ROW_GAP = 10;
  const thumbSize = Math.floor((W - GRID_SIDE_PAD * 2 - GRID_COL_GAP * 2) / 3);
  const ROW_H = thumbSize + GRID_ROW_GAP; // FlatList getItemLayout용

  /** ===== States ===== */
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<MediaLibrary.Album | null>(null);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [bundleSend, setBundleSend] = useState(true); // ✅ 사진 묶어보내기 토글
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [showQualityPopup, setShowQualityPopup] = useState(false);

  /** ===== translateY 애니메이션 ===== */
  const ty = useRef(new Animated.Value(COMPACT_OFFSET)).current;

  const springTo = useCallback(
    (expanded: boolean) => {
      Animated.spring(ty, {
        toValue: expanded ? 0 : COMPACT_OFFSET,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
        mass: 0.7,
        velocity: 0.4,
      }).start();
    },
    [ty, COMPACT_OFFSET],
  );

  /** ===== 초기화 + 권한 ===== */
  useEffect(() => {
    ty.setValue(COMPACT_OFFSET);
    setShowAlbumDropdown(false);
    (async () => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다.');
          onClose();
          return;
        }
        const albs = await MediaLibrary.getAlbumsAsync();
        setAlbums(albs);
        setCurrentAlbum(null); // 전체보기
      } catch (e: any) {
        Alert.alert('앨범 로드 실패', e?.message ?? String(e));
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** ===== 자산 로드 ===== */
  useEffect(() => {
    (async () => {
      const opt: MediaLibrary.AssetsOptions = {
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
        first: 300,
        ...(currentAlbum ? { album: currentAlbum } : {}),
      };
      const res = await MediaLibrary.getAssetsAsync(opt);
      setAssets(res.assets);
      // @ts-ignore
      setTotalCount(typeof res.totalCount === 'number' ? res.totalCount : res.assets.length);
    })();
  }, [currentAlbum]);

  /** ===== drag to expand/collapse ===== */
  const rafRef = useRef<number | null>(null);
  const start = useRef({ y: 0, ty0: 0 }).current;

  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
    onStartShouldSetPanResponder: () => false,
    onPanResponderGrant: (_, g) => {
      start.y = g.y0;
      // @ts-ignore
      ty.stopAnimation((v: number) => (start.ty0 = v));
    },
    onPanResponderMove: (_, g) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const dy = g.moveY - start.y; // + 아래
        let next = start.ty0 + dy;
        if (next < 0) next = 0;
        if (next > COMPACT_OFFSET) next = COMPACT_OFFSET;
        ty.setValue(next);
      });
    },
    onPanResponderRelease: (_, g) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // @ts-ignore
      ty.stopAnimation((v: number) => {
        const goExpanded =
          g.vy < -0.45 || v < COMPACT_OFFSET * 0.45 || (v < COMPACT_OFFSET * 0.6 && g.dy < -64);
        springTo(goExpanded);
      });
    },
  });
  const dragHandlers = pan.panHandlers;

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  /** ===== select / send ===== */
  const isSelected = useCallback((u: string) => selectedUris.includes(u), [selectedUris]);
  const selectedIndex = useCallback((u: string) => selectedUris.indexOf(u), [selectedUris]);

  const toggleSelect = useCallback((u: string) => {
    setSelectedUris((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  }, []);
  const removeSelected = useCallback((u: string) => {
    setSelectedUris((p) => p.filter((x) => x !== u));
  }, []);

  const sendNow = useCallback(async () => {
    const sel = assets.filter((a) => selectedUris.includes(a.uri));
    if (sel.length === 0) return;

    const packed: PickedAsset[] = [];

    for (const a of sel) {
      const isVideo = a.mediaType === MediaLibrary.MediaType.video;

      let uri = a.uri;
      let filename = a.filename || (isVideo ? `video_${Date.now()}.mp4` : `image_${Date.now()}.jpg`);

      // ✅ 원본 메타 (expo-media-library Asset에 width/height 존재)
      let outW = typeof (a as any).width === 'number' ? (a as any).width : undefined;
      let outH = typeof (a as any).height === 'number' ? (a as any).height : undefined;

      // 사진 화질 옵션 적용 (original 아닐 때 압축)
      if (!isVideo && photoQuality !== 'original') {
        const q = photoQuality === 'low' ? 0.3 : 0.7;
        try {
          const m = await ImageManipulator.manipulateAsync(a.uri, [], {
            compress: q,
            format: ImageManipulator.SaveFormat.JPEG,
          });

          uri = m.uri;
          filename = filename.replace(/\.\w+$/, '.jpg');

          // ✅ 조작 결과 메타가 있으면 그걸 우선 사용 (없으면 원본 메타 유지)
          if (typeof (m as any).width === 'number') outW = (m as any).width;
          if (typeof (m as any).height === 'number') outH = (m as any).height;
        } catch {
          // silent
        }
      }

      packed.push({
        uri,
        filename,
        isVideo,
        width: outW,
        height: outH,
        durationSec: isVideo ? (typeof a.duration === 'number' ? a.duration : undefined) : undefined,
      });
    }

    // ✅ Chat.tsx 쪽에서 "[images]"로 묶을지 판단할 수 있도록
    // "사진만 2장 이상 & 묶어보내기 ON" 인 경우에만 bundle 플래그를 true로 보냄
    const allImages = packed.every((p) => !p.isVideo);
    const effectiveBundleSend = bundleSend && packed.length > 1 && allImages;

    await onSendSelected(packed, effectiveBundleSend);
    setSelectedUris([]);
    onClose();
    springTo(false);
  }, [assets, selectedUris, bundleSend, photoQuality, onSendSelected, onClose, springTo]);

  /** ===== display helpers ===== */
  const albumTitle = currentAlbum ? currentAlbum.title : '전체보기';
  const titleWithCount = `${albumTitle} ${totalCount.toLocaleString()}`;
  const selectedAssets = useMemo(
    () => selectedUris.map((u) => assets.find((a) => a.uri === u)).filter(Boolean) as MediaLibrary.Asset[],
    [selectedUris, assets],
  );

  // 그리드가 고정 하단 바와 겹치지 않도록 항상 패딩 확보
  const gridPadBottom = BOTTOM_BAR_H + (selectedAssets.length ? SELECTED_STRIP_H : 0) + SAFE_PAD + 10;

  const fmtDur = (sec?: number) => {
    if (!sec || sec <= 0) return '0:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  /** ===== RENDER ===== */
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={S.backdrop}>
        {/* === 움직이는 시트 레이어 === */}
        <Animated.View
          renderToHardwareTextureAndroid
          needsOffscreenAlphaCompositing
          collapsable={false}
          pointerEvents="box-none"
          style={[
            S.sheet,
            {
              height: SHEET_MAX,
              transform: [{ translateY: ty }],
              backfaceVisibility: 'hidden',
            },
          ]}
        >
          {/* 안쪽 마스크 (모서리/배경/클리핑 담당) */}
          <View style={S.sheetMask}>
            {/* Top bar (드래그 가능) */}
            <View style={S.topBar} {...dragHandlers}>
              <Pressable onPress={() => { onClose(); springTo(false); }} style={S.topLeftBtn} hitSlop={8}>
                <Text style={S.topX}>×</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowAlbumDropdown((v) => !v)}
                style={S.centerTapArea}
                hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
              >
                <View style={S.centerRow}>
                  <Text numberOfLines={1} style={S.centerTitle}>{titleWithCount}</Text>
                  {downArrowSource ? (
                    <Image source={downArrowSource} style={S.downArrowImg} resizeMode="contain" />
                  ) : (
                    <Text style={S.downArrowTxt}>▾</Text>
                  )}
                </View>
              </Pressable>

              <Pressable
                onPress={sendNow}
                disabled={selectedUris.length === 0}
                style={[S.topRightSend, { backgroundColor: selectedUris.length ? themeColor : '#e5e7eb' }]}
                hitSlop={6}
              >
                <Text style={[S.sendPillTxt, { color: selectedUris.length ? '#fff' : '#9ca3af' }]}>
                  전송 {selectedUris.length}
                </Text>
              </Pressable>
            </View>

            {/* 핸들 (드래그 가능) */}
            <View style={S.handleArea} {...dragHandlers}>
              <View style={S.handleBar} />
            </View>

            {/* 선택 썸네일 스트립 */}
            {!!selectedAssets.length && (
              <FlatList
                data={selectedAssets}
                keyExtractor={(a) => a.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={S.selStrip}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <View style={S.selItem}>
                    {/* @ts-ignore - Android 최적화 */}
                    <Image source={{ uri: item.uri }} style={S.selImg} fadeDuration={0} />
                    <Pressable style={S.selClose} hitSlop={6} onPress={() => removeSelected(item.uri)}>
                      <Text style={S.selCloseTxt}>×</Text>
                    </Pressable>
                  </View>
                )}
              />
            )}

            {/* 앨범 드롭다운 */}
            {showAlbumDropdown && (
              <View style={S.dropdownWrap} pointerEvents="box-none">
                <View style={S.dropdown}>
                  <FlatList
                    data={[{ id: 'all', title: '전체보기', assetCount: totalCount } as any, ...albums]}
                    keyExtractor={(it) => it.id}
                    renderItem={({ item }) => {
                      const title = item.id === 'all' ? '전체보기' : item.title;
                      const count: number | undefined =
                        typeof (item as any).assetCount === 'number'
                          ? (item as any).assetCount
                          : ((item as MediaLibrary.Album).assetCount as any);
                      return (
                        <Pressable
                          onPress={() => {
                            setCurrentAlbum(item.id === 'all' ? null : (item as MediaLibrary.Album));
                            setShowAlbumDropdown(false);
                          }}
                          style={S.dropdownRow}
                        >
                          <Text style={S.dropdownTxt}>{title}</Text>
                          {!!count && <Text style={S.dropdownCnt}>{count.toLocaleString()}</Text>}
                        </Pressable>
                      );
                    }}
                  />
                </View>
              </View>
            )}

            {/* 그리드 */}
            <FlatList
              data={assets}
              keyExtractor={(it) => it.id}
              numColumns={3}
              contentContainerStyle={{ paddingHorizontal: GRID_SIDE_PAD, paddingBottom: gridPadBottom }}
              columnWrapperStyle={{ columnGap: GRID_COL_GAP, justifyContent: 'flex-start' } as any}
              initialNumToRender={36}
              windowSize={15}
              removeClippedSubviews
              maxToRenderPerBatch={48}
              updateCellsBatchingPeriod={16}
              scrollEventThrottle={16}
              {...(Platform.OS === 'android' ? { overScrollMode: 'never' as any } : {})}
              getItemLayout={(_, index) => {
                const row = Math.floor(index / 3);
                return { length: ROW_H, offset: row * ROW_H, index };
              }}
              renderItem={({ item }) => {
                const sel = isSelected(item.uri);
                const idx = selectedIndex(item.uri);
                const isVideo = item.mediaType === MediaLibrary.MediaType.video;
                return (
                  <Pressable
                    onPress={() => toggleSelect(item.uri)}
                    style={[S.thumbBox, { width: thumbSize, height: thumbSize, marginBottom: GRID_ROW_GAP }]}
                  >
                    {/* @ts-ignore - Android 최적화 */}
                    <Image source={{ uri: item.uri }} style={S.thumbImg} fadeDuration={0} />

                    {isVideo && (
                      <View style={S.durationBadge}>
                        <Text style={S.durationTxt}>{fmtDur(item.duration)}</Text>
                      </View>
                    )}

                    <View style={[S.checkCircle, sel && { backgroundColor: themeColor, borderColor: themeColor }]}>
                      {sel ? <Text style={S.checkMark}>{idx + 1}</Text> : <Text style={S.checkEmpty}> </Text>}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </Animated.View>

        {/* === 하단 바: 화면 하단에 '고정' (시트 밖) === */}
        <View style={S.bottomBarFixed} pointerEvents="box-none">
          <View style={S.bottomBarCard}>
            <Pressable style={S.bundleBtn} onPress={() => setBundleSend((v) => !v)}>
              <View style={[S.dot, bundleSend && { backgroundColor: themeColor }]} />
              <Text style={S.bundleTxt}>사진 묶어보내기</Text>
            </Pressable>

            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' }}>
              <Pressable style={S.iconBtn} onPress={() => Alert.alert('편집', '추후 제공 예정')} hitSlop={8}>
                {editIconSource ? (
                  <Image source={editIconSource} style={S.iconImg} resizeMode="contain" />
                ) : (
                  <Text style={S.editFallback}>✦</Text>
                )}
              </Pressable>
              <Pressable
                style={[S.iconBtn, { marginLeft: 8 }]}
                onPress={() => setShowQualityPopup(true)}
                hitSlop={8}
              >
                {qualityIconSource ? (
                  <Image source={qualityIconSource} style={S.iconImg} resizeMode="contain" />
                ) : (
                  <Text style={S.moreDots}>···</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* 화질 팝업(항상 최상단) */}
      {showQualityPopup && (
        <Pressable style={S.overlay} onPress={() => setShowQualityPopup(false)}>
          <View style={S.qCard}>
            <Text style={S.qHeader}>화질</Text>

            <Text style={S.qSec}>사진</Text>
            {(['low', 'standard', 'original'] as const).map((opt) => (
              <Pressable key={opt} style={S.qRow} onPress={() => onChangePhotoQuality(opt)}>
                <Text style={S.qTxt}>{opt === 'low' ? '저용량' : opt === 'standard' ? '일반 화질' : '원본'}</Text>
                <View style={[S.radio, photoQuality === opt && { borderColor: themeColor }]}>
                  {photoQuality === opt && <View style={[S.radioDot, { backgroundColor: themeColor }]} />}
                </View>
              </Pressable>
            ))}

            <Text style={[S.qSec, { marginTop: 10 }]}>동영상</Text>
            {(['standard', 'high'] as const).map((opt) => (
              <Pressable key={opt} style={S.qRow} onPress={() => onChangeVideoQuality(opt)}>
                <Text style={S.qTxt}>{opt === 'standard' ? '일반 화질' : '고화질'}</Text>
                <View style={[S.radio, videoQuality === opt && { borderColor: themeColor }]}>
                  {videoQuality === opt && <View style={[S.radioDot, { backgroundColor: themeColor }]} />}
                </View>
              </Pressable>
            ))}

            <Pressable onPress={() => setShowQualityPopup(false)} style={S.qConfirmWrap}>
              <Text style={[S.qConfirmText, { color: themeColor }]}>확인</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </Modal>
  );
}

const S = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },

  /** 움직이는 시트 (위치만 애니메이션) */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },

  /** 시트 마스크 (모서리/배경/클리핑) */
  sheetMask: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#ecedf0',
    overflow: 'hidden',
  },

  /** Top bar */
  topBar: { height: 48, justifyContent: 'center', zIndex: 5 },
  topLeftBtn: {
    position: 'absolute',
    left: 6,
    top: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  topX: { fontSize: 26, color: '#111827' },

  centerTapArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '80%' },
  centerTitle: {
    fontSize: 18,
    color: '#111827',
    fontWeight: Platform.OS === 'ios' ? ('600' as any) : ('700' as any),
    textAlign: 'center',
  },
  downArrowImg: { width: 18, height: 18, marginLeft: 6, tintColor: '#111827' },
  downArrowTxt: { marginLeft: 6, fontSize: 16, color: '#111827' },

  topRightSend: {
    position: 'absolute',
    right: 8,
    top: 8,
    paddingHorizontal: 16,
    minWidth: 74,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  sendPillTxt: { fontSize: 15, fontWeight: '700' },

  /** Handle */
  handleArea: { height: 18, alignItems: 'center', justifyContent: 'center' },
  handleBar: { width: 64, height: 6, borderRadius: 3, backgroundColor: '#d1d5db' },

  /** 선택 썸네일 스트립 */
  selStrip: { paddingHorizontal: 12, paddingBottom: 20 },
  selItem: { width: 52, height: 52, marginRight: 8, borderRadius: 8, overflow: 'hidden' },
  selImg: { width: '100%', height: '100%' },
  selClose: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCloseTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  /** Dropdown */
  dropdownWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 66,
    alignItems: 'center',
    zIndex: 10,
  },
  dropdown: {
    width: '86%',
    maxHeight: 280,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ecedf0',
    paddingVertical: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  dropdownRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownTxt: { fontSize: 16, color: '#111827', flex: 1 },
  dropdownCnt: { fontSize: 16, color: '#9ca3af' },

  /** Grid */
  thumbBox: {
    backgroundColor: '#e5e7eb',
    position: 'relative',
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%', resizeMode: 'cover' },

  /** Video duration */
  durationBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: '#00000099',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },

  /** 선택 원 & 순번 */
  checkCircle: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 12, includeFontPadding: false },
  checkEmpty: { color: 'transparent' },

  /** === 고정 하단 바 (시트 밖) === */
  bottomBarFixed: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  bottomBarCard: {
    height: 56,
    borderTopWidth: 1,
    borderColor: '#ecedf0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  bundleBtn: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d5db', marginRight: 6 },
  bundleTxt: { fontSize: 14, color: '#111827' },

  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconImg: { width: 20, height: 20, tintColor: '#111827' },
  editFallback: { fontSize: 18, lineHeight: 18, fontWeight: '700', color: '#111827' },
  moreDots: { fontSize: 24, lineHeight: 24, fontWeight: '700', color: '#111827' },

  /** Quality popup */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 100,
  },
  qCard: {
    width: '80%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ecedf0',
    padding: 16,
  },
  qHeader: { fontSize: 18, color: '#111827', marginBottom: 10, fontWeight: '600' },
  qSec: { fontSize: 15, color: '#111827', marginBottom: 6, marginTop: 2, fontWeight: '500' },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  qTxt: { fontSize: 15, color: '#111827' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  qConfirmWrap: { alignItems: 'flex-end', paddingTop: 6 },
  qConfirmText: { fontSize: 15, fontWeight: '600' },
});
