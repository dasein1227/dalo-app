// src/screens/chat/components/InputBar/AttachmentSheet.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  AppState,
  // ❌ FlatList는 여기서 뺍니다 (제스처 충돌의 원인)
} from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { FlatList } from 'react-native-gesture-handler'; // ✅ 1. 제스처 핸들러용 FlatList 사용 (바텀시트 가로 스크롤 먹힘 방지)
import { Image } from 'expo-image';
import {
  Image as ImageIcon,
  Camera,
  Phone,
  MapPin,
  FileText,
  Check,
  Contact,
  Mic,
  CalendarDays,
  ScanLine,
} from 'lucide-react-native';

import type { ChatTheme } from '../../theme/chatTheme';

export type AttachmentAsset = { uri: string; id?: string; isCamera?: boolean };

export type AttachmentSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  theme: ChatTheme;
  open?: boolean;
  onClose: () => void;
  onPickFromGallery: () => void;
  onOpenCamera: () => void;
  onOpenCall: () => void;
  onOpenMap: () => void;
  onOpenFile: () => void;
  onOpenVoice?: () => void;
  onOpenCapture?: () => void;
  onOpenSchedule?: () => void;
  onOpenContact?: () => void;
  roomType?: string | null;
  onSendMediaDirect?: (assets: AttachmentAsset[], bundleSend?: boolean) => Promise<void>;
  bottomInset?: number;
  defaultOpenSnapIndex?: number;
};

// 리턴 타입에 권한 상태(granted) 추가
async function loadRecentPhotos(limit: number): Promise<{ assets: AttachmentAsset[]; granted: boolean }> {
  let MediaLibrary: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    MediaLibrary = require('expo-media-library');
  } catch {
    return { assets: [], granted: false };
  }

  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm?.granted) return { assets: [], granted: false };

    const sortBy = MediaLibrary.SortBy?.modificationTime
      ? [MediaLibrary.SortBy.modificationTime]
      : [MediaLibrary.SortBy.creationTime];

    const res = await MediaLibrary.getAssetsAsync({
      first: limit,
      sortBy,
      mediaType: [MediaLibrary.MediaType.photo],
    });

    return {
      assets: (res?.assets ?? []).map((a: any) => ({ uri: a.uri, id: a.id })),
      granted: true,
    };
  } catch {
    return { assets: [], granted: false };
  }
}

function areSameAssets(a: AttachmentAsset[], b: AttachmentAsset[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if ((a[i]?.id ?? a[i]?.uri) !== (b[i]?.id ?? b[i]?.uri)) return false;
  }
  return true;
}

function isDarkOn(bgHex: string): boolean {
  const hex = (bgHex || '').replace('#', '').trim();
  if (!(hex.length === 6 || hex.length === 3)) return false;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l < 0.55;
}

const ListItem = React.memo(function ListItem({
  label,
  icon,
  onPress,
  isLast,
  theme,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  isLast?: boolean;
  theme: ChatTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: theme.opponentBubble }]}
    >
      <View style={styles.listIconWrap}>{icon}</View>
      <View style={[styles.listContent, !isLast && { borderBottomColor: theme.inputFieldBg, borderBottomWidth: 1 }]}>
        <Text style={[styles.listLabel, { color: theme.text }]} allowFontScaling={false}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

const AttachmentSheet = forwardRef<AttachmentSheetHandle, Props>(function AttachmentSheetInner(
  {
    theme,
    open,
    onClose,
    onPickFromGallery,
    onOpenCamera,
    onOpenCall,
    onOpenMap,
    onOpenFile,
    onOpenVoice,
    onOpenCapture,
    onOpenSchedule,
    onOpenContact,
    roomType,
    onSendMediaDirect,
    bottomInset = 0,
    defaultOpenSnapIndex = 0,
  },
  ref
) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheet>(null);
  const loadSeqRef = useRef(0);
  const loadingRecentRef = useRef(false);
  const recentCountRef = useRef(0);
  const mountedRef = useRef(true);
  const sheetOpenRef = useRef(false);
  const refreshAfterCameraRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const cameraRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapPoints = useMemo(() => ['50%', '90%'], []);
  const openIndex = 0;

  const [recent, setRecent] = useState<AttachmentAsset[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null); 
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected]);

  const tint = theme.tintColor ?? '#3B82F6';
  const tintOn = isDarkOn(tint) ? '#FFFFFF' : '#111827';
  const isBeaconRoom = String(roomType ?? '').trim().toLowerCase() === 'beacon';

  const { width: windowWidth } = useWindowDimensions();
  const boxSize = Math.floor((windowWidth - 56) / 3);

  const setRecentIfChanged = useCallback((nextAssets: AttachmentAsset[]) => {
    setRecent((prev) => {
      if (areSameAssets(prev, nextAssets)) return prev;
      recentCountRef.current = nextAssets.length;
      return nextAssets;
    });
  }, []);

  const loadRecents = useCallback(
    async (options?: { force?: boolean; showLoader?: boolean }) => {
      const force = options?.force === true;
      const showLoader = options?.showLoader !== false;

      if (loadingRecentRef.current) return;
      if (!force && recentCountRef.current > 0) return;

      loadingRecentRef.current = true;
      const mySeq = ++loadSeqRef.current;

      if (showLoader && recentCountRef.current === 0) {
        setLoadingRecent(true);
      }

      try {
        const result = await loadRecentPhotos(30);
        if (!mountedRef.current || loadSeqRef.current !== mySeq) return;

        setHasPermission(result.granted);
        if (result.granted) {
          setRecentIfChanged(result.assets);
        }
      } finally {
        if (mountedRef.current && loadSeqRef.current === mySeq) {
          setLoadingRecent(false);
        }
        if (loadSeqRef.current === mySeq) {
          loadingRecentRef.current = false;
        }
      }
    },
    [setRecentIfChanged]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      if (cameraRefreshTimerRef.current) {
        clearTimeout(cameraRefreshTimerRef.current);
        cameraRefreshTimerRef.current = null;
      }
    };
  }, []);

  const scheduleCameraReturnRefresh = useCallback(() => {
    if (!sheetOpenRef.current) return;
    if (cameraRefreshTimerRef.current) {
      clearTimeout(cameraRefreshTimerRef.current);
    }
    cameraRefreshTimerRef.current = setTimeout(() => {
      cameraRefreshTimerRef.current = null;
      loadRecents({ force: true, showLoader: false });
    }, 700);
  }, [loadRecents]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      const returnedToActive = (prevState === 'background' || prevState === 'inactive') && nextState === 'active';
      if (!returnedToActive || !refreshAfterCameraRef.current) return;

      refreshAfterCameraRef.current = false;
      scheduleCameraReturnRefresh();
    });

    return () => subscription.remove();
  }, [scheduleCameraReturnRefresh]);

  const handleOpenCamera = useCallback(() => {
    refreshAfterCameraRef.current = true;
    onOpenCamera();
  }, [onOpenCamera]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => sheetRef.current?.snapToIndex(openIndex),
      close: () => sheetRef.current?.close(),
    }),
    [openIndex]
  );

  useEffect(() => {
    if (open === true) {
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(openIndex));
    } else if (open === false) {
      sheetRef.current?.close();
    }
  }, [open, openIndex]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        sheetOpenRef.current = false;
        onClose();
        setTimeout(() => setSelected({}), 220);
      } else if (index >= 0) {
        sheetOpenRef.current = true;
        const forceRefresh = refreshAfterCameraRef.current;
        if (forceRefresh) refreshAfterCameraRef.current = false;
        loadRecents({ force: forceRefresh, showLoader: recentCountRef.current === 0 });
      }
    },
    [onClose, loadRecents]
  );

  const renderHandle = useCallback(
    () => (
      <View style={styles.handleWrap}>
        <View style={[styles.handleBar, { backgroundColor: theme.text, opacity: 0.2 }]} />
      </View>
    ),
    [theme.text]
  );

  const toggleSelect = useCallback((asset: AttachmentAsset) => {
    if (asset.isCamera) return;
    const key = asset.id ?? asset.uri;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  const handleSendSelected = useCallback(async () => {
    if (selectedCount === 0) return;
    const picked = recent.filter((r) => selected[r.id ?? r.uri]);
    if (onSendMediaDirect) {
      await onSendMediaDirect(picked, true);
      sheetRef.current?.close();
    } else {
      onPickFromGallery();
    }
  }, [selectedCount, recent, selected, onSendMediaDirect, onPickFromGallery]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" opacity={0.4} />
    ),
    []
  );

  const listData = useMemo(() => {
    return [{ isCamera: true, id: 'camera-btn', uri: '' }, ...recent];
  }, [recent]);

  const renderFlashItem = useCallback(
    ({ item }: { item: AttachmentAsset }) => {
      if (item.isCamera) {
        return (
          <Pressable
            style={[styles.cameraBox, { width: boxSize, height: boxSize, backgroundColor: theme.inputFieldBg }]}
            onPress={handleOpenCamera}
          >
            <Camera size={30} color={theme.text} strokeWidth={1.5} opacity={0.8} />
          </Pressable>
        );
      }

      const isSelected = selected[item.id ?? item.uri];
      return (
        <Pressable
          style={[styles.recentBox, { width: boxSize, height: boxSize, backgroundColor: theme.inputFieldBg }]}
          onPress={() => toggleSelect(item)}
        >
          <Image
            source={{ uri: item.uri }}
            style={styles.recentImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150} 
          />
          <View
            style={[
              styles.circleCheck,
              { borderColor: isSelected ? tint : 'rgba(255,255,255,0.8)' },
              isSelected ? { backgroundColor: tint } : { backgroundColor: 'rgba(0,0,0,0.1)' },
            ]}
          >
            {isSelected && <Check size={12} color={tintOn} strokeWidth={3} />}
          </View>
        </Pressable>
      );
    },
    [boxSize, theme, handleOpenCamera, selected, toggleSelect, tint, tintOn]
  );

  const menuGroups = useMemo(
    () => [
      [
        {
          label: t('chat:attachment.photo'),
          icon: <ImageIcon size={22} color={tint} strokeWidth={2.0} />,
          onPress: onPickFromGallery,
        },
        {
          label: t('chat:attachment.camera'),
          icon: <Camera size={22} color={tint} strokeWidth={2.0} />,
          onPress: handleOpenCamera,
        },
        {
          label: t('chat:attachment.file'),
          icon: <FileText size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenFile,
        },
      ],
      [
        {
          label: t('chat:attachment.voiceMessage'),
          icon: <Mic size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenVoice ?? (() => {}),
        },
        {
          label: t('chat:attachment.call'),
          icon: <Phone size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenCall,
        },
        {
          label: t('chat:attachment.contact'),
          icon: <Contact size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenContact ?? (() => {}),
        },
      ],
      [
        {
          label: t('chat:attachment.map'),
          icon: <MapPin size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenMap,
        },
        {
          label: t('chat:attachment.capture'),
          icon: <ScanLine size={22} color={tint} strokeWidth={2.0} />,
          onPress: onOpenCapture ?? (() => {}),
        },
        ...(!isBeaconRoom
          ? [
              {
                label: t('chat:attachment.schedule'),
                icon: <CalendarDays size={22} color={tint} strokeWidth={2.0} />,
                onPress: onOpenSchedule ?? (() => {}),
              },
            ]
          : []),
      ],
    ],
    [
      onPickFromGallery,
      handleOpenCamera,
      onOpenFile,
      onOpenVoice,
      onOpenCall,
      onOpenContact,
      onOpenMap,
      onOpenCapture,
      onOpenSchedule,
      isBeaconRoom,
      tint,
      t,
    ]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      animateOnMount={false}
      backgroundStyle={{ backgroundColor: theme.inputBg }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: Math.max(20, bottomInset + 20) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.recentSection, { borderBottomColor: theme.inputFieldBg }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: theme.text }]} allowFontScaling={false}>
              {t('chat:attachment.recentPhotos')}
            </Text>
            <Pressable
              onPress={handleSendSelected}
              disabled={selectedCount === 0}
              hitSlop={10}
              style={[
                styles.sendBtn,
                selectedCount > 0 ? { backgroundColor: tint } : { backgroundColor: theme.opponentBubble },
              ]}
            >
              <Text style={[styles.sendBtnText, { color: selectedCount > 0 ? tintOn : theme.accessoryIcon }]} allowFontScaling={false}>
                {t('chat:attachment.send')}{selectedCount > 0 && ` (${selectedCount})`}
              </Text>
            </Pressable>
          </View>

          {hasPermission === false ? (
            <View style={[styles.permissionFallback, { width: windowWidth, height: boxSize }]}>
              <Text style={[styles.permissionText, { color: theme.text }]} allowFontScaling={false}>
                {t('chat:attachment.photoPermissionRequired')}
              </Text>
              <Pressable hitSlop={15} onPress={() => Linking.openSettings()} style={styles.permissionBtn}>
                <Text style={[styles.permissionBtnText, { color: tint }]} allowFontScaling={false}>
                  {t('chat:attachment.openSettings')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ height: boxSize }}>
              {loadingRecent && recent.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={theme.text} />
                </View>
              ) : (
                <FlatList
                  horizontal
                  data={listData}
                  renderItem={renderFlashItem}
                  keyExtractor={(item) => item.id ?? item.uri}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  ItemSeparatorComponent={() => <View style={{ width: 8 }} />} 
                  initialNumToRender={5} 
                  maxToRenderPerBatch={5} 
                  windowSize={3} 
                  removeClippedSubviews={true} 
                  extraData={selected} // ✅ 2. 렌더링 최적화: 이거 없으면 사진 눌러도 체크 표시 안 나옴
                />
              )}
            </View>
          )}
        </View>

        <View style={styles.menuContainer}>
          {menuGroups.map((group, groupIndex) => (
            <View key={groupIndex} style={[styles.menuGroup, { backgroundColor: theme.background }]}>
              {group.map((item, index) => (
                <ListItem
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  onPress={item.onPress}
                  isLast={index === group.length - 1}
                  theme={theme}
                />
              ))}
            </View>
          ))}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default AttachmentSheet;

const styles = StyleSheet.create({
  handleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },

  recentSection: {
    paddingTop: 4,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 15, fontWeight: '600' },
  sendBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  sendBtnText: { fontSize: 13, fontWeight: '600' },

  cameraBox: { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  recentBox: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  recentImg: { width: '100%', height: '100%' },
  circleCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  permissionFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  permissionText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    opacity: 0.8,
  },
  permissionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  permissionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  menuContainer: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  menuGroup: { borderRadius: 14, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, height: 52 },
  listIconWrap: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
  listContent: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  listLabel: { fontSize: 15, fontWeight: '400' },
});