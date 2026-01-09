// src/screens/chat/hooks/useChatUIState.ts
import { useState, useCallback, useRef } from 'react';
import type { FlatList } from 'react-native';
import type { RenderItem } from '@/utils/chat/useChatMessages';

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
  const [text, setText] = useState('');

  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);

  const handleReply = useCallback((info: ReplyInfo) => {
    setReplyTo(info);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const [newMsgCount, setNewMsgCount] = useState(0);
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);

  const [atBottom, setAtBottom] = useState(true);

  const listRef = useRef<FlatList<RenderItem> | null>(null);

  const scrollToBottom = useCallback(() => {
    try {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    } catch {}

    setAtBottom(true);
    setNewMsgCount(0);
    setShowNewMsgPill(false);
  }, []);

  const handleScrolledToBottom = useCallback(() => {
    setAtBottom(true);
    setNewMsgCount(0);
    setShowNewMsgPill(false);
  }, []);

  const markScrolledAway = useCallback(() => {
    setAtBottom(false);
  }, []);

  const handleIncomingMessage = useCallback(() => {
    if (atBottom) return;
    setNewMsgCount((prev) => prev + 1);
    setShowNewMsgPill(true);
  }, [atBottom]);

  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  const [autoTranslate, setAutoTranslate] = useState(false);
  const toggleAutoTranslate = useCallback(() => {
    setAutoTranslate((prev) => !prev);
  }, []);

  const [translationTier, setTranslationTier] = useState<TranslationTier>('free');
  const [translationTone, setTranslationTone] = useState<TranslationTone>('neutral');

  return {
    text,
    setText,

    replyTo,
    handleReply,
    cancelReply,

    newMsgCount,
    showNewMsgPill,
    handleIncomingMessage,

    atBottom,
    scrollToBottom,
    handleScrolledToBottom,
    markScrolledAway,

    listRef,

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
