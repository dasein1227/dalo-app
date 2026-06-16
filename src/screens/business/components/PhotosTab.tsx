import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native';
import {
  Plus,
  Trash2,
  Edit2,
  Star,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';

import { useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';
import type { BusinessPhoto } from './businessTypes';

const BUSINESS_IMAGE_PROPS = { resizeMethod: 'resize' as const, fadeDuration: 0 } as const;

const { width } = Dimensions.get('window');
const COL_COUNT = 3;
const SCREEN_PADDING = 14;
const CARD_PADDING = 14;
const GAP = 2;
const ITEM_SIZE =
  (width - SCREEN_PADDING * 2 - CARD_PADDING * 2 - GAP * (COL_COUNT - 1)) / COL_COUNT;

type PhotosTabProps = {
  photos: BusinessPhoto[];
  heroImageUrl: string | null;

  newPhotoImageUrl: string | null;
  newPhotoCaption: string;
  postingPhoto: boolean;
  editingPhotoId: string | null;

  onChangePhotoCaption: (text: string) => void;
  onPressAddImage: () => void;
  onSubmitPhoto: () => void;
  onCancelForm: () => void;

  onEditPhoto: (photo: BusinessPhoto) => void;
  onDeletePhoto: (photoId: string) => void;
  onSetHeroPhoto: (photo: BusinessPhoto) => void;
};

const getPhotoUri = (photo?: BusinessPhoto | null) => {
  const value = (photo as any)?.image_url ?? (photo as any)?.imageUrl ?? '';
  return typeof value === 'string' ? value.trim() : '';
};

const getPhotoCaption = (photo?: BusinessPhoto | null) => {
  const value =
    (photo as any)?.caption ??
    (photo as any)?.description ??
    (photo as any)?.title ??
    '';
  return typeof value === 'string' ? value.trim() : '';
};

const PhotosTab: React.FC<PhotosTabProps> = ({
  photos,
  heroImageUrl,
  newPhotoImageUrl,
  newPhotoCaption,
  postingPhoto,
  editingPhotoId,
  onChangePhotoCaption,
  onPressAddImage,
  onSubmitPhoto,
  onCancelForm,
  onEditPhoto,
  onDeletePhoto,
  onSetHeroPhoto,
}) => {
  const { t } = useTranslation();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const isEditing = !!editingPhotoId;
  const showCancel = isEditing || !!newPhotoImageUrl || !!newPhotoCaption;
  const selectedSignatureImageUrl =
    typeof heroImageUrl === 'string' ? heroImageUrl.trim() : '';

  const viewerPhotos = useMemo(
    () => photos.filter((photo) => !!getPhotoUri(photo)),
    [photos],
  );

  const viewerPhoto = viewerIndex == null ? null : viewerPhotos[viewerIndex] ?? null;
  const viewerUri = getPhotoUri(viewerPhoto);
  const viewerCaption = getPhotoCaption(viewerPhoto);

  const openViewer = useCallback(
    (photo: BusinessPhoto) => {
      const uri = getPhotoUri(photo);
      if (!uri) return;

      const nextIndex = viewerPhotos.findIndex((item) => item.id === photo.id);
      setViewerIndex(nextIndex >= 0 ? nextIndex : 0);
    },
    [viewerPhotos],
  );

  const closeViewer = useCallback(() => {
    setViewerIndex(null);
  }, []);

  const goPrev = useCallback(() => {
    setViewerIndex((prev) => {
      if (prev == null || viewerPhotos.length <= 1) return prev;
      return prev <= 0 ? viewerPhotos.length - 1 : prev - 1;
    });
  }, [viewerPhotos.length]);

  const goNext = useCallback(() => {
    setViewerIndex((prev) => {
      if (prev == null || viewerPhotos.length <= 1) return prev;
      return prev >= viewerPhotos.length - 1 ? 0 : prev + 1;
    });
  }, [viewerPhotos.length]);

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>{isEditing ? t('business:photos.editTitle') : t('business:photos.newTitle')}</Text>

        {showCancel && (
          <Pressable onPress={onCancelForm} hitSlop={10}>
            <Text style={styles.cancelText}>{t('business:common.cancel')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.formContent}>
        <Pressable style={styles.imagePicker} onPress={onPressAddImage}>
          {newPhotoImageUrl ? (
            <View style={styles.previewWrap}>
              <Image
                {...BUSINESS_IMAGE_PROPS}
                source={{ uri: newPhotoImageUrl }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Pressable
                style={styles.removeImageBtn}
                onPress={(event) => {
                  event.stopPropagation();
                  onCancelForm();
                }}
              >
                <X size={12} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Plus size={24} color={ui.textMuted} />
              <Text style={styles.placeholderText}>{t('business:photos.select')}</Text>
            </View>
          )}

          {newPhotoImageUrl && isEditing && (
            <View style={styles.editBadge}>
              <Edit2 size={12} color="#FFF" />
            </View>
          )}
        </Pressable>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newPhotoCaption}
            onChangeText={onChangePhotoCaption}
            placeholder={t('business:photos.captionPlaceholder')}
            placeholderTextColor={ui.textMuted}
            multiline
          />
          <Pressable
            style={[
              styles.submitBtn,
              (!newPhotoImageUrl && !newPhotoCaption) && styles.submitBtnDisabled,
            ]}
            onPress={onSubmitPhoto}
            disabled={postingPhoto || (!newPhotoImageUrl && !newPhotoCaption)}
          >
            {postingPhoto ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>{isEditing ? t('business:photos.submitEdit') : t('business:photos.submitNew')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderViewer = () => (
    <Modal
      visible={viewerIndex !== null && !!viewerPhoto && !!viewerUri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeViewer}
    >
      <View style={styles.viewerRoot}>
        <View style={styles.viewerTopBar}>
          <Pressable style={styles.viewerCloseBtn} onPress={closeViewer} hitSlop={12}>
            <X size={22} color="#FFF" strokeWidth={2.2} />
          </Pressable>
          <View style={styles.viewerTitleWrap}>
            <Text style={styles.viewerTitle}>{t('business:photos.viewerTitle')}</Text>
            <Text style={styles.viewerIndexText}>
              {(viewerIndex ?? 0) + 1} / {viewerPhotos.length || 1}
            </Text>
          </View>
          <View style={styles.viewerCloseGhost} />
        </View>

        <View style={styles.viewerImageArea}>
          {viewerPhotos.length > 1 && (
            <Pressable style={[styles.viewerNavBtn, styles.viewerNavLeft]} onPress={goPrev} hitSlop={10}>
              <ChevronLeft size={28} color="#FFF" strokeWidth={2.1} />
            </Pressable>
          )}

          {!!viewerUri && (
            <Image
              {...BUSINESS_IMAGE_PROPS}
              source={{ uri: viewerUri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}

          {viewerPhotos.length > 1 && (
            <Pressable style={[styles.viewerNavBtn, styles.viewerNavRight]} onPress={goNext} hitSlop={10}>
              <ChevronRight size={28} color="#FFF" strokeWidth={2.1} />
            </Pressable>
          )}
        </View>

        {!!viewerCaption && (
          <View style={styles.viewerCaptionWrap}>
            <Text style={styles.viewerCaption}>{viewerCaption}</Text>
          </View>
        )}
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.contentCard}>
        {renderForm()}

        <View style={styles.sectionDivider} />

        <View style={styles.gridHeader}>
          <View style={styles.gridTitleWrap}>
            <Text style={styles.gridTitle}>{t('business:photos.gridTitle')}</Text>
            <Text style={styles.gridSubtitle}>{t('business:photos.gridSubtitle')}</Text>
          </View>
          <Text style={styles.countText}>{t('business:common.count', { count: photos.length })}</Text>
        </View>

        {photos.length === 0 ? (
          <View style={styles.emptyState}>
            <ImageIcon size={44} color={ui.textFaint} />
            <Text style={styles.emptyText}>{t('business:photos.empty')}</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {photos.map((photo) => {
              const uri = getPhotoUri(photo);
              const isHero = !!uri && selectedSignatureImageUrl === uri;

              return (
                <View key={photo.id} style={styles.gridItem}>
                  <Pressable
                    onPress={() => openViewer(photo)}
                    style={({ pressed }) => [styles.photoPressable, pressed && styles.photoPressed]}
                    disabled={!uri}
                  >
                    {!!uri ? (
                      <Image
                        {...BUSINESS_IMAGE_PROPS}
                        source={{ uri }}
                        style={styles.gridImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.gridPlaceholder}>
                        <ImageIcon size={22} color={ui.textFaint} />
                      </View>
                    )}

                    {isHero && (
                      <View style={styles.heroBadge}>
                        <Text style={styles.heroBadgeText}>{t('business:menu.signature')}</Text>
                      </View>
                    )}

                    <Pressable
                      style={styles.starBtn}
                      onPress={(event) => {
                        event.stopPropagation();
                        onSetHeroPhoto(photo);
                      }}
                      hitSlop={8}
                    >
                      <Star
                        size={15}
                        color={isHero ? '#FFD700' : '#FFF'}
                        fill={isHero ? '#FFD700' : 'rgba(0,0,0,0.28)'}
                      />
                    </Pressable>

                    <Pressable
                      style={styles.editBtn}
                      onPress={(event) => {
                        event.stopPropagation();
                        onEditPhoto(photo);
                      }}
                      hitSlop={8}
                    >
                      <Edit2 size={13} color="#FFF" strokeWidth={2.2} />
                    </Pressable>

                    <Pressable
                      style={styles.deleteBtn}
                      onPress={(event) => {
                        event.stopPropagation();
                        onDeletePhoto(photo.id);
                      }}
                      hitSlop={8}
                    >
                      <Trash2 size={13} color="#FFF" strokeWidth={2.1} />
                    </Pressable>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {renderViewer()}
    </View>
  );
};

const createStyles = (ui: BusinessComponentTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.background,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 14,
    paddingBottom: 18,
  },
  contentCard: {
    backgroundColor: ui.surface,
    borderRadius: ui.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    overflow: 'hidden',
  },

  formContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.text,
    letterSpacing: -0.25,
  },
  cancelText: {
    fontSize: 13,
    color: ui.textMuted,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  formContent: {
    flexDirection: 'row',
    gap: 12,
  },
  imagePicker: {
    width: 100,
    height: 100,
    borderRadius: ui.radius.lg,
    backgroundColor: ui.surfaceAlt,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewWrap: {
    width: '100%',
    height: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  placeholder: {
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: ui.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  input: {
    flex: 1,
    textAlignVertical: 'top',
    fontSize: 14,
    color: ui.text,
    padding: 0,
    lineHeight: 20,
  },
  submitBtn: {
    backgroundColor: ui.text,
    borderRadius: ui.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: ui.imageSurface,
  },
  submitBtnText: {
    color: ui.fixedWhite,
    fontWeight: '700',
    fontSize: 14,
  },

  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.hairline,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairline,
  },
  gridTitleWrap: {
    flex: 1,
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.text,
    letterSpacing: -0.25,
  },
  gridSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: ui.textMuted,
    fontWeight: '500',
  },
  countText: {
    fontSize: 13,
    color: ui.textMuted,
    fontWeight: '700',
  },

  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: CARD_PADDING,
    gap: GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    overflow: 'hidden',
    backgroundColor: ui.surfaceAlt,
  },
  photoPressable: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  photoPressed: {
    opacity: 0.9,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.surfaceAlt,
  },
  heroBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: ui.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: ui.radius.sm,
  },
  heroBadgeText: {
    color: ui.fixedWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  starBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(239,68,68,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 18,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: ui.textMuted,
    fontWeight: '500',
  },

  viewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  viewerTopBar: {
    height: 76,
    paddingTop: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  viewerCloseGhost: {
    width: 42,
    height: 42,
  },
  viewerTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  viewerIndexText: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
  },
  viewerImageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerNavBtn: {
    position: 'absolute',
    zIndex: 5,
    width: 46,
    height: 62,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  viewerNavLeft: {
    left: 10,
  },
  viewerNavRight: {
    right: 10,
  },
  viewerCaptionWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  viewerCaption: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
});

export default PhotosTab;
