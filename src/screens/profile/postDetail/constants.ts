// src/screens/profile/postDetail/constants.ts

import { Dimensions } from 'react-native';

/**
 * 📏 폴라로이드 황금 비율 설정
 */
export const SCREEN_WIDTH = Dimensions.get('window').width;
export const SIDE_MARGIN = SCREEN_WIDTH * 0.05;
export const ID_SPACING = SCREEN_WIDTH * 0.03;
export const ICON_SPACING = SCREEN_WIDTH * 0.03;
export const CAPTION_BOTTOM = SCREEN_WIDTH * 0.15;
export const DATE_BOTTOM = SCREEN_WIDTH * 0.05;

// ⚡️ 스크롤 실패 시 추측할 아이템 평균 높이 (이미지 + 헤더 + 푸터)
export const AVERAGE_ITEM_HEIGHT = SCREEN_WIDTH + 150;

export const HEADER_HEIGHT = 54;
export const ALL_TAB_ID = 'ALL_TABS_VIRTUAL_ID';

export const POST_UPLOAD_EVENTS = {
  START: 'postUpload:start',
  PROGRESS: 'postUpload:progress',
  DONE: 'postUpload:done',
  ERROR: 'postUpload:error',
} as const;
