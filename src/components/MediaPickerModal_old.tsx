// MediaPickerModal.tsx (Fully Optimized & Smooth)
import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as ExpoImage } from 'expo-image';
import {
  X,
  ChevronDown,
  Check,
  Crop,
  Sparkles,
  ArrowUp,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

import UniversalImageEditor from './UniversalImageEditor';
import { type ChatTheme } from '../screens/chat/theme/chatTheme';

export type PickedAsset = {
  uri: string;
  filename: string;
  isVideo: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
  fileSize?: number | null;
  size?: number | null;
  type?: 'image' | 'video';
  mediaType?: 'image' | 'video';
  mimeType?: string;
  mime?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  photoQuality: 'low' | 'standard' | 'original';
  videoQuality: 'standard' | 'high';
  onChangePhotoQuality: (q: 'low' | 'standard' | 'original') => void;
  onChangeVideoQuality: (q: 'standard' | 'high') => void;
  onSendSelected: (assets: PickedAsset[], bundleSend: boolean) => Promise<void>;
  theme: ChatTheme;
};

const { width: W, height: H } = Dimensions.get('window');

const HEADER_HEIGHT = 56;
const BOTTOM_BAR_HEIGHT = 60 + (Platform.OS === 'ios' ? 20 : 0);
const SHEET_MAX = Math.round(H * 0.94);
const SHEET_MIN = Math.round(H * 0.55);
const COMPACT_OFFSET = Math.max(0, SHEET_MAX - SHEET_MIN);

const GRID_GAP = 1.5;
const COL_COUNT = 3;
const THUMB_SIZE = (W - GRID_GAP * (COL_COUNT - 1)) / COL_COUNT;
const ROW_HEIGHT = THUMB_SIZE + GRID_GAP;

const BATCH_SIZE = 300;
const ALBUM_FILTER_CONCURRENCY = 6;
const ALL_ALBUM_ID = '__coonn_all_media__';

async function getPhotoVideoCount(album?: MediaLibrary.Album | null): Promise<number> {
  try {
    const params: MediaLibrary.AssetsOptions = {
      first: 1,
      mediaType: ['photo', 'video'],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
    };
    if (album) (params as any).album = album;

    const res = await MediaLibrary.getAssetsAsync(params);
    const totalCount = (res as any)?.totalCount;
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      return Math.max(0, Math.trunc(totalCount));
    }
    return Array.isArray(res.assets) ? res.assets.length : 0;
  } catch {
    return 0;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await task(items[currentIndex]);
      }
    }),
  );

  return results;
}

function normalizeAlbumTitle(title?: string | null): string {
  return String(title ?? '').trim().toLowerCase();
}

function isDuplicateSystemAllAlbum(title?: string | null): boolean {
  const normalized = normalizeAlbumTitle(title).replace(/[\s_-]+/g, '');
  return (
    normalized === 'recent' ||
    normalized === 'recents' ||
    normalized === '최근항목' ||
    normalized === '최근' ||
    normalized === 'allphotos' ||
    normalized === 'allmedia' ||
    normalized === '전체사진' ||
    normalized === '전체항목'
  );
}

function getAlbumSortRank(title?: string | null): number {
  const normalized = normalizeAlbumTitle(title);
  if (/camera|dcim|카메라/.test(normalized)) return 10;
  if (/screenshots?|스크린샷|화면/.test(normalized)) return 20;
  if (/videos?|movies?|동영상|비디오|영화/.test(normalized)) return 30;
  if (/downloads?|download|다운로드/.test(normalized)) return 40;
  if (/kakaotalk|whatsapp|instagram|line/.test(normalized)) return 50;
  return 100;
}

function inferMediaMime(filename?: string | null, uri?: string | null, isVideo?: boolean): string {
  const source = String(filename || uri || '').split('?')[0].split('#')[0].toLowerCase();
  const ext = String(source.match(/\.([a-z0-9]{2,8})$/i)?.[1] ?? '').toLowerCase();

  if (isVideo) {
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'm4v') return 'video/x-m4v';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mkv') return 'video/x-matroska';
    if (ext === 'avi') return 'video/x-msvideo';
    if (ext === '3gp' || ext === '3gpp') return 'video/3gpp';
    return 'video/mp4';
  }

  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'image/jpeg';
}


async function loadVisibleMediaAlbums(albums: MediaLibrary.Album[]): Promise<MediaLibrary.Album[]> {
  const candidates = albums.filter((album) => !isDuplicateSystemAllAlbum(album.title));

  const hydrated = await mapWithConcurrency(candidates, ALBUM_FILTER_CONCURRENCY, async (album) => {
    const mediaCount = await getPhotoVideoCount(album);
    return { album, mediaCount };
  });

  return hydrated
    .filter(({ mediaCount }) => mediaCount > 0)
    .map(({ album, mediaCount }) => ({ ...album, assetCount: mediaCount }) as MediaLibrary.Album)
    .sort((a, b) => {
      const rankDiff = getAlbumSortRank(a.title) - getAlbumSortRank(b.title);
      if (rankDiff !== 0) return rankDiff;
      const countDiff = (b.assetCount ?? 0) - (a.assetCount ?? 0);
      if (countDiff !== 0) return countDiff;
      return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'ko');
    });
}

const MediaItem = memo(
  ({
    item,
    isSelected,
    selectIndex,
    onPress,
    accentColor,
    displayUri,
  }: {
    item: MediaLibrary.Asset;
    isSelected: boolean;
    selectIndex: number;
    onPress: (uri: string) => void;
    accentColor: string;
    displayUri: string;
  }) => {
    const isVideo = item.mediaType === MediaLibrary.MediaType.video;

    // ✅ 버그 방어: duration이 없을 경우 NaN 방지
    const safeDuration = item.duration || 0;
    const m = Math.floor(safeDuration / 60);
    const s = Math.round(safeDuration % 60);
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

    return (
      <Pressable
        style={{ width: THUMB_SIZE, height: THUMB_SIZE, marginBottom: GRID_GAP }}
        onPress={() => onPress(item.uri)}
      >
        <ExpoImage
          source={{ uri: displayUri }}
          style={styles.thumbImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200} 
        />

        <View
          style={[
            styles.selectionRing,
            isSelected
              ? {
                  backgroundColor: accentColor,
                  borderColor: accentColor,
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3,
                }
              : {
                  borderColor: 'rgba(255,255,255,0.9)',
                  backgroundColor: 'transparent',
                  elevation: 0,
                  shadowOpacity: 0,
                },
          ]}
        >
          {isSelected && <Text style={styles.selectionNum}>{selectIndex + 1}</Text>}
        </View>

        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoTime}>{timeStr}</Text>
          </View>
        )}
      </Pressable>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.selectIndex === next.selectIndex &&
      prev.displayUri === next.displayUri &&
      prev.item.id === next.item.id
    );
  }
);

export default function MediaPickerModal({
  visible,
  onClose,
  photoQuality,
  videoQuality,
  onChangePhotoQuality,
  onChangeVideoQuality,
  onSendSelected,
  theme,
}: Props) {
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const accentColor = theme.pickerAccent ?? theme.sendButtonActive ?? '#0055FF';
  const themeBg = theme.background ?? '#fff';
  const themeHeaderBg = theme.headerBg ?? '#fff';
  const themeHeaderText = theme.headerText ?? '#111';
  const themeBodyText = theme.opponentText ?? '#111';
  const isDarkTheme = String(theme.background ?? '').toLowerCase() === '#000000' || String(theme.headerBg ?? '').toLowerCase().startsWith('#0');
  const toastTheme = createCoonnFloatingToastTheme(
    {
      isDark: isDarkTheme,
      surface: isDarkTheme ? theme.inputFieldBg || theme.headerBg : theme.inputFieldBg || theme.headerBg || theme.background,
      textPrimary: theme.text || theme.headerText || themeBodyText,
      border: isDarkTheme ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
      accentColor,
      dangerColor: '#EF4444',
      shadowColor: accentColor,
    },
    toast.tone,
  );

  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [totalAssetCount, setTotalAssetCount] = useState(0);
  const [currentAlbum, setCurrentAlbum] = useState<MediaLibrary.Album | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [editedMap, setEditedMap] = useState<Record<string, string>>({});

  const [bundleSend, setBundleSend] = useState(true);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [showQualityPopup, setShowQualityPopup] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAssetUri, setEditingAssetUri] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const flatListRef = useRef<FlatList<MediaLibrary.Asset>>(null);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const currentScrollY = useRef(0);
  const ty = useRef(new Animated.Value(H)).current;
  const allItemsTitle = t('media:all_items', { defaultValue: '전체항목' });
  const dropdownWidth = sheetExpanded ? W * 0.85 : W * 0.6;
  const dropdownMaxHeight = sheetExpanded ? H * 0.5 : 300;
  
  // ✅ 메모리 누수 방어용 래퍼
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const openSheet = useCallback(() => {
    setSheetExpanded(false);
    setShowAlbumDropdown(false);
    Animated.spring(ty, {
      toValue: COMPACT_OFFSET,
      useNativeDriver: true,
      damping: 20,
      stiffness: 150,
      mass: 0.8,
    }).start();
  }, [ty]);

  const closeSheet = useCallback(() => {
    setSheetExpanded(false);
    setShowAlbumDropdown(false);
    Animated.timing(ty, {
      toValue: H,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      // ✅ 언마운트 시점의 State 업데이트 방어
      setTimeout(() => {
        if (isMounted.current) {
          setSelectedUris([]);
          setEditedMap({});
          setShowAlbumDropdown(false);
          setShowQualityPopup(false);
          setLoading(false);
          setAssets([]);
          setAlbums([]);
          setTotalAssetCount(0);
          setCurrentAlbum(null);
          setEndCursor(undefined);
          setHasNextPage(true);
        }
      }, 200);
    });
  }, [ty, onClose]);

  const toggleExpand = useCallback(
    (expand: boolean) => {
      setSheetExpanded(expand);
      setShowAlbumDropdown(false);
      Animated.spring(ty, {
        toValue: expand ? 0 : COMPACT_OFFSET,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    },
    [ty]
  );

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    if (Math.abs(y - currentScrollY.current) > 50) {
        if (y > 400 && currentScrollY.current <= 400) {
            Animated.timing(fabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        } else if (y <= 400 && currentScrollY.current > 400) {
            Animated.timing(fabOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }
        currentScrollY.current = y;
    }
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  useEffect(() => {
    if (!visible) return;
    InteractionManager.runAfterInteractions(() => {
      openSheet();
      initPermissionAndLoad();
    });
  }, [visible]);

  const initPermissionAndLoad = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissions:gallery.title'), t('permissions:gallery.description'));
      closeSheet(); // 권한 없으면 닫아버림
      return;
    }

    setLoading(true);
    setCurrentAlbum(null);
    setAssets([]);
    setAlbums([]);
    setTotalAssetCount(0);

    try {
      const [allCount, fetchedAlbums] = await Promise.all([
        getPhotoVideoCount(null),
        MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true }),
      ]);

      const visibleAlbums = await loadVisibleMediaAlbums(fetchedAlbums);
      if (!isMounted.current) return;
      setTotalAssetCount(allCount);
      setAlbums(visibleAlbums);
    } catch (e) {
      console.error('Media album loading error:', e);
      if (!isMounted.current) return;
      setAlbums([]);
      setTotalAssetCount(0);
    }
    
    loadAssets(null, undefined, true);
  };

  useEffect(() => {
    if (visible) {
        loadAssets(currentAlbum, undefined, true);
    }
  }, [currentAlbum]);

  const loadAssets = useCallback(
    async (
        album: MediaLibrary.Album | null, 
        cursor?: string, 
        isReset: boolean = false
    ) => {
      if (!isReset && !hasNextPage) return;
      if (isFetchingMore) return; 

      if (isReset) {
        setLoading(true);
        setEndCursor(undefined);
        setHasNextPage(true);
        setIsFetchingMore(false);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        currentScrollY.current = 0;
        fabOpacity.setValue(0);
      } else {
        setIsFetchingMore(true);
      }

      try {
        const params: MediaLibrary.AssetsOptions = {
          first: BATCH_SIZE, 
          mediaType: ['photo', 'video'],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
          after: cursor,
        };
        if (album) (params as any).album = album;

        const res = await MediaLibrary.getAssetsAsync(params);

        if (isReset) {
          setAssets(res.assets);
        } else {
          setAssets((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const newUnique = res.assets.filter((a) => !existingIds.has(a.id));
            return [...prev, ...newUnique];
          });
        }

        setHasNextPage(res.hasNextPage);
        setEndCursor(res.endCursor);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setIsFetchingMore(false);
      }
    },
    [hasNextPage, fabOpacity, isFetchingMore]
  );

  const handleLoadMore = () => {
    if (!loading && !isFetchingMore && hasNextPage) {
      loadAssets(currentAlbum, endCursor, false);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -50 || g.vy < -0.5) toggleExpand(true);
        else if (g.dy > 50 || g.vy > 0.5) closeSheet();
        else toggleExpand(false);
      },
    })
  ).current;

  const toggleSelect = useCallback((uri: string) => {
    setSelectedUris((prev) => {
      const idx = prev.indexOf(uri);
      if (idx >= 0) return prev.filter((u) => u !== uri);
      if (prev.length >= 30) {
        showToast({
          message: t('media:max_select', { count: 30 }),
          tone: 'warning',
          showMark: true,
        });
        return prev;
      }
      return [...prev, uri];
    });
  }, [t]);

  const handleEditPress = useCallback(() => {
    if (selectedUris.length === 0) return;
    const lastUri = selectedUris[selectedUris.length - 1];
    let asset = assets.find((a) => a.uri === lastUri);
    
    if (!asset) {
       asset = { uri: lastUri, mediaType: MediaLibrary.MediaType.photo } as any; 
    }
    
    if ((asset as any)?.mediaType === MediaLibrary.MediaType.video) {
       showToast({
         message: t('media:video_edit_warning'),
         tone: 'info',
         showMark: true,
       });
       return;
    }

    setEditingAssetUri(lastUri);
    setEditorVisible(true);
  }, [assets, selectedUris, showToast, t]);

  const handleEditSave = useCallback((newUri: string) => {
    if (editingAssetUri) {
      setEditedMap((prev) => ({ ...prev, [editingAssetUri]: newUri }));
    }
    setEditorVisible(false);
    setEditingAssetUri(null);
  }, [editingAssetUri]);

  // ✅ 애니메이션 스터터링(버벅임) 완벽 방어 로직 추가
  const handleConfirm = useCallback(() => {
    if (selectedUris.length === 0) return;

    const urisToProcess = [...selectedUris];
    const editsToProcess = { ...editedMap };
    
    // 1. 모달 애니메이션을 먼저 부드럽게 닫습니다.
    closeSheet();

    // 2. 모달이 다 닫히고(약 300ms) UI 스레드가 한가해지면 무거운 압축 작업을 시작합니다.
    setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        try {
          const packed: PickedAsset[] = [];
          for (const uri of urisToProcess) {
            let asset = assets.find((a) => a.uri === uri);
            if (!asset) {
               try {
                  const info = await MediaLibrary.getAssetInfoAsync(uri);
                  asset = info;
               } catch {}
            }
            if (!asset) continue;
  
            const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
            let finalUri = editsToProcess[uri] || uri;
  
            if (!isVideo && !editsToProcess[uri] && photoQuality !== 'original') {
              const q = photoQuality === 'low' ? 0.3 : 0.7;
              try {
                const m = await ImageManipulator.manipulateAsync(uri, [], {
                  compress: q,
                  format: ImageManipulator.SaveFormat.JPEG,
                });
                finalUri = m.uri;
              } catch {}
            }
  
            const filename = asset.filename || `file_${Date.now()}`;
            const mediaKind = isVideo ? 'video' : 'image';
            const mimeType = inferMediaMime(filename, finalUri, isVideo);

            packed.push({
              uri: finalUri,
              filename,
              isVideo,
              type: mediaKind,
              mediaType: mediaKind,
              mimeType,
              mime: mimeType,
              width: asset.width,
              height: asset.height,
              durationSec: asset.duration,
              fileSize: typeof (asset as any)?.fileSize === 'number' ? (asset as any).fileSize : null,
              size: typeof (asset as any)?.fileSize === 'number' ? (asset as any).fileSize : null,
            });
          }
          const allImgs = packed.every((p) => !p.isVideo);
          const effectiveBundle = bundleSend && packed.length > 1 && allImgs;
  
          await onSendSelected(packed, effectiveBundle);
        } catch (e) {
          console.error('Image processing error:', e);
          showToast({
            message: t('media:processing_error'),
            tone: 'danger',
            showMark: true,
          });
        }
      });
    }, 300); // 애니메이션 250ms + 50ms 마진
  }, [assets, bundleSend, closeSheet, editedMap, onSendSelected, photoQuality, selectedUris, showToast, t]);

  const getItemLayout = useCallback((_: any, index: number) => {
    const row = Math.floor(index / COL_COUNT);
    return { length: ROW_HEIGHT, offset: ROW_HEIGHT * row, index };
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => {
      const selectIndex = selectedUris.indexOf(item.uri);
      const isSelected = selectIndex >= 0;
      const displayUri = editedMap[item.uri] || item.uri;

      return (
        <MediaItem
          item={item}
          isSelected={isSelected}
          selectIndex={selectIndex}
          onPress={toggleSelect}
          accentColor={accentColor}
          displayUri={displayUri}
        />
      );
    },
    [accentColor, editedMap, selectedUris, toggleSelect]
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={closeSheet} />

        <Animated.View
          style={[
            styles.sheet,
            {
              height: SHEET_MAX,
              backgroundColor: themeBg,
              transform: [{ translateY: ty }],
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: themeHeaderBg,
                borderBottomColor: theme.headerBg === '#fff' ? '#f0f0f0' : 'transparent',
              },
            ]}
            {...pan.panHandlers}
          >
            <Pressable style={[styles.headerBtn, { zIndex: 20 }]} onPress={closeSheet} hitSlop={10}>
              <X color={themeHeaderText} size={26} strokeWidth={1.5} />
            </Pressable>

            <View style={styles.headerCenter} pointerEvents="box-none">
              <Pressable
                style={styles.titleWrapper}
                onPress={() => setShowAlbumDropdown((prev) => !prev)}
                hitSlop={{ top: 15, bottom: 15, left: 20, right: 20 }}
              >
                <Text style={[styles.headerTitle, { color: themeHeaderText }]}>
                  {currentAlbum ? currentAlbum.title : allItemsTitle}
                </Text>
                <ChevronDown size={16} color={themeHeaderText} strokeWidth={2.0} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: selectedUris.length > 0 ? accentColor : '#F2F4F6',
                  zIndex: 20,
                },
              ]}
              disabled={selectedUris.length === 0}
              onPress={handleConfirm}
            >
              <View style={styles.confirmBtnContent}>
                {selectedUris.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={[styles.countText, { color: accentColor }]}>{selectedUris.length}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.confirmBtnText,
                    { color: selectedUris.length > 0 ? '#FFFFFF' : '#B0B8C1' },
                  ]}
                >
                  {t('chat:send')}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Grid */}
          <View style={[styles.gridContainer, { backgroundColor: themeBg }]}>
            {loading && assets.length === 0 ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            ) : (
              <FlatList
                key={currentAlbum?.id ?? 'all'}
                ref={flatListRef}
                data={assets}
                keyExtractor={(item) => item.id}
                numColumns={COL_COUNT}
                renderItem={renderItem}
                
                extraData={[selectedUris, editedMap]}
                
                initialNumToRender={40}  
                maxToRenderPerBatch={40} 
                windowSize={11}         
                removeClippedSubviews={true}
                
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                
                getItemLayout={getItemLayout}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                columnWrapperStyle={{ gap: GRID_GAP }}
                contentContainerStyle={{
                  paddingBottom: BOTTOM_BAR_HEIGHT + 20,
                  paddingTop: 2,
                }}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                    isFetchingMore ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={accentColor} />
                        </View>
                    ) : null
                }
              />
            )}

            {/* FAB */}
            <Animated.View
              style={[styles.fabContainer, { opacity: fabOpacity }, { bottom: BOTTOM_BAR_HEIGHT + 20 }]}
              pointerEvents="box-none"
            >
              <Pressable style={styles.fabButton} onPress={scrollToTop}>
                <ArrowUp size={24} color="#FFF" />
              </Pressable>
            </Animated.View>
          </View>

          {/* Dropdown */}
          {showAlbumDropdown && (
            <View style={styles.dropdownBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAlbumDropdown(false)} />

              <Animated.View
                style={[
                  styles.dropdownCard,
                  {
                    backgroundColor: themeBg,
                    width: dropdownWidth,
                    maxHeight: dropdownMaxHeight,
                  },
                ]}
              >
                <FlatList
                  data={[{ id: ALL_ALBUM_ID, title: allItemsTitle, assetCount: totalAssetCount } as any, ...albums]}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ flexGrow: 1 }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.albumRow}
                      onPress={() => {
                        // @ts-ignore
                        setCurrentAlbum(item.id === ALL_ALBUM_ID ? null : item);
                        setShowAlbumDropdown(false);
                      }}
                    >
                      <Text style={[styles.albumName, { color: themeBodyText }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {/* @ts-ignore */}
                      <Text style={styles.albumCount}>{item.assetCount}</Text>
                    </Pressable>
                  )}
                />
              </Animated.View>
            </View>
          )}
        </Animated.View>

        {/* Bottom Bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: themeHeaderBg,
              borderTopColor: theme.headerBg === '#fff' ? '#f0f0f0' : 'transparent',
              paddingBottom: Platform.OS === 'ios' ? 20 : 10,
            },
          ]}
        >
          <View style={styles.bottomLeft}>
            <Pressable style={styles.bundleBtn} onPress={() => setBundleSend((v) => !v)}>
              <View
                style={[
                  styles.roundCheckbox,
                  bundleSend
                    ? { backgroundColor: accentColor, borderColor: accentColor }
                    : styles.roundCheckboxEmpty,
                ]}
              >
                {bundleSend && <Check size={12} color="#fff" strokeWidth={2.0} />}
              </View>
              <Text style={[styles.bottomBtnText, { color: themeBodyText }]}>{t('media:bundle_photos')}</Text>
            </Pressable>
          </View>

          <View style={styles.bottomRight}>
            <Pressable
              style={[styles.iconButton, selectedUris.length === 0 && { opacity: 0.3 }]}
              onPress={handleEditPress}
              disabled={selectedUris.length === 0}
            >
              <Crop size={24} color={themeBodyText} strokeWidth={1.5} />
            </Pressable>

            <Pressable style={styles.iconButton} onPress={() => setShowQualityPopup(true)}>
              <Sparkles size={24} color={themeBodyText} strokeWidth={1.5} />
            </Pressable>
          </View>
        </View>

        {/* Quality Popup */}
        {showQualityPopup && (
          <Pressable style={styles.popupOverlay} onPress={() => setShowQualityPopup(false)}>
            <View style={[styles.popupCard, { backgroundColor: themeBg }]}>
              <Text style={[styles.popupTitle, { color: themeBodyText }]}>{t('media:quality_settings')}</Text>

              <Text style={styles.popupSection}>{t('chat:photo')}</Text>
              {(['original', 'standard', 'low'] as const).map((q) => (
                <Pressable key={q} style={styles.popupRow} onPress={() => onChangePhotoQuality(q)}>
                  <Text style={[styles.popupText, { color: themeBodyText }]}>
                    {q === 'original'
                      ? t('media:quality_original')
                      : q === 'standard'
                      ? t('media:quality_standard')
                      : t('media:quality_low')}
                  </Text>
                  <View
                    style={[
                      styles.radioCircle,
                      photoQuality === q
                        ? { backgroundColor: accentColor, borderColor: accentColor }
                        : { backgroundColor: 'transparent', borderColor: '#ddd' },
                    ]}
                  >
                    {photoQuality === q && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                </Pressable>
              ))}

              <View style={styles.popupDivider} />

              <Text style={styles.popupSection}>{t('chat:video')}</Text>
              {(['high', 'standard'] as const).map((q) => (
                <Pressable
                  key={q}
                  style={styles.popupRow}
                  onPress={() => onChangeVideoQuality(q === 'high' ? 'high' : 'standard')}
                >
                  <Text style={[styles.popupText, { color: themeBodyText }]}>
                    {q === 'high' ? t('media:quality_high') : t('media:quality_standard')}
                  </Text>
                  <View
                    style={[
                      styles.radioCircle,
                      videoQuality === (q === 'high' ? 'high' : 'standard')
                        ? { backgroundColor: accentColor, borderColor: accentColor }
                        : { backgroundColor: 'transparent', borderColor: '#ddd' },
                    ]}
                  >
                    {videoQuality === (q === 'high' ? 'high' : 'standard') && (
                      <Check size={12} color="#fff" strokeWidth={3} />
                    )}
                  </View>
                </Pressable>
              ))}

              <View style={{ marginTop: 24, alignSelf: 'flex-end' }}>
                <Pressable style={{ padding: 8 }} onPress={() => setShowQualityPopup(false)}>
                  <Text style={{ color: accentColor, fontSize: 16, fontWeight: '700' }}>{t('common:ok')}</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      </View>

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={BOTTOM_BAR_HEIGHT + 18}
        durationMs={1700}
        onHidden={hideToast}
      />


      <UniversalImageEditor
        visible={editorVisible}
        sourceUri={editingAssetUri || ''}
        onClose={() => {
          setEditorVisible(false);
          setEditingAssetUri(null);
        }}
        onSave={handleEditSave}
        themeColor={accentColor}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },

  sheet: {
    overflow: 'hidden',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerBtn: { padding: 4 },

  headerCenter: {
    position: 'absolute',
    left: 60,
    right: 60,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },

  confirmBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnContent: { flexDirection: 'row', alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '800' },
  countBadge: {
    backgroundColor: '#fff',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  countText: { fontSize: 11, fontWeight: '900' },

  gridContainer: { flex: 1 },

  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  thumbImg: { width: '100%', height: '100%', backgroundColor: '#F3F4F6' },

  selectionRing: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionNum: { color: '#fff', fontSize: 13, fontWeight: '800' },

  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoTime: { color: '#fff', fontSize: 11, fontWeight: '600' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  bottomLeft: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  bottomRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 0,
  },

  bundleBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 },
  roundCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundCheckboxEmpty: { borderColor: '#d1d5db', backgroundColor: '#fff' },
  bottomBtnText: { fontSize: 15, fontWeight: '600' },

  iconButton: { padding: 8, alignItems: 'center', justifyContent: 'center', width: 36, height: 44 },

  dropdownBackdrop: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 20,
    alignItems: 'center',
  },
  dropdownCard: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  albumRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f9f9f9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  albumName: { fontSize: 16, flex: 1 },
  albumCount: { fontSize: 14, color: '#888' },

  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  popupCard: { width: '80%', maxWidth: 340, borderRadius: 20, padding: 24, elevation: 10 },
  popupTitle: { fontSize: 19, fontWeight: '800', marginBottom: 16 },
  popupSection: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 8 },
  popupDivider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  popupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  popupText: { fontSize: 16 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 0 },

  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowOpacity: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
});