// src/screens/chat/theme/chatTheme.ts
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

export type ChatRoomType =
  | 'self'
  | 'dm'
  | 'group'
  | 'business_dm'
  | 'open'
  | 'beacon'
  | 'coonn_light'
  | 'coonn_dark';

export type BubbleShadowTheme = {
  color: string;
  offsetY: number;
  blur: number;
  opacity: number;
  elevation: number;
};

export type BubbleHairlineTheme = {
  width: number;
  myColor: string;
  opponentColor: string;
};

export type ChatTheme = {
  // screen surfaces
  background: string;
  headerBg: string;
  headerText: string;
  inputBg: string;
  inputFieldBg: string;

  // bubbles
  opponentBubble: string;
  opponentText: string;

  myBubble: string;
  myText: string;

  // separators / misc
  dateTimeLine: string;

  // highlight
  highlightLine: string;
  searchMatchBg: string;

  // reply preview & original text
  replyPreviewBg: string;
  replyAccentLine: string;
  originalText: string;

  // input / actions
  accessoryIcon: string;
  voiceButton: string;
  sendButtonActive: string;

  // translate
  translateOn: string;

  // bubble shadow / outline
  bubbleShadow: BubbleShadowTheme;
  bubbleHairline: BubbleHairlineTheme;

  pickerAccent: string;
  selectionCheckBg: string;
  actionPressedBg: string;

  tintColor: string;
  text: string;
};

export type TranslateModalTheme = {
  modalBg: string;
  cardBorder: string;
  overlay: string;
  dragBar: string;

  baseText: string;
  subText: string;
  mutedText: string;

  translateOffBg: string;
  translateOffBorder: string;
  translateOnBg: string;
  translateOffText: string;
  translateOnText: string;

  highlightBg: string;
  sectionBorder: string;
  rowPressedBg: string;

  activeText: string;
  radio: string;
  upgradeBtn: string;
  closeBtn: string;
  closeText: string;
};

export type VoiceRecorderModalTheme = {
  modalBg: string;
  baseText: string;
  waveHighlight: string;
  playbackText: string;
  centerButton: string;
  cancelText: string;
  sendActive: string;
};

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
  return {
    elevation: s.elevation,
    shadowColor: s.color,
  };
}


export function getBubbleHairlineStyle(theme: ChatTheme, isMe: boolean): ViewStyle {
  const h = theme.bubbleHairline;
  const color = isMe ? h.myColor : h.opponentColor;
  if (!color || color === 'transparent' || h.width <= 0) {
    return {
      borderWidth: 0,
      borderColor: 'transparent',
    };
  }

  return {
    borderWidth: h.width,
    borderColor: color,
  };
}

export const CHAT_THEMES: Record<ChatRoomType, ChatTheme> = {
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
    highlightLine: 'rgba(74,107,71,0.115)',
    searchMatchBg: 'rgba(74,107,71,0.18)',

    replyPreviewBg: '#E4E9E0',
    replyAccentLine: '#4A6B47',
    originalText: '#505B4D',

    accessoryIcon: '#B0B3B8',
    voiceButton: '#B0B3B8',
    sendButtonActive: '#3A5A35',

    translateOn: '#4A6B47',
    bubbleShadow: { color: '#1E2F1A', offsetY: 1, blur: 4, opacity: 0.045, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(58,77,57,0.075)' },

    pickerAccent: '#2F4F2F', 
    selectionCheckBg: '#4A6B47',
    actionPressedBg: 'rgba(74, 107, 71, 0.12)',

    tintColor: '#4A6B47', 
    text: '#3A4D39',
  },

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
    highlightLine: 'rgba(93,120,255,0.12)',
    searchMatchBg: 'rgba(93,120,255,0.20)',

    replyPreviewBg: '#E8EAED',
    replyAccentLine: '#5D78FF',
    originalText: '#1A1A1A',

    accessoryIcon: '#B0B3B8',
    voiceButton: '#B0B3B8',
    sendButtonActive: '#5D78FF',

    translateOn: '#0055FF',
    bubbleShadow: { color: '#0A1931', offsetY: 1, blur: 4, opacity: 0.045, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(0,0,0,0.065)' },

    pickerAccent: '#0055FF', 
    selectionCheckBg: '#5D78FF',
    actionPressedBg: 'rgba(93, 120, 255, 0.10)',

    tintColor: '#5D78FF',
    text: '#1A1A1A',
  },

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
    highlightLine: 'rgba(90,143,132,0.12)',
    searchMatchBg: 'rgba(90,143,132,0.19)',

    replyPreviewBg: '#E1E4E8',
    replyAccentLine: '#5A8F84',
    originalText: '#2F3542',

    accessoryIcon: '#A0A3A8',
    voiceButton: '#A0A3A8',
    sendButtonActive: '#5A8F84',

    translateOn: '#2F3542',
    bubbleShadow: { color: '#112D2A', offsetY: 1, blur: 4, opacity: 0.05, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(47,53,66,0.07)' },

    pickerAccent: '#00695C', 
    selectionCheckBg: '#5A8F84',
    actionPressedBg: 'rgba(90, 143, 132, 0.12)',

    tintColor: '#5A8F84',
    text: '#2F3542',
  },

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
    highlightLine: 'rgba(44,62,80,0.09)',
    searchMatchBg: 'rgba(44,62,80,0.16)',

    replyPreviewBg: '#F1F3F4',
    replyAccentLine: '#2C3E50',
    originalText: '#1E272E',

    accessoryIcon: '#CFD4DA',
    voiceButton: '#CFD4DA',
    sendButtonActive: '#2C3E50',

    translateOn: '#3498DB',
    bubbleShadow: { color: '#000000', offsetY: 1, blur: 4, opacity: 0.05, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(30,39,46,0.065)' },

    pickerAccent: '#1A2530', 
    selectionCheckBg: '#2C3E50',
    actionPressedBg: 'rgba(44, 62, 80, 0.08)',

    tintColor: '#2C3E50',
    text: '#1E272E',
  },

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
    highlightLine: 'rgba(211,142,95,0.13)',
    searchMatchBg: 'rgba(211,142,95,0.22)',

    replyPreviewBg: '#EFE9DC',
    replyAccentLine: '#D38E5F',
    originalText: '#4A3F35',

    accessoryIcon: '#CBB7A8',
    voiceButton: '#CBB7A8',
    sendButtonActive: '#D38E5F',

    translateOn: '#B35D2D',
    bubbleShadow: { color: '#3E1A1A', offsetY: 1, blur: 4, opacity: 0.05, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(74,63,53,0.075)' },

    pickerAccent: '#A04000', 
    selectionCheckBg: '#D38E5F',
    actionPressedBg: 'rgba(211, 142, 95, 0.12)',

    tintColor: '#D38E5F',
    text: '#4A3F35',
  },

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
    highlightLine: 'rgba(108,92,231,0.11)',
    searchMatchBg: 'rgba(108,92,231,0.19)',

    replyPreviewBg: '#D6D6E0',
    replyAccentLine: '#6C5CE7',
    originalText: '#2D2D2D',

    accessoryIcon: '#A8A8BC',
    voiceButton: '#A8A8BC',
    sendButtonActive: '#6C5CE7',

    translateOn: '#F72585',
    bubbleShadow: { color: '#241A3E', offsetY: 1, blur: 4, opacity: 0.055, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(45,45,45,0.07)' },

    pickerAccent: '#5E35B1', 
    selectionCheckBg: '#6C5CE7',
    actionPressedBg: 'rgba(108, 92, 231, 0.10)',

    tintColor: '#6C5CE7',
    text: '#2D2D2D',
  },

  coonn_light: {
    background: '#F8F9FA',
    headerBg: '#FFFFFF',
    headerText: '#121212',
    inputBg: '#FFFFFF',
    inputFieldBg: '#F1F3F5',

    opponentBubble: '#FFFFFF',
    opponentText: '#1A1A1A',

    myBubble: '#0A0A0A',
    myText: '#FFFFFF',

    dateTimeLine: '#ADB5BD',
    highlightLine: 'rgba(10,10,10,0.07)',
    searchMatchBg: 'rgba(10,10,10,0.11)',

    replyPreviewBg: '#F1F3F5',
    replyAccentLine: '#0A0A0A',
    originalText: '#1A1A1A',

    accessoryIcon: '#868E96',
    voiceButton: '#868E96',
    sendButtonActive: '#0A0A0A',

    translateOn: '#495057',
    bubbleShadow: { color: '#000000', offsetY: 1, blur: 4, opacity: 0.045, elevation: 1 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(0,0,0,0.07)' },

    pickerAccent: '#121212', 
    selectionCheckBg: '#0A0A0A',
    actionPressedBg: 'rgba(10, 10, 10, 0.05)',

    tintColor: '#0A0A0A',
    text: '#121212',
  },

  coonn_dark: {
    background: '#000000',
    headerBg: '#0A0A0A',
    headerText: '#F8F9FA',
    inputBg: '#0A0A0A',
    inputFieldBg: '#1A1A1A',

    opponentBubble: '#1C1C1E',
    opponentText: '#EBEBF5',

    myBubble: '#F2F2F7',
    myText: '#000000',

    dateTimeLine: '#636366',
    highlightLine: 'rgba(242,242,247,0.12)',
    searchMatchBg: 'rgba(242,242,247,0.18)',

    replyPreviewBg: '#2C2C2E',
    replyAccentLine: '#F2F2F7',
    originalText: '#EBEBF5',

    accessoryIcon: '#8E8E93',
    voiceButton: '#8E8E93',
    sendButtonActive: '#F2F2F7',

    translateOn: '#AEAEB2',
    bubbleShadow: { color: '#000000', offsetY: 1, blur: 5, opacity: 0.16, elevation: 0 },
    bubbleHairline: { width: StyleSheet.hairlineWidth, myColor: 'transparent', opponentColor: 'rgba(255,255,255,0.12)' },

    pickerAccent: '#FFFFFF', 
    selectionCheckBg: '#F2F2F7',
    actionPressedBg: 'rgba(242, 242, 247, 0.1)',

    tintColor: '#F2F2F7',
    text: '#F8F9FA',
  },
};

export const TRANSLATE_MODAL_THEMES: Record<ChatRoomType, TranslateModalTheme> = {
  self: {
    modalBg: '#F7F8F3',
    cardBorder: 'rgba(58,77,57,0.12)',
    overlay: 'rgba(15,23,42,0.48)',
    dragBar: '#AAB6A5',
    baseText: '#31422F',
    subText: '#4F614D',
    mutedText: '#6A7666',
    translateOffBg: '#D8DED2',
    translateOffBorder: '#AAB6A5',
    translateOnBg: '#4A6B47',
    translateOffText: '#243224',
    translateOnText: '#FFFFFF',
    highlightBg: '#EEF1EA',
    sectionBorder: 'rgba(74,107,71,0.14)',
    rowPressedBg: 'rgba(74,107,71,0.08)',
    activeText: '#2E4A2C',
    radio: '#4A6B47',
    upgradeBtn: '#C96A00',
    closeBtn: '#1B3318',
    closeText: '#FFFFFF',
  },
  dm: {
    modalBg: '#FFFFFF',
    cardBorder: 'rgba(17,24,39,0.08)',
    overlay: 'rgba(15,23,42,0.48)',
    dragBar: '#C5CFEC',
    baseText: '#111827',
    subText: '#475467',
    mutedText: '#667085',
    translateOffBg: '#E5EAF5',
    translateOffBorder: '#C7D2FE',
    translateOnBg: '#5D78FF',
    translateOffText: '#243147',
    translateOnText: '#FFFFFF',
    highlightBg: '#EEF3FF',
    sectionBorder: 'rgba(93,120,255,0.14)',
    rowPressedBg: 'rgba(93,120,255,0.08)',
    activeText: '#244BDB',
    radio: '#5D78FF',
    upgradeBtn: '#C96A00',
    closeBtn: '#111827',
    closeText: '#FFFFFF',
  },
  group: {
    modalBg: '#F1F2F6',
    cardBorder: 'rgba(47,53,66,0.09)',
    overlay: 'rgba(15,23,42,0.48)',
    dragBar: '#B9C7C2',
    baseText: '#2F3542',
    subText: '#4E5968',
    mutedText: '#697586',
    translateOffBg: '#DCE5E2',
    translateOffBorder: '#BCD0CB',
    translateOnBg: '#5A8F84',
    translateOffText: '#20332F',
    translateOnText: '#FFFFFF',
    highlightBg: '#E6EFED',
    sectionBorder: 'rgba(90,143,132,0.14)',
    rowPressedBg: 'rgba(90,143,132,0.08)',
    activeText: '#3D7A6E',
    radio: '#5A8F84',
    upgradeBtn: '#C96A00',
    closeBtn: '#1F4F46',
    closeText: '#FFFFFF',
  },
  business_dm: {
    modalBg: '#FFFFFF',
    cardBorder: 'rgba(30,39,46,0.08)',
    overlay: 'rgba(15,23,42,0.52)',
    dragBar: '#CBD5DF',
    baseText: '#18222B',
    subText: '#475467',
    mutedText: '#667085',
    translateOffBg: '#E8EDF2',
    translateOffBorder: '#CCD6E0',
    translateOnBg: '#2C3E50',
    translateOffText: '#22313F',
    translateOnText: '#FFFFFF',
    highlightBg: '#F3F6F8',
    sectionBorder: 'rgba(44,62,80,0.12)',
    rowPressedBg: 'rgba(44,62,80,0.07)',
    activeText: '#213548',
    radio: '#2C3E50',
    upgradeBtn: '#C96A00',
    closeBtn: '#0E1419',
    closeText: '#FFFFFF',
  },
  open: {
    modalBg: '#FAF7F2',
    cardBorder: 'rgba(74,63,53,0.10)',
    overlay: 'rgba(15,23,42,0.48)',
    dragBar: '#D9C6B4',
    baseText: '#44372D',
    subText: '#6B5A4C',
    mutedText: '#87786B',
    translateOffBg: '#F0E3D8',
    translateOffBorder: '#DEC6B3',
    translateOnBg: '#D38E5F',
    translateOffText: '#5C3C22',
    translateOnText: '#FFFFFF',
    highlightBg: '#F9F1EB',
    sectionBorder: 'rgba(211,142,95,0.14)',
    rowPressedBg: 'rgba(211,142,95,0.08)',
    activeText: '#B9642C',
    radio: '#D38E5F',
    upgradeBtn: '#C96A00',
    closeBtn: '#8F4A1F',
    closeText: '#FFFFFF',
  },
  beacon: {
    modalBg: '#EAEAF2',
    cardBorder: 'rgba(45,45,45,0.08)',
    overlay: 'rgba(15,23,42,0.52)',
    dragBar: '#C8C5E9',
    baseText: '#25253A',
    subText: '#55556F',
    mutedText: '#6D6D88',
    translateOffBg: '#E1DFF8',
    translateOffBorder: '#CAC4F4',
    translateOnBg: '#6C5CE7',
    translateOffText: '#312E81',
    translateOnText: '#FFFFFF',
    highlightBg: '#F0EFFF',
    sectionBorder: 'rgba(108,92,231,0.14)',
    rowPressedBg: 'rgba(108,92,231,0.08)',
    activeText: '#5241D1',
    radio: '#6C5CE7',
    upgradeBtn: '#C96A00',
    closeBtn: '#3B2BB3',
    closeText: '#FFFFFF',
  },
  coonn_light: {
    modalBg: '#FFFFFF',
    cardBorder: 'rgba(0,0,0,0.08)',
    overlay: 'rgba(0,0,0,0.6)',
    dragBar: '#E9ECEF',
    baseText: '#121212',
    subText: '#495057',
    mutedText: '#868E96',
    translateOffBg: '#F8F9FA',
    translateOffBorder: '#DEE2E6',
    translateOnBg: '#0A0A0A',
    translateOffText: '#212529',
    translateOnText: '#FFFFFF',
    highlightBg: '#F1F3F5',
    sectionBorder: 'rgba(0,0,0,0.06)',
    rowPressedBg: 'rgba(0,0,0,0.03)',
    activeText: '#0A0A0A',
    radio: '#0A0A0A',
    upgradeBtn: '#C96A00',
    closeBtn: '#121212',
    closeText: '#FFFFFF',
  },
  coonn_dark: {
    modalBg: '#121212',
    cardBorder: 'rgba(255,255,255,0.1)',
    overlay: 'rgba(0,0,0,0.8)',
    dragBar: '#3A3A3C',
    baseText: '#F8F9FA',
    subText: '#AEAEB2',
    mutedText: '#636366',
    translateOffBg: '#1C1C1E',
    translateOffBorder: '#3A3A3C',
    translateOnBg: '#F2F2F7',
    translateOffText: '#EBEBF5',
    translateOnText: '#000000',
    highlightBg: '#1C1C1E',
    sectionBorder: 'rgba(255,255,255,0.08)',
    rowPressedBg: 'rgba(255,255,255,0.05)',
    activeText: '#FFFFFF',
    radio: '#F2F2F7',
    upgradeBtn: '#E67E22',
    closeBtn: '#F2F2F7',
    closeText: '#000000',
  },
};

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
  coonn_light: {
    modalBg: '#FFFFFF',
    baseText: '#121212',
    waveHighlight: '#FF3B30',
    playbackText: '#0A0A0A',
    centerButton: '#0A0A0A',
    cancelText: '#868E96',
    sendActive: '#000000',
  },
  coonn_dark: {
    modalBg: '#121212',
    baseText: '#F8F9FA',
    waveHighlight: '#FF453A',
    playbackText: '#AEAEB2',
    centerButton: '#2C2C2E',
    cancelText: '#8E8E93',
    sendActive: '#3A3A3C',
  },
};

export function resolveRoomType(room: any): ChatRoomType {
  const t = (room?.type ?? room?.room_type ?? room?.kind ?? room?.category ?? '').toString();

  if (t === 'self' || t === 'me' || t === 'note') return 'self';
  if (t === 'dm' || t === 'direct' || t === '1:1' || t === 'one_to_one' || t === 'personal') return 'dm';
  if (t === 'group' || t === 'room' || t === 'multi') return 'group';
  if (t === 'business' || t === 'business_dm' || t === 'consult' || t === 'counsel') return 'business_dm';
  if (t === 'open' || t === 'public') return 'open';
  if (t === 'beacon' || t === 'nearby') return 'beacon';
  if (t === 'coonn_light') return 'coonn_light';
  if (t === 'coonn_dark') return 'coonn_dark';

  return 'dm';
}

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

// 텍스트 대비 계산용 유틸 (검정/흰색 자동 리턴)
export function getReadableOnColor(bgHex: string): '#FFFFFF' | '#0F172A' {
  const h = bgHex.replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.72 ? '#0F172A' : '#FFFFFF';
}
