// src/screens/chat/hooks/useChatUIState.ts
import { useState, useCallback } from 'react';

export type ReplyInfo = {
  id: string;
  sender: string;

  senderName?: string | null;
  kind?: string | null;
  original?: string | null;
  thumbUri?: string | null;

  content: string;
};

export type TranslationTier = 'free' | 'mid' | 'high';

export type TranslationTone =
  | 'business'
  | 'polite'
  | 'casual'
  | 'neutral'
  | 'creative';

export function useChatUIState() {
  // ✅ [성능 최적화 완료]
  // 1. text 상태는 InputBar.tsx 내부로 완전히 격리되어 삭제되었습니다.
  // 2. 스크롤 및 새 메시지 로직은 useChatScroll.ts로 완벽히 위임되어 삭제되었습니다.

  // 1. 답장(Reply) 상태 관리
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);

  const handleReply = useCallback((info: ReplyInfo) => {
    setReplyTo(info);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  // 2. 모달(Modal) 팝업 상태 관리
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  // 3. 번역(Translation) 설정 상태 관리
  const [autoTranslate, setAutoTranslate] = useState(false);
  const toggleAutoTranslate = useCallback(() => {
    setAutoTranslate((prev) => !prev);
  }, []);

  const [translationTier, setTranslationTier] = useState<TranslationTier>('free');
  const [translationTone, setTranslationTone] = useState<TranslationTone>('neutral');

  return {
    replyTo,
    handleReply,
    cancelReply,

    mediaModalVisible,
    setMediaModalVisible,
    voiceModalVisible,
    setVoiceModalVisible,

    autoTranslate,
    setAutoTranslate,
    toggleAutoTranslate,
    translationTier,
    setTranslationTier,
    translationTone,
    setTranslationTone,
  };
}