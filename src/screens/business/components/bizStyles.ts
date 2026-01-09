// src/screens/business/components/bizStyles.ts
import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Create.tsx 에서 쓰던 상수들을 여기로 이동
export const HEADER_HEIGHT = 54;
export const TABBAR_HEIGHT = 40;
const MOSAIC_GAP = 3;

// 사진 그리드 한 칸 크기 (3열)
const GRID_IMAGE_SIZE = (SCREEN_WIDTH - 16 * 2 - 4 * 4) / 3;

// ---------- Styles ---------- //
export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F7',
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
    backgroundColor: '#FFFFFF',
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
    color: '#111827',
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
    backgroundColor: '#F5F5F7',
  },

  // ----- HERO / CAROUSEL ----- //
  carouselContainer: {
    width: '100%',
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: '#E5E7EB',
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
    color: '#9CA3AF',
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
    backgroundColor: '#FFFFFF',
  },

  // ----- BASIC INFO HEADER ----- //
  basicInfoContainer: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  businessName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  businessIntro: {
    marginTop: 4,
    fontSize: 14,
    color: '#4B5563',
  },
  businessIntroPlaceholder: {
    marginTop: 4,
    fontSize: 14,
    color: '#9CA3AF',
  },
  visitorFeedCount: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },

  // ----- ACTION ROW ----- //
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
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
    color: '#374151',
  },

  // ----- TAB BAR ----- //
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
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
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#111827',
    fontWeight: '600',
  },

  // ----- COMMON CONTENT ----- //
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
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
    color: '#111827',
  },
  sectionMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionMoreText: {
    marginRight: 2,
    fontSize: 12,
    color: '#9CA3AF',
  },

  mutedText: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // ----- HOME: MOSAIC ----- //
  mosaicRow: {
    flexDirection: 'row',
    height: SCREEN_WIDTH * 0.5,
    overflow: 'hidden',
    borderRadius: 12,
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
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },
  posterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  posterBody: {
    marginTop: 2,
    fontSize: 13,
    color: '#4B5563',
  },

  infoText: {
    fontSize: 14,
    color: '#111827',
  },
  infoSubText: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  aiText: {
    fontSize: 13,
    color: '#374151',
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
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 6,
  },
  signatureMenuImage: {
    width: '100%',
    height: '100%',
  },
  signatureMenuImagePlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  signatureMenuName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  signatureMenuPrice: {
    marginTop: 2,
    fontSize: 12,
    color: '#4B5563',
  },

  // ----- FEED PREVIEW ----- //
  feedPreviewCard: {
    width: 160,
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  feedPreviewImagePlaceholder: {
    height: 90,
    backgroundColor: '#E5E7EB',
  },
  feedPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  feedPreviewText: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  feedMoreButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  feedMoreText: {
    fontSize: 12,
    color: '#111827',
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
    color: '#9CA3AF',
  },

  /* ---------- CARD COMMON (Detail 카드용) ---------- */
  cardImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardText: {
    fontSize: 13,
    color: '#4B5563',
  },

  // ----- MENU CREATE & CATEGORY ----- //
  menuCreateRow: {
    gap: 8,
  },
  menuBoardInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#F9FAFB',
  },
  menuCreateButton: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  menuCreateButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  menuCategoryTabs: {
    paddingVertical: 4,
  },
  menuCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  menuCategoryChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  menuCategoryChipText: {
    fontSize: 12,
    color: '#4B5563',
  },
  menuCategoryChipTextActive: {
    color: '#FFFFFF',
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
    color: '#111827',
  },
  menuBoardCategory: {
    marginLeft: 6,
    fontSize: 12,
    color: '#9CA3AF',
  },
  menuBoardDescription: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  menuAddButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  menuAddButtonText: {
    fontSize: 12,
    color: '#111827',
  },

  menuItemCard: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#111827',
    marginRight: 6,
  },
  menuBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  menuItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  menuItemDesc: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  menuItemPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },

  // 썸네일 + 대표 뱃지
  menuItemImageWrapper: {
    width: 72,
    height: 72,
    marginLeft: 10,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
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
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.9)',
  },
  mainPhotoTagText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // 하단 액션 텍스트 (메뉴용)
  menuItemActionText: {
    fontSize: 12,
    color: '#4B5563',
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
    color: '#111827',
  },
  menuSectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  menuEmptyText: {
    marginTop: 8,
    fontSize: 13,
    color: '#9CA3AF',
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
    color: '#111827',
  },
  menuSignatureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#111827',
    marginRight: 6,
  },
  menuSignatureBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  menuDesc: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  menuPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
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
    backgroundColor: '#E5E7EB',
  },

  // 상단 사진 등록 폼 버튼들 (대표 / 등록 / 취소)
  photoTopButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  photoTopButtonText: {
    fontSize: 13,
    color: '#374151',
  },
  photoTopButtonSubmit: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
    marginRight: 6,
  },
  photoTopButtonSubmitText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  photoTopButtonCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  photoTopButtonCancelText: {
    fontSize: 13,
    color: '#111827',
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    marginRight: 10,
  },
  imagePickerPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  imagePickerText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  posterTitleInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
    backgroundColor: '#F9FAFB',
  },
  posterInput: {
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
  },
  posterSubmitButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  posterSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: '#6B7280',
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#F9FAFB',
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
    color: '#6B7280',
    marginBottom: 6,
  },
  toggleButtons: {
    flexDirection: 'row',
  },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 6,
    backgroundColor: '#FFFFFF',
  },
  toggleButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  toggleButtonActiveLight: {
    backgroundColor: '#F3F4F6',
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#4B5563',
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  toggleButtonTextActiveLight: {
    color: '#111827',
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
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
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
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  modalCancelButtonText: {
    fontSize: 13,
    color: '#111827',
  },
  modalSubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  modalSubmitButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.7,
    backgroundColor: '#E5E7EB',
  },
  previewBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewBoardTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  previewMenuName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  previewPrice: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  previewDesc: {
    marginTop: 8,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  previewCloseButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  previewCloseText: {
    fontSize: 15,
    color: '#111827',
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
    color: '#111827',
    marginBottom: 6,
  },
  infoPlaceholder: {
    fontSize: 13,
    color: '#9CA3AF',
  },
    aiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  aiBadgeText: {
    fontSize: 10,
    color: '#4F46E5',
    fontWeight: '600',
  },
  aiGenerateButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  aiGenerateButtonDisabled: {
    opacity: 0.6,
  },
  aiGenerateButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  aiGenerateButtonTextDisabled: {
    color: '#E5E7EB',
  },

});
