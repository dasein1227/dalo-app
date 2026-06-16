// src/screens/chat/OpenChatProfileEdit.tsx

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronLeft } from 'lucide-react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import { syncChatRooms } from '@/lib/chatSync/roomSync';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import { createOpenChatProfileEditTheme } from './OpenChatProfileEdit.theme';

const MAX_TITLE_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 12;
const OPEN_CHAT_COVER_RATIO = 9 / 16;

const ROOM_COVER_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

type PickedCover = {
  uri: string;
  contentType: string;
  ext: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function firstRpcRow<T = any>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  if (data && typeof data === 'object') return data as T;
  return null;
}

function getInitial(value: string | null | undefined, fallback = 'O') {
  const text = cleanString(value);
  return (text.slice(0, 1) || fallback).toUpperCase();
}

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

function normalizeImageContentType(value: unknown, fallbackExt: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const normalized = raw === 'image/jpg' ? 'image/jpeg' : raw;
  if (ROOM_COVER_CONTENT_TYPES.has(normalized)) return normalized;
  return contentTypeFromExt(fallbackExt);
}

function pickedCoverFromAsset(asset: SimplePickedImage): PickedCover {
  const ext = sanitizeImageExt(
    typeof asset.filename === 'string' && asset.filename.includes('.')
      ? asset.filename.split('.').pop()
      : extFromUri(asset.uri),
  );

  return {
    uri: asset.uri,
    ext,
    contentType: normalizeImageContentType(asset.contentType, ext),
  };
}

async function uploadOpenCoverToR2(roomId: string | number, picked: PickedCover): Promise<string> {
  const { data, error } = await supabase.functions.invoke('open-upload', {
    body: {
      scope: 'chat_room_cover',
      roomId,
      contentType: picked.contentType,
      ext: picked.ext,
    },
  });

  if (error) throw error;

  const uploadUrl = String((data as any)?.uploadUrl ?? '');
  const publicUrl = String((data as any)?.publicUrl ?? '');
  const uploadContentType = String((data as any)?.contentType ?? picked.contentType);

  if (!uploadUrl || !publicUrl) throw new Error('invalid_upload_presign_response');

  const blob = await (await fetch(picked.uri)).blob();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': uploadContentType },
    body: blob as any,
  });

  if (!putRes.ok) throw new Error(`r2_upload_failed:${putRes.status}`);
  return publicUrl;
}

function normalizeTagsInput(value: string): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[#,/\n]/)
        .map((tag) => tag.trim().replace(/^#+/, '').toLowerCase())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, MAX_TAGS);
}

function tagsToInput(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .join(', ');
}

export default function OpenChatProfileEdit() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation('chat');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createOpenChatProfileEditTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);

  const roomId = Number(route.params?.roomId ?? route.params?.room_id ?? 0);
  const [title, setTitle] = useState(cleanString(route.params?.initialTitle));
  const [coverUrl, setCoverUrl] = useState<string | null>(cleanString(route.params?.initialCoverUrl) || null);
  const [pickedCover, setPickedCover] = useState<PickedCover | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editorSourceUri, setEditorSourceUri] = useState<string | null>(null);
  const [editorSourceAsset, setEditorSourceAsset] = useState<SimplePickedImage | null>(null);
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [isSearchable, setIsSearchable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [descriptionInputHeight, setDescriptionInputHeight] = useState(120);
  const [tagsInputHeight, setTagsInputHeight] = useState(44);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const sheetExpandedRef = useRef(false);
  const preKeyboardSheetExpandedRef = useRef(false);
  const activeFieldRef = useRef<'title' | 'description' | 'tags' | null>(null);

  const normalizedTags = useMemo(() => normalizeTagsInput(tagsText), [tagsText]);
  const categoryLabel = category || t('openProfile.edit.categoryFallback');

  const heroHeight = Math.round(clamp(windowHeight * 0.6, 360, windowHeight * 0.62));
  const sheetOverlap = Math.round(clamp(windowHeight * 0.05, 26, 44));
  const sheetTopCollapsed = Math.max(insets.top + 230, heroHeight - sheetOverlap);
  const baseCollapsedSheetHeight = Math.max(300, windowHeight - sheetTopCollapsed);
  const keyboardVisible = keyboardHeight > 0;
  const keyboardAffectsSheet = keyboardVisible && activeFieldRef.current !== 'title';
  const maxSheetHeight = Math.round(windowHeight * 0.8);
  const keyboardAvailableSheetHeight = Math.max(280, windowHeight - keyboardHeight - insets.top - 14);
  const cappedSheetHeight = keyboardAffectsSheet
    ? Math.min(maxSheetHeight, keyboardAvailableSheetHeight)
    : maxSheetHeight;
  const collapsedSheetHeight = Math.min(baseCollapsedSheetHeight, cappedSheetHeight);
  const expandedSheetHeight = Math.max(collapsedSheetHeight, cappedSheetHeight);
  const sheetBottom = keyboardAffectsSheet ? keyboardHeight : 0;
  const heroInfoTop = Math.max(insets.top + 112, sheetTopCollapsed - 148);

  const animatedSheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedSheetHeight, expandedSheetHeight],
  });

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    sheetExpandedRef.current = sheetExpanded;
  }, [sheetExpanded]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      // Preserve the user's current sheet state.
      // Keyboard should push the sheet upward, not force-expand it.
      preKeyboardSheetExpandedRef.current = sheetExpandedRef.current;
      setKeyboardHeight(Math.max(0, Number(event.endCoordinates?.height ?? 0)));
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      activeFieldRef.current = null;
      setSheetExpanded(preKeyboardSheetExpandedRef.current);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 1 : 0,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [sheetAnim, sheetExpanded]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy < -18) setSheetExpanded(true);
        else if (gesture.dy > 18) setSheetExpanded(false);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!roomId) return;
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_open_chat_room_profile_v1', {
          p_room_id: roomId,
        });
        if (error) throw error;
        if (!alive) return;

        const row = firstRpcRow<any>(data);
        if (!row) throw new Error('open_profile_not_found');

        setTitle(cleanString(row.title));
        setCoverUrl(cleanString(row.cover_image_url) || null);
        setDescription(String(row.description ?? ''));
        setTagsText(tagsToInput(row.tags));
        setCategory(cleanString(row.category) || null);
        setIsSearchable(row.is_searchable !== false);
      } catch {
        if (!alive) return;
        Alert.alert(t('openProfile.common.notice'), t('openProfile.edit.loadFailed'));
        navigation.goBack();
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [navigation, roomId, t]);

  const handlePickCover = () => {
    if (saving) return;
    Keyboard.dismiss();
    setPickerVisible(true);
  };

  const handlePickedCover = (images: SimplePickedImage[]) => {
    const asset = images[0];
    setPickerVisible(false);

    if (!asset?.uri) return;

    setEditorSourceAsset(asset);
    setEditorSourceUri(asset.uri);
  };

  const handleSaveEditedCover = (uri: string) => {
    const ext = sanitizeImageExt(
      editorSourceAsset?.filename && editorSourceAsset.filename.includes('.')
        ? editorSourceAsset.filename.split('.').pop()
        : extFromUri(uri),
    );

    const picked: PickedCover = {
      uri,
      ext,
      contentType: normalizeImageContentType(editorSourceAsset?.contentType, ext),
    };

    setPickedCover(picked);
    setCoverUrl(uri);
    setEditorSourceUri(null);
    setEditorSourceAsset(null);
  };

  const closeCoverEditor = () => {
    setEditorSourceUri(null);
    setEditorSourceAsset(null);
  };

  const handleSave = async () => {
    if (saving) return;

    const safeTitle = title.trim();
    if (!safeTitle) {
      Alert.alert(t('openProfile.common.notice'), t('openProfile.edit.titleRequired'));
      return;
    }

    try {
      setSaving(true);
      let uploadedCoverUrl: string | null | undefined = undefined;

      if (pickedCover?.uri) {
        uploadedCoverUrl = await uploadOpenCoverToR2(roomId, pickedCover);
      }

      const { error } = await supabase.rpc('update_open_chat_room_profile_v1', {
        p_room_id: roomId,
        p_title: safeTitle,
        p_description: description.trim(),
        p_tags: normalizedTags,
        p_category: null,
        p_is_searchable: isSearchable,
        p_max_members: null,
        p_cover_image_url: uploadedCoverUrl ?? null,
      });

      if (error) throw error;

      await syncChatRooms({
        reason: 'open_chat_profile_edit_save',
        force: true,
        minIntervalMs: 0,
      });
      navigation.goBack();
    } catch {
      Alert.alert(t('openProfile.common.notice'), t('openProfile.edit.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.safeContent, { backgroundColor: ui.background }]}>
        <SystemBars style="light" />
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={ui.icon} />
          </View>
        ) : (
          <View style={styles.root}>
            <View style={[styles.heroWrap, { height: heroHeight }]}> 
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={styles.heroFallback}>
                  <Text style={styles.heroFallbackText}>{getInitial(title)}</Text>
                </View>
              )}
              <LinearGradient
                colors={[
                  'rgba(0,0,0,0.10)',
                  'rgba(0,0,0,0.04)',
                  'rgba(0,0,0,0.24)',
                  'rgba(0,0,0,0.70)',
                ]}
                locations={[0, 0.42, 0.72, 1]}
                style={StyleSheet.absoluteFill}
              />

              <View style={[styles.topBar, { top: insets.top + 10 }]}> 
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topIconButton}>
                  <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2.05} />
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  hitSlop={10}
                  style={({ pressed }) => [styles.saveButton, pressed && { opacity: ui.pressedOpacity }]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveText}>{t('openProfile.common.save')}</Text>
                  )}
                </Pressable>
              </View>

              <View style={[styles.heroInfo, { top: heroInfoTop }]}> 
                <View style={styles.heroPillRow}>
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryText} numberOfLines={1}>{categoryLabel}</Text>
                  </View>
                </View>
                <View style={styles.titleLine}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    maxLength={MAX_TITLE_LENGTH}
                    placeholder={t('openProfile.edit.titlePlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.62)"
                    style={styles.titleInput}
                    editable={!saving}
                    multiline
                    textAlignVertical="bottom"
                    onFocus={() => {
                      activeFieldRef.current = 'title';
                      setSheetExpanded(false);
                    }}
                  />
                  <Pressable
                    onPress={handlePickCover}
                    disabled={saving}
                    style={({ pressed }) => [styles.coverAction, pressed && { opacity: ui.pressedOpacity }]}
                    hitSlop={10}
                  >
                    <Camera size={15} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.coverActionText}>{t('openProfile.edit.changePhoto')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <Animated.View
              style={[
                styles.sheet,
                {
                  height: animatedSheetHeight,
                  bottom: sheetBottom,
                  paddingBottom: Math.max(insets.bottom, 14),
                },
              ]}
            > 
              <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
                <Pressable onPress={() => setSheetExpanded((prev) => !prev)} hitSlop={8} style={styles.sheetHandleButton}>
                  <View style={styles.sheetHandle} />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={sheetExpanded}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                bounces={false}
                contentContainerStyle={[
                  styles.sheetScrollContent,
                  keyboardVisible && styles.sheetScrollContentKeyboard,
                ]}
              >
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder={t('openProfile.edit.descriptionPlaceholder')}
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.inputSurface,
                    styles.descriptionInput,
                    { height: descriptionInputHeight },
                  ]}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                  editable={!saving}
                  onFocus={() => {
                    // Keep collapsed/expanded state as-is. Keyboard only pushes the sheet.
                    activeFieldRef.current = 'description';
                  }}
                  onContentSizeChange={(event) => {
                    const nextHeight = clamp(event.nativeEvent.contentSize.height + 24, 120, 260);
                    setDescriptionInputHeight(nextHeight);
                  }}
                />

                <View style={styles.hairline} />

                <TextInput
                  value={tagsText}
                  onChangeText={setTagsText}
                  placeholder={t('openProfile.edit.tagsPlaceholder')}
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.inputSurface,
                    styles.tagInput,
                    { height: tagsInputHeight },
                  ]}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                  returnKeyType="done"
                  editable={!saving}
                  onFocus={() => {
                    // Keep collapsed/expanded state as-is. Keyboard only pushes the sheet.
                    activeFieldRef.current = 'tags';
                  }}
                  onContentSizeChange={(event) => {
                    const nextHeight = clamp(event.nativeEvent.contentSize.height + 20, 44, 150);
                    setTagsInputHeight(nextHeight);
                  }}
                />

                {normalizedTags.length ? (
                  <View style={styles.tagPreviewWrap}>
                    {normalizedTags.map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.hairline} />

                <View style={styles.publicRow}> 
                  <View style={styles.publicTextWrap}>
                    <Text style={styles.publicTitle}>{t('openProfile.edit.publicTitle')}</Text>
                    <Text style={styles.publicDesc}>{t('openProfile.edit.publicDesc')}</Text>
                  </View>
                  <Switch
                    value={isSearchable}
                    onValueChange={setIsSearchable}
                    disabled={saving}
                    trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }}
                    thumbColor={ui.switchThumb}
                  />
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        )}
        </View>
      </TouchableWithoutFeedback>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handlePickedCover}
        maxSelect={1}
        imageProcessing="cover"
        headerTitle={t('openProfile.edit.selectCover')}
        themeColor={ui.icon}
      />

      <UniversalImageEditor
        visible={!!editorSourceUri}
        sourceUri={editorSourceUri ?? ''}
        initialRatio={OPEN_CHAT_COVER_RATIO}
        onClose={closeCoverEditor}
        onSave={handleSaveEditedCover}
        themeColor={ui.icon}
      />
    </>
  );
}

function createStyles(ui: ReturnType<typeof createOpenChatProfileEditTheme>) {
  return StyleSheet.create({
    safeContent: {
      flex: 1,
    },
    root: {
      flex: 1,
      backgroundColor: ui.sheet,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.background,
    },
    heroWrap: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
      backgroundColor: ui.heroFallback,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.heroFallback,
    },
    heroFallbackText: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 68,
      lineHeight: 76,
      fontWeight: '700',
    },
    topBar: {
      position: 'absolute',
      left: 18,
      right: 18,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topIconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    saveButton: {
      minWidth: 54,
      height: 34,
      paddingHorizontal: 13,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    saveText: {
      color: '#FFFFFF',
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      letterSpacing: -0.15,
    },
    coverAction: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    coverActionText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    heroInfo: {
      position: 'absolute',
      left: 26,
      right: 26,
      zIndex: 14,
    },
    heroPillRow: {
      minHeight: 28,
      marginBottom: 5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    titleLine: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    categoryPill: {
      alignSelf: 'flex-start',
      height: 27,
      paddingHorizontal: 11,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    categoryText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 14,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    titleInput: {
      flex: 1,
      minHeight: 62,
      padding: 0,
      margin: 0,
      color: '#FFFFFF',
      fontSize: 23,
      lineHeight: 30,
      fontWeight: '750' as any,
      letterSpacing: -0.55,
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 7,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      paddingTop: 10,
      paddingHorizontal: 24,
      backgroundColor: ui.sheet,
      borderTopLeftRadius: ui.radius.sheet,
      borderTopRightRadius: ui.radius.sheet,
      borderTopWidth: ui.hairline,
      borderColor: ui.border,
    },
    sheetHandleArea: {
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandleButton: {
      width: 72,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandle: {
      width: 44,
      height: 4,
      borderRadius: 3,
      backgroundColor: ui.textMuted,
      opacity: 0.32,
    },
    sheetScrollContent: {
      paddingTop: 6,
      paddingBottom: 18,
    },
    sheetScrollContentKeyboard: {
      paddingBottom: 34,
    },
    inputSurface: {
      backgroundColor: ui.inputSurface,
      borderWidth: ui.hairline,
      borderColor: ui.inputBorder,
      borderRadius: 15,
      color: ui.text,
    },
    descriptionInput: {
      minHeight: 120,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '400',
      letterSpacing: -0.25,
    },
    hairline: {
      height: ui.hairline,
      marginVertical: 14,
      backgroundColor: ui.border,
    },
    tagInput: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: -0.2,
    },
    tagPreviewWrap: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 8,
      rowGap: 8,
    },
    tagChip: {
      minHeight: 29,
      paddingHorizontal: 9,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.surfaceSoft,
    },
    tagText: {
      color: ui.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    publicRow: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    publicTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    publicTitle: {
      color: ui.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      letterSpacing: -0.22,
    },
    publicDesc: {
      marginTop: 3,
      color: ui.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
      letterSpacing: -0.05,
    },
  });
}
