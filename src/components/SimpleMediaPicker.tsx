import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Dimensions,
  BackHandler,
  Platform,
  StatusBar,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  InteractionManager,
  AppState,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';
import { X, ChevronDown, ArrowUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const GRID_GAP = 2;
const COL_COUNT = 3;
const THUMB_SIZE = Math.floor((width - GRID_GAP * (COL_COUNT - 1)) / COL_COUNT);
const ROW_HEIGHT = THUMB_SIZE + GRID_GAP;
const HEADER_HEIGHT = 56;
const HEADER_TITLE_MAX_WIDTH = Math.max(120, Math.min(220, width - 180));
const HEADER_TITLE_TOUCH_WIDTH = Math.min(width - 104, HEADER_TITLE_MAX_WIDTH + 56);
const DEFAULT_ALBUM_TITLE_WIDTH = 64;
const RECENT_PHOTO_SORT_BY = [
  [(MediaLibrary.SortBy as any).modificationTime ?? MediaLibrary.SortBy.creationTime, false],
  [MediaLibrary.SortBy.creationTime, false],
] as any;
const MEDIA_LIBRARY_REFRESH_DELAYS_MS = [0, 650, 1600] as const;

export type SimplePickedImage = {
  uri: string;
  width: number;
  height: number;
  originalUri: string;
  filename: string;
  ext?: string;
  contentType?: string;
};

type SimpleImageProcessingPreset = 'none' | 'avatar' | 'cover' | 'post';

type SimpleImageProcessingOptions = {
  maxEdge?: number;
  quality?: number;
};

type PickerAlbum = MediaLibrary.Album & { assetCount: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (images: SimplePickedImage[]) => void;
  maxSelect?: number;
  headerTitle?: string;
  themeColor?: string;
  imageProcessing?: SimpleImageProcessingPreset | SimpleImageProcessingOptions;
};

function sanitizeImageExt(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const cleaned = raw.replace(/[^a-z0-9]/g, '');
  if (cleaned === 'jpeg') return 'jpg';
  if (cleaned === 'heif') return 'heic';
  if (['jpg', 'png', 'webp', 'heic', 'gif'].includes(cleaned)) return cleaned;
  return 'jpg';
}

function extFromUri(uri: string): string {
  const path = String(uri ?? '').split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return sanitizeImageExt(match?.[1] ?? 'jpg');
}

function contentTypeFromExt(ext: string): string {
  switch (sanitizeImageExt(ext)) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

function processingPresetToOptions(
  imageProcessing: SimpleImageProcessingPreset | SimpleImageProcessingOptions | undefined,
): SimpleImageProcessingOptions | null {
  if (!imageProcessing || imageProcessing === 'none') return null;

  if (typeof imageProcessing === 'object') {
    return {
      maxEdge: imageProcessing.maxEdge ?? 2400,
      quality: imageProcessing.quality ?? 0.82,
    };
  }

  switch (imageProcessing) {
    case 'avatar':
      return { maxEdge: 1440, quality: 0.8 };
    case 'cover':
      return { maxEdge: 2400, quality: 0.82 };
    case 'post':
      return { maxEdge: 2560, quality: 0.86 };
    default:
      return null;
  }
}

function buildResizeActions(width: number, height: number, maxEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return [];
  return width >= height ? [{ resize: { width: maxEdge } }] : [{ resize: { height: maxEdge } }];
}

// 🚀 최적화 1: 렌더링 폭탄을 막기 위한 개별 아이템 memo 화
const MediaItem = memo(
  ({
    item,
    isSelected,
    onToggle,
    themeColor,
  }: {
    item: MediaLibrary.Asset;
    isSelected: boolean;
    onToggle: (id: string) => void;
    themeColor: string;
  }) => {
    return (
      <Pressable
        onPress={() => onToggle(item.id)}
        style={{ width: THUMB_SIZE, height: THUMB_SIZE, marginBottom: GRID_GAP }}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.thumbImg}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View
          style={[
            styles.selectionRing,
            isSelected
              ? {
                  backgroundColor: themeColor,
                  borderColor: themeColor,
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3,
                  shadowRadius: 2,
                }
              : {
                  borderColor: 'rgba(255,255,255,0.9)',
                  backgroundColor: 'transparent',
                  elevation: 0,
                  shadowOpacity: 0,
                },
          ]}
        >
          {isSelected && <Text style={styles.selectionNum}>✓</Text>}
        </View>
      </Pressable>
    );
  },
  (prev, next) => prev.isSelected === next.isSelected && prev.item.id === next.item.id
);

export default function SimpleMediaPicker({
  visible,
  onClose,
  onSelect,
  maxSelect = 1,
  headerTitle,
  themeColor = '#111827',
  imageProcessing = 'none',
}: Props) {
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const appStateRef = useRef(AppState.currentState);
  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const currentAlbumRef = useRef<PickerAlbum | null>(null);
  const visibleRef = useRef(visible);
  const mediaPermissionGrantedRef = useRef(false);
  const permissionRequestSeqRef = useRef(0);

  // Android에서 SafeAreaView가 overlay 첫 프레임에 top inset을 늦게 반영하면
  // picker 전체가 상태바 높이만큼 위로 붙었다가 다시 내려오는 현상이 난다.
  // 그래서 Android는 StatusBar.currentHeight를 첫 렌더부터 고정값으로 사용한다.
  const stableTopInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : Math.max(insets.top, 0);
  const stableBottomInset = Platform.OS === 'android' ? 0 : Math.max(insets.bottom, 0);

  const [mediaPermissionState, setMediaPermissionState] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');
  const [albums, setAlbums] = useState<PickerAlbum[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<PickerAlbum | null>(null);
  const [totalPhotoCount, setTotalPhotoCount] = useState(0);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 🚀 최적화 2: 무한 스크롤(Pagination)을 위한 상태 추가
  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [albumTitleWidth, setAlbumTitleWidth] = useState(DEFAULT_ALBUM_TITLE_WIDTH);

  const displayHeaderTitle = headerTitle || t('media:select_photo');
  const resolvedImageProcessing = useMemo(
    () => processingPresetToOptions(imageProcessing),
    [imageProcessing]
  );

  const clearMediaRefreshTimers = useCallback(() => {
    refreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    refreshTimersRef.current = [];
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      mediaPermissionGrantedRef.current = false;
      setMediaPermissionState('idle');
      clearMediaRefreshTimers();
      return;
    }

    mediaPermissionGrantedRef.current = false;
    setMediaPermissionState('checking');
    setSelectedIds(new Set());
    setShowAlbumDropdown(false);
    setShowScrollTop(false);
    checkPermissions();
  }, [visible, clearMediaRefreshTimers]);

  useEffect(() => {
    if (!visible) return undefined;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => sub.remove();
  }, [onClose, visible]);

  useEffect(() => {
    currentAlbumRef.current = currentAlbum;
  }, [currentAlbum]);

  useEffect(() => {
    if (!visibleRef.current || !mediaPermissionGrantedRef.current) return;
    loadAssets(currentAlbum, undefined, true);
  }, [currentAlbum, visible]);

  const checkPermissions = async () => {
    const requestSeq = ++permissionRequestSeqRef.current;

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (permissionRequestSeqRef.current !== requestSeq || !visibleRef.current) return;

      if (status !== 'granted') {
        mediaPermissionGrantedRef.current = false;
        setMediaPermissionState('denied');
        setLoading(false);
        setIsFetchingMore(false);
        setAssets([]);
        setAlbums([]);
        setTotalPhotoCount(0);
        Alert.alert(
          t('permissions:gallery.title'),
          t('permissions:gallery.description')
        );
        onClose();
        return;
      }

      mediaPermissionGrantedRef.current = true;
      setMediaPermissionState('granted');
      setLoading(true);

      const [fetchedAlbums, totalRes] = await Promise.all([
        MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true }),
        MediaLibrary.getAssetsAsync({ first: 1, mediaType: ['photo'], sortBy: RECENT_PHOTO_SORT_BY }),
      ]);
      if (permissionRequestSeqRef.current !== requestSeq || !visibleRef.current || !mediaPermissionGrantedRef.current) return;

      const photoAlbums = await Promise.all(
        fetchedAlbums.map(async (album) => {
          try {
            const res = await MediaLibrary.getAssetsAsync({
              album,
              first: 1,
              mediaType: ['photo'],
              sortBy: RECENT_PHOTO_SORT_BY,
            });
            const photoCount = Number((res as any).totalCount ?? (res.assets.length > 0 ? album.assetCount : 0));
            return photoCount > 0 ? ({ ...album, assetCount: photoCount } as PickerAlbum) : null;
          } catch {
            return null;
          }
        })
      );
      if (permissionRequestSeqRef.current !== requestSeq || !visibleRef.current || !mediaPermissionGrantedRef.current) return;

      setTotalPhotoCount(Number((totalRes as any).totalCount ?? totalRes.assets.length ?? 0));
      setAlbums(photoAlbums.filter(Boolean) as PickerAlbum[]);
      await loadAssets(null, undefined, true);
    } catch {
      if (permissionRequestSeqRef.current !== requestSeq || !visibleRef.current) return;
      mediaPermissionGrantedRef.current = false;
      setMediaPermissionState('denied');
      setLoading(false);
      setIsFetchingMore(false);
      setAssets([]);
      setAlbums([]);
      setTotalPhotoCount(0);
    }
  };

  // 🚀 최적화 2: 커서 기반 무한 로딩 로직 적용
  const loadAssets = useCallback(
    async (album: PickerAlbum | null, cursor?: string, isReset: boolean = false) => {
      if (!visibleRef.current || !mediaPermissionGrantedRef.current) {
        if (isReset) {
          setLoading(false);
          setIsFetchingMore(false);
        }
        return;
      }
      if (!isReset && !hasNextPage) return;
      if (!isReset && isFetchingMore) return;

      if (isReset) {
        setLoading(true);
        setEndCursor(undefined);
        setHasNextPage(true);
        setIsFetchingMore(false);
      } else {
        setIsFetchingMore(true);
      }

      try {
        let params: MediaLibrary.AssetsOptions = {
          first: 150, // 150장씩 끊어서 부드럽게 무한 로딩
          mediaType: ['photo'],
          sortBy: RECENT_PHOTO_SORT_BY,
          after: cursor,
        };
        if (album) params.album = album;

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
      } catch {
        if (isReset) setAssets([]);
      } finally {
        setLoading(false);
        setIsFetchingMore(false);
      }
    },
    [hasNextPage, isFetchingMore]
  );

  const refreshVisibleMediaLibrary = useCallback(async () => {
    if (!visibleRef.current || !mediaPermissionGrantedRef.current) return;

    try {
      const [fetchedAlbums, totalRes] = await Promise.all([
        MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true }),
        MediaLibrary.getAssetsAsync({ first: 1, mediaType: ['photo'], sortBy: RECENT_PHOTO_SORT_BY }),
      ]);

      const photoAlbums = await Promise.all(
        fetchedAlbums.map(async (album) => {
          try {
            const res = await MediaLibrary.getAssetsAsync({
              album,
              first: 1,
              mediaType: ['photo'],
              sortBy: RECENT_PHOTO_SORT_BY,
            });
            const photoCount = Number((res as any).totalCount ?? (res.assets.length > 0 ? album.assetCount : 0));
            return photoCount > 0 ? ({ ...album, assetCount: photoCount } as PickerAlbum) : null;
          } catch {
            return null;
          }
        })
      );

      const nextAlbums = photoAlbums.filter(Boolean) as PickerAlbum[];
      const activeAlbum = currentAlbumRef.current;
      const nextCurrentAlbum = activeAlbum
        ? nextAlbums.find((album) => album.id === activeAlbum.id) ?? null
        : null;

      setTotalPhotoCount(Number((totalRes as any).totalCount ?? totalRes.assets.length ?? 0));
      setAlbums(nextAlbums);

      if (activeAlbum && !nextCurrentAlbum) {
        currentAlbumRef.current = null;
        setCurrentAlbum(null);
        await loadAssets(null, undefined, true);
        return;
      }

      if (nextCurrentAlbum && nextCurrentAlbum !== activeAlbum) {
        currentAlbumRef.current = nextCurrentAlbum;
        setCurrentAlbum(nextCurrentAlbum);
      }

      await loadAssets(nextCurrentAlbum ?? null, undefined, true);
    } catch {
      await loadAssets(currentAlbumRef.current, undefined, true);
    }
  }, [loadAssets, visible]);

  const scheduleMediaLibraryRefresh = useCallback(() => {
    if (!visibleRef.current || !mediaPermissionGrantedRef.current) return;
    clearMediaRefreshTimers();

    refreshTimersRef.current = MEDIA_LIBRARY_REFRESH_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        refreshVisibleMediaLibrary();
      }, delay)
    );
  }, [clearMediaRefreshTimers, refreshVisibleMediaLibrary, visible]);

  useEffect(() => {
    if (!visible || mediaPermissionState !== 'granted') {
      clearMediaRefreshTimers();
      return undefined;
    }

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (/inactive|background/.test(previousState) && nextState === 'active') {
        scheduleMediaLibraryRefresh();
      }
    });

    const mediaLibrarySub = MediaLibrary.addListener(() => {
      scheduleMediaLibraryRefresh();
    });

    return () => {
      appStateSub.remove();
      mediaLibrarySub.remove();
      clearMediaRefreshTimers();
    };
  }, [clearMediaRefreshTimers, scheduleMediaLibraryRefresh, visible]);

  const handleLoadMore = () => {
    if (!mediaPermissionGrantedRef.current) return;
    if (!loading && !isFetchingMore && hasNextPage) {
      loadAssets(currentAlbum, endCursor, false);
    }
  };

  const handleToggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          if (maxSelect === 1) {
            newSet.clear();
            newSet.add(id);
          } else {
            if (newSet.size < maxSelect) {
              newSet.add(id);
            } else {
              Alert.alert(
                t('common:notice'),
                t('media:max_select', { count: maxSelect })
              );
            }
          }
        }
        return newSet;
      });
    },
    [maxSelect, t]
  );

  const handleConfirm = async () => {
    if (!mediaPermissionGrantedRef.current) return;
    if (selectedIds.size === 0) return;

    setProcessing(true);
    
    // JS 스레드 락다운 방지: UI에 스피너가 돌 시간을 줌
    InteractionManager.runAfterInteractions(async () => {
      try {
        const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
        const processedImages: SimplePickedImage[] = [];

        for (const asset of selectedAssets) {
          const rawFilename = asset.filename || `upload_${Date.now()}.jpg`;

          if (!resolvedImageProcessing) {
            const ext = sanitizeImageExt(rawFilename.includes('.') ? rawFilename.split('.').pop() : extFromUri(asset.uri));
            processedImages.push({
              uri: asset.uri,
              width: asset.width,
              height: asset.height,
              originalUri: asset.uri,
              filename: rawFilename,
              ext,
              contentType: contentTypeFromExt(ext),
            });
            continue;
          }

          const maxEdge = Math.max(720, Number(resolvedImageProcessing.maxEdge ?? 2400));
          const quality = Math.min(0.95, Math.max(0.5, Number(resolvedImageProcessing.quality ?? 0.82)));
          const manipResult = await ImageManipulator.manipulateAsync(
            asset.uri,
            buildResizeActions(asset.width, asset.height, maxEdge),
            {
              compress: quality,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
          const baseName = rawFilename.replace(/\.[^.]+$/, '');

          processedImages.push({
            uri: manipResult.uri,
            width: manipResult.width,
            height: manipResult.height,
            originalUri: asset.uri,
            filename: `${baseName || 'upload'}.jpg`,
            ext: 'jpg',
            contentType: 'image/jpeg',
          });
        }

        onSelect(processedImages);
        onClose();
      } catch {
        Alert.alert(t('common:error'), t('media:processing_error'));
      } finally {
        setProcessing(false);
      }
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 300 && !showScrollTop) setShowScrollTop(true);
    else if (offsetY <= 300 && showScrollTop) setShowScrollTop(false);
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const renderItem = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <MediaItem 
          item={item} 
          isSelected={isSelected} 
          onToggle={handleToggle} 
          themeColor={themeColor} 
        />
      );
    },
    [selectedIds, handleToggle, themeColor]
  );

  // 🚀 최적화 3: 고속 스크롤을 위한 레이아웃 사전 계산
  // FlatList numColumns는 내부 VirtualizedList index를 item이 아니라 row 기준으로 넘긴다.
  // 여기서 다시 index / COL_COUNT를 하면 특정 구간부터 offset 보정이 들어가며 row 단위로 튄다.
  const getItemLayout = useCallback((_: any, index: number) => {
    return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
  }, []);

  const selectedCount = selectedIds.size;
  const albumTitle = currentAlbum ? currentAlbum.title : t('media:all_items', { defaultValue: '전체항목' });

  if (!visible) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="auto">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
      <View style={[styles.container, { paddingTop: stableTopInset, paddingBottom: stableBottomInset }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={10}>
            <X size={26} color="#111" strokeWidth={1.5} />
          </Pressable>

          <View style={styles.headerCenter} pointerEvents="box-none">
            <Pressable
              style={styles.titleWrapper}
              onPress={() => setShowAlbumDropdown((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={`${displayHeaderTitle} · ${albumTitle}`}
            >
              <Text
                style={styles.headerTitle}
                numberOfLines={1}
                onLayout={(event) => {
                  const nextWidth = Math.min(HEADER_TITLE_MAX_WIDTH, Math.ceil(event.nativeEvent.layout.width));
                  setAlbumTitleWidth((prev) => (Math.abs(prev - nextWidth) > 1 ? nextWidth : prev));
                }}
              >
                {albumTitle}
              </Text>
              <ChevronDown
                size={16}
                color="#111"
                strokeWidth={2}
                style={[
                  styles.titleChevron,
                  { marginLeft: Math.min(albumTitleWidth / 2 + 6, HEADER_TITLE_MAX_WIDTH / 2 + 8) },
                ]}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={selectedCount === 0 || processing}
            style={[styles.confirmBtn, { backgroundColor: selectedCount > 0 ? themeColor : '#F2F4F6' }]}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <View style={styles.confirmBtnContent}>
                {selectedCount > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={[styles.countText, { color: themeColor }]}>{selectedCount}</Text>
                  </View>
                )}
                <Text style={[styles.confirmBtnText, { color: selectedCount > 0 ? '#FFFFFF' : '#B0B8C1' }]}>
                  {t('common:done')}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Grid */}
        <View style={{ flex: 1 }}>
          {loading && assets.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={themeColor} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={assets}
              keyExtractor={(item) => item.id}
              numColumns={COL_COUNT}
              renderItem={renderItem}
              
              extraData={selectedIds} // 선택 상태 변경 감지
              
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              getItemLayout={getItemLayout}
              
              columnWrapperStyle={{ gap: GRID_GAP }}
              contentContainerStyle={{ paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              initialNumToRender={30}
              maxToRenderPerBatch={30}
              windowSize={11}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              ListFooterComponent={
                isFetchingMore ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={themeColor} />
                  </View>
                ) : null
              }
            />
          )}

          {/* Floating Scroll-to-Top Button */}
          {showScrollTop && (
            <Pressable style={styles.fab} onPress={scrollToTop}>
              <ArrowUp size={24} color="#FFF" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>

        {/* Album Dropdown */}
        {showAlbumDropdown && (
          <View style={[styles.dropdownBackdrop, { top: stableTopInset + HEADER_HEIGHT }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAlbumDropdown(false)} />
            <View style={styles.dropdownCard}>
              <FlatList
                data={[{ id: 'all', title: t('media:all_items', { defaultValue: '전체항목' }), assetCount: totalPhotoCount }, ...albums]}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.albumRow}
                    onPress={() => {
                      // @ts-ignore
                      setCurrentAlbum(item.id === 'all' ? null : item);
                      setShowAlbumDropdown(false);
                    }}
                  >
                    <Text style={styles.albumName} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {/* @ts-ignore */}
                    <Text style={styles.albumCount}>{item.assetCount}</Text>
                  </Pressable>
                )}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#FFF',
  },
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFF',
    zIndex: 10,
  },
  headerBtn: { padding: 4, zIndex: 1 },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  titleWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    maxWidth: HEADER_TITLE_MAX_WIDTH,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  titleChevron: {
    position: 'absolute',
    left: '50%',
    top: (HEADER_HEIGHT - 16) / 2,
    zIndex: 2,
  },

  confirmBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
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
    width: '60%',
    backgroundColor: '#FFF',
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
    borderBottomColor: '#F9F9F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  albumName: { fontSize: 16, flex: 1, color: '#111' },
  albumCount: { fontSize: 14, color: '#888' },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 999,
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