// src/screens/profile/postDetail/styles.ts
import { StyleSheet } from 'react-native';
import {
  CAPTION_BOTTOM,
  DATE_BOTTOM,
  HEADER_HEIGHT,
  ICON_SPACING,
  ID_SPACING,
  SIDE_MARGIN,
} from './constants';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7F9' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 10, color: '#666' },
  
  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerLeft: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
    height: HEADER_HEIGHT,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: HEADER_HEIGHT,
  },
  logoText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#111827',
  },
  headerTabTitle: { fontSize: 14, color: '#111827' },
  headerBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBackIcon: {
    fontSize: 20,
    color: '#111827',
  },
  headerCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerChevron: {
    marginLeft: 6,
  },

  // Polaroid Layout
  postCard: {
    marginHorizontal: 0,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  polaroidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIDE_MARGIN,
    paddingTop: ID_SPACING,
    paddingBottom: ID_SPACING,
    backgroundColor: '#FFFFFF',
  },
  postHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  postHeaderMore: { padding: 10 },
  postHeaderName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  postHeaderSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  avatarFallbackTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  mediaContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  mediaItem: { paddingHorizontal: 0 },
  mediaFrame: {
    marginHorizontal: SIDE_MARGIN,
    borderRadius: 2,
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', backgroundColor: '#f3f4f6' },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  dotRow: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: '#fff' },

  polaroidChin: {
    position: 'relative',
    paddingHorizontal: SIDE_MARGIN,
    paddingTop: 0,
    paddingBottom: DATE_BOTTOM + 8,
    backgroundColor: '#FFFFFF',
  },
  actionRow: {
    paddingHorizontal: 0,
    paddingTop: ICON_SPACING,
    paddingBottom: ICON_SPACING,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center' },
  iconGroup: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  iconBtn: { padding: 3 },
  iconCountText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },

  captionRow: {
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: CAPTION_BOTTOM + 8,
  },
  captionBodyText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111827',
    fontWeight: '600',
  },
  viewCommentsText: { fontSize: 14, color: '#6b7280' },

  dateDigiWrap: {
    position: 'absolute',
    right: SIDE_MARGIN,
    bottom: DATE_BOTTOM,
  },
  dateDigiText: {
    fontSize: 18,
    lineHeight: 18,
    color: '#FF8C00',
    letterSpacing: 0.6,
    fontFamily: 'DS-DIGI',
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: -1, height: -1 },
    textShadowRadius: 0.5,
    marginBottom: 5,
  },

  // FAB (Floating Action Button)
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,

    elevation: 0, 

    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', 
  },

  // Modals & Sheets
  // Modals & Sheets
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)', // 살짝 더 깊이감 있게 변경
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  commentSheet: {
    maxHeight: '85%',
    minHeight: '40%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24, // 더 둥글고 예쁘게
    borderTopRightRadius: 24,
    paddingBottom: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB', // 더 부드러운 색상
    marginTop: 12,
    marginBottom: 4,
  },
  commentHeaderRow: {
    height: 52, // 높이를 고정해서 뼈대를 튼튼하게!
    flexDirection: 'row',
    justifyContent: 'center', 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  commentTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  
  commentCloseBtn: {
    position: 'absolute',
    right: 8, // 우측 여백
    top: 0,
    bottom: 0, // 위아래 꽉 채우기
    justifyContent: 'center', // 세로 중앙 정렬
    paddingHorizontal: 16, // 좌우 터치 영역 아주 넉넉하게
  },
  commentClose: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#6B7280' 
  },
  commentEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  commentEmptyTxt: { color: '#9CA3AF', fontSize: 15 },
  
  // 🌟 댓글 Row 디자인 핵심
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentAvatar: {
    width: 36, // 루트 댓글은 살짝 크게
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
  },
  commentAvatarReply: {
    width: 24, // 답글은 앙증맞게 크기 축소! (계층감 확립)
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginTop: 4,
  },
  commentContentWrap: {
    flex: 1,
    marginLeft: 10,
  },
  commentNameWrap: {
    alignSelf: 'flex-start', // 이름 영역만큼만 터치되도록 제한!
    marginBottom: 2,
  },
  commentName: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#6B7280' // 이름은 살짝 연하게 
  },
  commentBody: { 
    fontSize: 14, 
    color: '#111827', 
    lineHeight: 20 // 줄간격 넓혀서 가독성 업
  },
  commentRowDeleted: { opacity: 0.6 },
  commentDeletedText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  commentMetaGhost: { fontSize: 12, color: '#9ca3af' },
  
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 16, // 간격 넓힘
  },
  commentReplyCount: { fontSize: 12, fontWeight: '600', color: '#6366f1' }, // 코온 포인트 컬러
  commentReplyBtn: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  
  commentLikeBox: {
    alignItems: 'center',
    width: 32,
    paddingTop: 4,
  },
  commentLikeNumber: { marginTop: 4, fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  // 🌟 입력창 알약 디자인
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  commentInputBox: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20, // 완벽한 알약 형태
    backgroundColor: '#F3F4F6', // 테두리 없애고 연한 배경
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 12,
    justifyContent: 'center',
  },
  commentTextInput: { 
    paddingTop: 0, 
    paddingBottom: 0, 
    fontSize: 14, 
    color: '#111827',
    lineHeight: 20,
  },
  commentSendBtn: { 
    justifyContent: 'center',
    paddingHorizontal: 12, 
    paddingBottom: 10,
  },
  commentSendTxt: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#6366f1' // 전송 버튼 포인트 컬러
  },

  replyToBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  replyToText: { fontSize: 12, color: '#6B7280' },
  replyToCancel: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
  // ---------------------------------------------

  likesHeaderRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  likesHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  likesHeaderClose: { fontSize: 14, color: '#6b7280' },
  likesEmptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  likeUserInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  likeUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#e5e7eb',
  },
  likeUserName: { fontSize: 14, color: '#111827' },
  likeUserActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  likeUserActionTxt: { fontSize: 13, fontWeight: '600', color: '#111827' },

  uploadBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  uploadBanner: {
    width: '100%',
    maxWidth: 400,
    minHeight: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  uploadBannerContent: {
    flex: 1,
  },
  uploadIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  uploadBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  uploadBannerSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#ef4444', 
  },
  uploadProgressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    width: '100%',
  },
  uploadProgressFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: '#6366f1',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
  },

  uploadBannerAction: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  uploadBannerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
});

export type PostDetailStyles = typeof styles;
