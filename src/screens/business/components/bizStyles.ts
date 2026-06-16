// src/screens/business/components/bizStyles.ts
import { useMemo } from 'react';
import { StyleSheet, Dimensions, Platform } from 'react-native';
import { createBusinessComponentTheme, useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Create.tsx 에서 쓰던 상수들을 여기로 이동
export const HEADER_HEIGHT = 54;
export const TABBAR_HEIGHT = 40;
const MOSAIC_GAP = 3;

// 사진 그리드 한 칸 크기 (3열)
const GRID_IMAGE_SIZE = (SCREEN_WIDTH - 16 * 2 - 4 * 4) / 3;

// ---------- Styles ---------- //
export const createBizStyles = (ui: BusinessComponentTheme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ui.background,
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ----- HEADER ----- //
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    backgroundColor: ui.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    textAlign: 'left',
    fontSize: 22,
    fontWeight: '800',
    color: ui.text,
  },
  headerRight: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0EA5E9',
  },

  scroll: {
    flex: 1,
    backgroundColor: ui.background,
  },

  // ----- HERO / CAROUSEL ----- //
  carouselContainer: {
    width: '100%',
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: ui.imageSurface,
  },
  headerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  headerImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerImagePlaceholderText: {
    fontSize: 14,
    color: ui.textMuted,
  },
  carouselDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  carouselDotActive: {
    backgroundColor: ui.surface,
  },

  // ----- BASIC INFO HEADER ----- //
  basicInfoContainer: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: ui.surface,
  },
  businessName: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.text,
  },
  businessIntro: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
  },
  businessIntroPlaceholder: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textMuted,
  },
  visitorFeedCount: {
    marginTop: 6,
    fontSize: 13,
    color: ui.textMuted,
  },

  // ----- ACTION ROW ----- //
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: ui.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    marginTop: 4,
    fontSize: 12,
    color: ui.textSecondary,
  },

  // ----- TAB BAR ----- //
  tabBar: {
    flexDirection: 'row',
    backgroundColor: ui.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    height: TABBAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#111827',
  },
  tabLabel: {
    fontSize: 13,
    color: ui.textMuted,
  },
  tabLabelActive: {
    color: ui.text,
    fontWeight: '600',
  },

  // ----- COMMON CONTENT ----- //
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: ui.surface,
    borderRadius: ui.radius.xl,
    padding: 14,
    marginBottom: 12,
    shadowColor: ui.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: ui.text,
  },
  sectionMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionMoreText: {
    marginRight: 2,
    fontSize: 12,
    color: ui.textMuted,
  },

  mutedText: {
    fontSize: 13,
    color: ui.textMuted,
  },

  // ----- HOME: MOSAIC ----- //
  mosaicRow: {
    flexDirection: 'row',
    height: SCREEN_WIDTH * 0.5,
    overflow: 'hidden',
    borderRadius: ui.radius.xl,
  },
  mosaicMain: {
    flex: 2,
    marginRight: MOSAIC_GAP,
  },
  mosaicRight: {
    flex: 1,
    flexWrap: 'wrap',
  },
  mosaicSub: {
    width: '100%',
    height: '33.33%',
    marginBottom: MOSAIC_GAP,
  },

  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  posterThumb: {
    width: 64,
    height: 64,
    borderRadius: ui.radius.md,
    marginRight: 10,
    backgroundColor: ui.imageSurface,
  },
  posterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.text,
  },
  posterBody: {
    marginTop: 2,
    fontSize: 13,
    color: ui.textSecondary,
  },

  infoText: {
    fontSize: 14,
    color: ui.text,
  },
  infoSubText: {
    marginTop: 4,
    fontSize: 13,
    color: ui.textMuted,
  },
  aiText: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },

  // ----- 대표 메뉴 그리드 ----- //
  signatureMenuScroll: {
    marginTop: 12,
  },
  signatureMenuCard: {
    width: 110,
    marginRight: 10,
    //alignItems: 'center',
  },
  signatureMenuImageWrapper: {
    width: '100%',
    height: 100,
    borderRadius: ui.radius.xl,
    backgroundColor: ui.imageSurface,
    overflow: 'hidden',
    marginBottom: 6,
  },
  signatureMenuImage: {
    width: '100%',
    height: '100%',
  },
  signatureMenuImagePlaceholder: {
    flex: 1,
    backgroundColor: ui.imageSurface,
  },
  signatureMenuName: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.text,
  },
  signatureMenuPrice: {
    marginTop: 2,
    fontSize: 12,
    color: ui.textSecondary,
  },

  // ----- FEED PREVIEW ----- //
  feedPreviewCard: {
    width: 160,
    marginRight: 10,
    borderRadius: ui.radius.xl,
    backgroundColor: ui.background,
    overflow: 'hidden',
  },
  feedPreviewImagePlaceholder: {
    height: 90,
    backgroundColor: ui.imageSurface,
  },
  feedPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.text,
  },
  feedPreviewText: {
    marginTop: 2,
    fontSize: 12,
    color: ui.textMuted,
  },
  feedMoreButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: ui.radius.full,
    backgroundColor: ui.surfaceAlt,
  },
  feedMoreText: {
    fontSize: 12,
    color: ui.text,
  },

  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ---------- EMPTY STATE (Detail에서 사용) ---------- */
  emptyContainer: {
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: ui.textMuted,
  },

  /* ---------- CARD COMMON (Detail 카드용) ---------- */
  cardImage: {
    width: '100%',
    height: 180,
    borderRadius: ui.radius.xl,
    backgroundColor: ui.imageSurface,
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.text,
    marginBottom: 4,
  },
  cardText: {
    fontSize: 13,
    color: ui.textSecondary,
  },

  // ----- MENU CREATE & CATEGORY ----- //
  menuCreateRow: {
    gap: 8,
  },
  menuBoardInput: {
    borderRadius: ui.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: ui.background,
  },
  menuCreateButton: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.primary,
  },
  menuCreateButtonText: {
    fontSize: 13,
    color: ui.fixedWhite,
    fontWeight: '600',
  },

  menuCategoryTabs: {
    paddingVertical: 4,
  },
  menuCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ui.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    marginRight: 8,
    backgroundColor: ui.surface,
  },
  menuCategoryChipActive: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  menuCategoryChipText: {
    fontSize: 12,
    color: ui.textSecondary,
  },
  menuCategoryChipTextActive: {
    color: ui.fixedWhite,
    fontWeight: '600',
  },

  // ----- MENU BOARD & ITEMS ----- //
  menuBoardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBoardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.text,
  },
  menuBoardCategory: {
    marginLeft: 6,
    fontSize: 12,
    color: ui.textMuted,
  },
  menuBoardDescription: {
    marginTop: 4,
    fontSize: 13,
    color: ui.textMuted,
  },
  menuAddButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: ui.radius.full,
    backgroundColor: ui.surfaceAlt,
  },
  menuAddButtonText: {
    fontSize: 12,
    color: ui.text,
  },

  menuItemCard: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.hairline,
    marginTop: 8,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: ui.radius.sm,
    backgroundColor: ui.primary,
    marginRight: 6,
  },
  menuBadgeText: {
    fontSize: 10,
    color: ui.fixedWhite,
    fontWeight: '600',
  },
  menuItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.text,
  },
  menuItemDesc: {
    marginTop: 2,
    fontSize: 12,
    color: ui.textMuted,
  },
  menuItemPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: ui.text,
  },

  // 썸네일 + 대표 뱃지
  menuItemImageWrapper: {
    width: 72,
    height: 72,
    marginLeft: 10,
    borderRadius: 10,
    backgroundColor: ui.imageSurface,
    overflow: 'hidden',
    position: 'relative',
  },
  menuItemImage: {
    width: '100%',
    height: '100%',
  },
  mainPhotoTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: ui.radius.full,
    backgroundColor: 'rgba(17,24,39,0.9)',
  },
  mainPhotoTagText: {
    fontSize: 10,
    color: ui.fixedWhite,
    fontWeight: '600',
  },

  // 하단 액션 텍스트 (메뉴용)
  menuItemActionText: {
    fontSize: 12,
    color: ui.textSecondary,
  },
  menuItemActionTextActive: {
    color: '#0EA5E9',
    fontWeight: '600',
  },

  /* ---------- MENU DETAIL LIST (Detail에서 쓰는 전용) ---------- */
  menuSection: {
    marginTop: 16,
    marginBottom: 10,
  },
  menuSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.text,
  },
  menuSectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: ui.textMuted,
  },
  menuEmptyText: {
    marginTop: 8,
    fontSize: 13,
    color: ui.textMuted,
  },
  menuRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  menuName: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.text,
  },
  menuSignatureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: ui.radius.sm,
    backgroundColor: ui.primary,
    marginRight: 6,
  },
  menuSignatureBadgeText: {
    fontSize: 10,
    color: ui.fixedWhite,
    fontWeight: '600',
  },
  menuDesc: {
    marginTop: 2,
    fontSize: 12,
    color: ui.textMuted,
  },
  menuPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: ui.text,
  },

  // ----- PHOTO GRID (사진 탭용) ----- //
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  photoItemContainer: {
    width: GRID_IMAGE_SIZE,
    margin: 4,
    alignItems: 'center',
  },
  photoGridImage: {
    width: GRID_IMAGE_SIZE,
    height: GRID_IMAGE_SIZE,
    borderRadius: 10,
    backgroundColor: ui.imageSurface,
  },

  // 상단 사진 등록 폼 버튼들 (대표 / 등록 / 취소)
  photoTopButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
    backgroundColor: ui.surface,
    marginRight: 6,
  },
  photoTopButtonText: {
    fontSize: 13,
    color: ui.textSecondary,
  },
  photoTopButtonSubmit: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.primary,
    marginRight: 6,
  },
  photoTopButtonSubmitText: {
    fontSize: 13,
    color: ui.fixedWhite,
    fontWeight: '600',
  },
  photoTopButtonCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.surfaceAlt,
  },
  photoTopButtonCancelText: {
    fontSize: 13,
    color: ui.text,
  },

  // ----- POSTER / 공지 / 이벤트 등록 ----- //
  posterFormRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  imagePickerBox: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ui.background,
    marginRight: 10,
  },
  imagePickerPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  imagePickerText: {
    fontSize: 12,
    color: ui.textMuted,
    textAlign: 'center',
  },
  posterTitleInput: {
    borderRadius: ui.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
    backgroundColor: ui.background,
  },
  posterInput: {
    minHeight: 70,
    borderRadius: ui.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
    backgroundColor: ui.background,
  },
  posterSubmitButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.primary,
  },
  posterSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.fixedWhite,
  },
  posterListRow: {
    flexDirection: 'row',
    marginTop: 10,
  },

  // ----- LABELED INPUT / TOGGLE ----- //
  inputRow: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    color: ui.textMuted,
    marginBottom: 4,
  },
  input: {
    borderRadius: ui.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: ui.background,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },

  toggleRow: {
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 12,
    color: ui.textMuted,
    marginBottom: 6,
  },
  toggleButtons: {
    flexDirection: 'row',
  },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: ui.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    marginRight: 6,
    backgroundColor: ui.surface,
  },
  toggleButtonActive: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  toggleButtonActiveLight: {
    backgroundColor: ui.surfaceAlt,
  },
  toggleButtonText: {
    fontSize: 12,
    color: ui.textSecondary,
  },
  toggleButtonTextActive: {
    color: ui.fixedWhite,
    fontWeight: '600',
  },
  toggleButtonTextActiveLight: {
    color: ui.text,
  },

  // ----- MENU ITEM MODAL ----- //
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '88%',
    borderRadius: 16,
    backgroundColor: ui.surface,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.text,
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: ui.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
    backgroundColor: ui.background,
  },
  modalInputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.surfaceAlt,
    marginRight: 6,
  },
  modalCancelButtonText: {
    fontSize: 13,
    color: ui.text,
  },
  modalSubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.primary,
  },
  modalSubmitButtonText: {
    fontSize: 13,
    color: ui.fixedWhite,
    fontWeight: '600',
  },

  // ----- MENU PREVIEW MODAL ----- //
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 18,
    backgroundColor: ui.surface,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.7,
    backgroundColor: ui.imageSurface,
  },
  previewBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewBoardTitle: {
    fontSize: 12,
    color: ui.textMuted,
    marginBottom: 2,
  },
  previewMenuName: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.text,
  },
  previewPrice: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
    color: ui.text,
  },
  previewDesc: {
    marginTop: 8,
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  previewCloseButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.hairline,
    paddingVertical: 10,
    alignItems: 'center',
  },
  previewCloseText: {
    fontSize: 15,
    color: ui.text,
    fontWeight: '600',
  },

  /* ---------- INFO SECTION (가게 정보 탭/Detail 공용) ---------- */
  infoSection: {
    marginTop: 12,
    marginBottom: 18,
  },
  infoSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.text,
    marginBottom: 6,
  },
  infoPlaceholder: {
    fontSize: 13,
    color: ui.textMuted,
  },
    aiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ui.radius.full,
    backgroundColor: ui.blueSoft,
  },
  aiBadgeText: {
    fontSize: 10,
    color: ui.blue,
    fontWeight: '600',
  },
  aiGenerateButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ui.radius.full,
    backgroundColor: ui.primary,
  },
  aiGenerateButtonDisabled: {
    opacity: 0.6,
  },
  aiGenerateButtonText: {
    fontSize: 12,
    color: ui.fixedWhite,
    fontWeight: '600',
  },
  aiGenerateButtonTextDisabled: {
    color: ui.textFaint,
  },


  __placeholder: {
    color: ui.placeholder,
  },
  __iconMuted: {
    color: ui.textMuted,
  },
  inputValueText: {
    color: ui.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: ui.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.hairline,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: ui.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: ui.cardShadowOpacity,
    shadowRadius: 6,
    elevation: ui.isDark ? 0 : 1,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    marginTop: 4,
    fontSize: 11,
    color: ui.textMuted,
    fontWeight: '500',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: ui.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: ui.surface,
  },
  logoHelpText: {
    marginTop: 8,
    fontSize: 13,
    color: ui.textMuted,
  },
});


export function useBizStyles() {
  const { theme } = useBusinessComponentTheme();
  return useMemo(() => createBizStyles(theme), [theme]);
}

export const styles = createBizStyles(createBusinessComponentTheme({ isDark: false }));
