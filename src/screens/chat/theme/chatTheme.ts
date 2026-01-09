// src/screens/chat/theme/chatTheme.ts
import { Platform, type ViewStyle } from 'react-native';

export type ChatRoomType =
  | 'self' // 나에게 (Sage)
  | 'dm' // 1:1 대화 (Blue)
  | 'group' // 그룹 (Teal)
  | 'business_dm' // DM / 상담 (Navy)
  | 'open' // 오픈 (Terracotta)
  | 'beacon'; // 비콘 (Violet)

export type BubbleShadowTheme = {
  color: string; // shadowColor
  offsetY: number; // Y
  blur: number; // Blur(=shadowRadius)
  opacity: number; // shadowOpacity
  elevation: number; // Android elevation (근사)
};

export type ChatTheme = {
  // screen surfaces
  background: string; // 채팅방 배경
  headerBg: string; // 헤더 배경
  headerText: string; // 헤더 텍스트/아이콘
  inputBg: string; // 입력바 배경
  inputFieldBg: string; // 입력필드 박스 배경

  // bubbles
  opponentBubble: string; // 상대 말풍선
  opponentText: string; // 상대 글자색

  myBubble: string; // 나의 말풍선
  myText: string; // 나의 글자색

  // separators / misc
  dateTimeLine: string; // 날짜/시간/상태

  // ✅ 테마별 “라인 하이라이트” (검색 하이라이트/구분선 강조 등)
  highlightLine: string;

  // reply preview & original text
  replyPreviewBg: string; // 리플창 배경
  replyAccentLine: string; // 리플 강조선
  originalText: string; // 원문 텍스트

  // input / actions
  accessoryIcon: string; // 부가 기능 아이콘
  voiceButton: string; // 음성 버튼(기본)
  sendButtonActive: string; // 전송 버튼(활성)

  // 헤더 번역 버튼 ON 컬러
  translateOn: string;

  // ✅ 버블 그림자(방 타입별)
  bubbleShadow: BubbleShadowTheme;
};

/**
 * ✅ TranslatePopover(번역 모달) 표 기반 테마
 */
export type TranslateModalTheme = {
  modalBg: string; // 모달 배경
  baseText: string; // 기본 글자

  translateOffBg: string; // 번역 OFF (비활성) 배경
  translateOnBg: string; // 번역 ON (활성) 배경
  translateOffText: string; // 번역 OFF 텍스트
  translateOnText: string; // 번역 ON 텍스트

  highlightBg: string; // 활성 하이라이트
  activeText: string; // 활성 글자
  radio: string; // 라디오 버튼
  upgradeBtn: string; // 업그레이드 버튼
  closeBtn: string; // 닫기 버튼(배경)
};

/**
 * ✅ VoiceRecorderModal(음성 모달) 표 기반 테마
 */
export type VoiceRecorderModalTheme = {
  modalBg: string;
  baseText: string;
  waveHighlight: string; // Red 고정
  playbackText: string;
  centerButton: string; // Red 고정
  cancelText: string;
  sendActive: string;
};

/**
 * ✅ 그림자 스타일을 RN(ViewStyle)로 변환
 * - iOS: shadow* 사용
 * - Android: elevation(+shadowColor 보조) 사용
 */
export function getBubbleShadowStyle(theme: ChatTheme): ViewStyle {
  const s = theme.bubbleShadow;

  if (Platform.OS === 'ios') {
    return {
      shadowColor: s.color,
      shadowOffset: { width: 0, height: s.offsetY },
      shadowOpacity: s.opacity,
      shadowRadius: s.blur,
    };
  }

  // Android: elevation 기반(색상은 OS/버전에 따라 무시될 수 있으나 넣어둠)
  return {
    elevation: s.elevation,
    shadowColor: s.color,
  };
}

export const CHAT_THEMES: Record<ChatRoomType, ChatTheme> = {
  /**
   * 1. 나에게 (Sage)
   */
  self: {
    background: '#F7F8F3',
    headerBg: '#EEF1EA',
    headerText: '#3A4D39',
    inputBg: '#EEF1EA',
    inputFieldBg: '#FFFFFF',

    opponentBubble: '#FFFFFF',
    opponentText: '#505B4D',

    myBubble: '#DCE6D5',
    myText: '#3A4D39',

    dateTimeLine: '#99A899',

    highlightLine: 'rgba(253,242,179,0.6)',

    replyPreviewBg: '#E4E9E0',
    replyAccentLine: '#4A6B47',
    originalText: '#505B4D',

    accessoryIcon: '#B0B3B8',
    voiceButton: '#B0B3B8',
    sendButtonActive: '#3A5A35',

    translateOn: '#4A6B47',

    // ✅ Sage shadow: #1E2F1A / Y:2 Blur:8 Opacity:0.06
    bubbleShadow: { color: '#1E2F1A', offsetY: 2, blur: 8, opacity: 0.06, elevation: 3 },
  },

  /**
   * 2. 1:1 대화 (Blue)
   */
  dm: {
    background: '#F0F2F5',
    headerBg: '#FFFFFF',
    headerText: '#2D3436',
    inputBg: '#FFFFFF',
    inputFieldBg: '#F0F2F5',

    opponentBubble: '#FFFFFF',
    opponentText: '#1A1A1A',

    myBubble: '#5D78FF',
    myText: '#FFFFFF',

    dateTimeLine: '#A4AAB3',

    highlightLine: 'rgba(255,236,179,0.5)',

    replyPreviewBg: '#E8EAED',
    replyAccentLine: '#5D78FF',
    originalText: '#1A1A1A',

    accessoryIcon: '#B0B3B8',
    voiceButton: '#B0B3B8',
    sendButtonActive: '#5D78FF',

    translateOn: '#0055FF',

    // ✅ Blue shadow: #0A1931 / Y:3 Blur:10 Opacity:0.08
    bubbleShadow: { color: '#0A1931', offsetY: 3, blur: 10, opacity: 0.03, elevation: 4 },
  },

  /**
   * 3. 그룹 (Teal)
   */
  group: {
    background: '#F1F2F6',
    headerBg: '#EBEDF0',
    headerText: '#2F3542',
    inputBg: '#EBEDF0',
    inputFieldBg: '#FFFFFF',

    opponentBubble: '#FFFFFF',
    opponentText: '#2F3542',

    myBubble: '#A2B9B2',
    myText: '#FFFFFF',

    dateTimeLine: '#A8ADB3',

    highlightLine: 'rgba(255,224,178,0.5)',

    replyPreviewBg: '#E1E4E8',
    replyAccentLine: '#5A8F84',
    originalText: '#2F3542',

    accessoryIcon: '#A0A3A8',
    voiceButton: '#A0A3A8',
    sendButtonActive: '#5A8F84',

    translateOn: '#2F3542',

    // ✅ Group shadow: #112D2A / Y:2 Blur:8 Opacity:0.07
    bubbleShadow: { color: '#112D2A', offsetY: 2, blur: 8, opacity: 0.07, elevation: 3 },
  },

  /**
   * 4. DM / 상담 (Navy)
   */
  business_dm: {
    background: '#FFFFFF',
    headerBg: '#F8F9FA',
    headerText: '#1E272E',
    inputBg: '#FFFFFF',
    inputFieldBg: '#F8F9FA',

    opponentBubble: '#F1F2F6',
    opponentText: '#1E272E',

    myBubble: '#2C3E50',
    myText: '#FFFFFF',

    dateTimeLine: '#C0C8D0',

    highlightLine: 'rgba(255,241,118,0.4)',

    replyPreviewBg: '#F1F3F4',
    replyAccentLine: '#2C3E50',
    originalText: '#1E272E',

    accessoryIcon: '#CFD4DA',
    voiceButton: '#CFD4DA',
    sendButtonActive: '#2C3E50',

    translateOn: '#3498DB',

    // ✅ DM(Navy) shadow: #000000 / Y:4 Blur:12 Opacity:0.2
    bubbleShadow: { color: '#000000', offsetY: 4, blur: 12, opacity: 0.2, elevation: 6 },
  },

  /**
   * 5. 오픈 (Terracotta)
   */
  open: {
    background: '#FAF7F2',
    headerBg: '#F5F1E8',
    headerText: '#4A3F35',
    inputBg: '#F5F1E8',
    inputFieldBg: '#FFFFFF',

    opponentBubble: '#FFFFFF',
    opponentText: '#4A3F35',

    myBubble: '#D38E5F',
    myText: '#FFFFFF',

    dateTimeLine: '#B8AEA4',

    highlightLine: 'rgba(255,249,196,0.6)',

    replyPreviewBg: '#EFE9DC',
    replyAccentLine: '#D38E5F',
    originalText: '#4A3F35',

    accessoryIcon: '#CBB7A8',
    voiceButton: '#CBB7A8',
    sendButtonActive: '#D38E5F',

    translateOn: '#B35D2D',

    // ✅ Open shadow: #3E1A1A / Y:2 Blur:9 Opacity:0.1
    bubbleShadow: { color: '#3E1A1A', offsetY: 2, blur: 9, opacity: 0.1, elevation: 4 },
  },

  /**
   * 6. 비콘 (Violet)
   */
  beacon: {
    background: '#EAEAF2',
    headerBg: '#E0E0E8',
    headerText: '#4A4A6A',
    inputBg: '#E0E0E8',
    inputFieldBg: '#FFFFFF',

    opponentBubble: '#FFFFFF',
    opponentText: '#2D2D2D',

    myBubble: '#6C5CE7',
    myText: '#FFFFFF',

    dateTimeLine: '#9E9EB3',

    highlightLine: 'rgba(225,255,177,0.5)',

    replyPreviewBg: '#D6D6E0',
    replyAccentLine: '#6C5CE7',
    originalText: '#2D2D2D',

    accessoryIcon: '#A8A8BC',
    voiceButton: '#A8A8BC',
    sendButtonActive: '#6C5CE7',

    translateOn: '#F72585',

    // ✅ Beacon shadow: #241A3E / Y:4 Blur:14 Opacity:0.12
    bubbleShadow: { color: '#241A3E', offsetY: 4, blur: 14, opacity: 0.12, elevation: 7 },
  },
};

/**
 * ✅ 번역 모달 테마 (기존 그대로)
 */
export const TRANSLATE_MODAL_THEMES: Record<ChatRoomType, TranslateModalTheme> = {
  self: {
    modalBg: '#F7F8F3',
    baseText: '#3A4D39',

    translateOffBg: '#B0B3B8',
    translateOnBg: '#4A6B47',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#EEF1EA',
    activeText: '#3A5A35',
    radio: '#4A6B47',
    upgradeBtn: '#FF8C00',
    closeBtn: '#1B3318',
  },
  dm: {
    modalBg: '#FFFFFF',
    baseText: '#1A1A1A',

    translateOffBg: '#B0B3B8',
    translateOnBg: '#5D78FF',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#E8EFFF',
    activeText: '#0055FF',
    radio: '#5D78FF',
    upgradeBtn: '#FF8C00',
    closeBtn: '#1A1A1A',
  },
  group: {
    modalBg: '#F1F2F6',
    baseText: '#2F3542',

    translateOffBg: '#A0A3A8',
    translateOnBg: '#5A8F84',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#E1EAE8',
    activeText: '#3D7A6E',
    radio: '#5A8F84',
    upgradeBtn: '#FF8C00',
    closeBtn: '#1F4F46',
  },
  business_dm: {
    modalBg: '#FFFFFF',
    baseText: '#1E272E',

    translateOffBg: '#CFD4DA',
    translateOnBg: '#2C3E50',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#F1F2F6',
    activeText: '#2C3E50',
    radio: '#2C3E50',
    upgradeBtn: '#FF8C00',
    closeBtn: '#0E1419',
  },
  open: {
    modalBg: '#FAF7F2',
    baseText: '#4A3F35',

    translateOffBg: '#CBB7A8',
    translateOnBg: '#D38E5F',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#F9F1EB',
    activeText: '#C36A2D',
    radio: '#D38E5F',
    upgradeBtn: '#FF8C00',
    closeBtn: '#8F4A1F',
  },
  beacon: {
    modalBg: '#EAEAF2',
    baseText: '#2D2D2D',

    translateOffBg: '#A8A8BC',
    translateOnBg: '#6C5CE7',
    translateOffText: '#111827',
    translateOnText: '#FFFFFF',

    highlightBg: '#F0EFFF',
    activeText: '#5241D1',
    radio: '#6C5CE7',
    upgradeBtn: '#FF8C00',
    closeBtn: '#3B2BB3',
  },
};

/**
 * ✅ 음성 모달 테마 (기존 그대로)
 */
export const VOICE_RECORDER_MODAL_THEMES: Record<ChatRoomType, VoiceRecorderModalTheme> = {
  self: {
    modalBg: '#FFFFFF',
    baseText: '#3A4D39',
    waveHighlight: '#FF3B30',
    playbackText: '#4A6B47',
    centerButton: '#FF3B30',
    cancelText: '#6A7369',
    sendActive: '#3A5A35',
  },
  dm: {
    modalBg: '#FFFFFF',
    baseText: '#1A1A1A',
    waveHighlight: '#FF3B30',
    playbackText: '#5D78FF',
    centerButton: '#FF3B30',
    cancelText: '#5F6368',
    sendActive: '#0044CC',
  },
  group: {
    modalBg: '#FFFFFF',
    baseText: '#2F3542',
    waveHighlight: '#FF3B30',
    playbackText: '#5A8F84',
    centerButton: '#FF3B30',
    cancelText: '#5A6169',
    sendActive: '#326B60',
  },
  business_dm: {
    modalBg: '#F8F9FA',
    baseText: '#1E272E',
    waveHighlight: '#FF3B30',
    playbackText: '#2C3E50',
    centerButton: '#FF3B30',
    cancelText: '#4A5560',
    sendActive: '#1A2530',
  },
  open: {
    modalBg: '#FAF7F2',
    baseText: '#4A3F35',
    waveHighlight: '#FF3B30',
    playbackText: '#D38E5F',
    centerButton: '#FF3B30',
    cancelText: '#7A6F65',
    sendActive: '#B35D2D',
  },
  beacon: {
    modalBg: '#FFFFFF',
    baseText: '#2D2D2D',
    waveHighlight: '#FF3B30',
    playbackText: '#6C5CE7',
    centerButton: '#FF3B30',
    cancelText: '#66667A',
    sendActive: '#5241D1',
  },
};

/**
 * room 객체의 실제 타입값을 ChatRoomType으로 해석
 */
export function resolveRoomType(room: any): ChatRoomType {
  const t = (room?.type ?? room?.room_type ?? room?.kind ?? room?.category ?? '').toString();

  if (t === 'self' || t === 'me' || t === 'note') return 'self';
  if (t === 'dm' || t === 'direct' || t === '1:1' || t === 'one_to_one' || t === 'personal') return 'dm';
  if (t === 'group' || t === 'room' || t === 'multi') return 'group';
  if (t === 'business' || t === 'business_dm' || t === 'consult' || t === 'counsel') return 'business_dm';
  if (t === 'open' || t === 'public') return 'open';
  if (t === 'beacon' || t === 'nearby') return 'beacon';

  return 'dm';
}

/**
 * ✅ 핵심: string(roomType)도 무조건 정규화해서 ChatRoomType으로 변환
 */
function normalizeRoomType(roomOrType: any): ChatRoomType {
  if (typeof roomOrType === 'string') {
    if (roomOrType in CHAT_THEMES) return roomOrType as ChatRoomType;
    return resolveRoomType({ type: roomOrType });
  }
  return resolveRoomType(roomOrType);
}

export function getChatTheme(room: any): ChatTheme {
  const rt = normalizeRoomType(room);
  return CHAT_THEMES[rt] ?? CHAT_THEMES.dm;
}

export function getTranslateModalTheme(roomOrType: any): TranslateModalTheme {
  const rt = normalizeRoomType(roomOrType);
  return TRANSLATE_MODAL_THEMES[rt] ?? TRANSLATE_MODAL_THEMES.dm;
}

export function getVoiceRecorderModalTheme(roomOrType: any): VoiceRecorderModalTheme {
  const rt = normalizeRoomType(roomOrType);
  return VOICE_RECORDER_MODAL_THEMES[rt] ?? VOICE_RECORDER_MODAL_THEMES.dm;
}

export function getReadableOnColor(bgHex: string): '#FFFFFF' | '#0F172A' {
  const h = bgHex.replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.72 ? '#0F172A' : '#FFFFFF';
}
