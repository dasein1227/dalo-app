// src/screens/chat/components/InputBar/InputBar.tsx
import React, { useCallback, useMemo, useRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, Send as SendIcon } from 'lucide-react-native';

import InputReplyPreview from './InputReplyPreview';
import InputAttachmentButtons from './InputAttachmentButtons'; // ✅ 1. 최적화된 버튼 컴포넌트 임포트
import type { ReplyInfo, TranslationTier, TranslationTone } from '../../hooks/useChatUIState';
import type { ChatTheme } from '../../theme/chatTheme';

export type InputBarHandle = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

type Props = {
  theme: ChatTheme;
  attachmentsOpen: boolean;
  onPressAttachmentsToggle: () => void;
  onFocusInput: () => void;
  replyTo: ReplyInfo | null;
  cancelReply: () => void;
  sendMessage: (opts: {
    content: string;
    original?: string | null;
    kind?: string;
    replyTo?: ReplyInfo | null;
  }) => Promise<void>;
  openVoice: () => void;
  keyboardVisible?: boolean;
  onBarHeightChange?: (height: number) => void;
  autoTranslate: boolean;
  setAutoTranslate: (v: boolean) => void;
  translationTier: TranslationTier;
  translationTone: TranslationTone;
  showTranslatedOnly?: boolean;
};

const InputBar = React.forwardRef<InputBarHandle, Props>(function InputBarInner(
  {
    theme,
    attachmentsOpen,
    onPressAttachmentsToggle,
    onFocusInput,
    replyTo,
    cancelReply,
    sendMessage,
    openVoice,
    keyboardVisible = false,
    onBarHeightChange,
  }: Props,
  ref
) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const lastReportedHeightRef = useRef(0);
  
  // 🔥 타이핑 렉 방지용 내부 상태 격리 (매우 훌륭한 패턴입니다)
  const [text, setText] = useState('');

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => setText(''),
    }),
    []
  );

  const bottomInset = Math.max(insets.bottom, 0);
  const rootPadBottom = keyboardVisible ? 0 : bottomInset;

  const showSend = useMemo(() => text.trim().length > 0, [text]);

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const messageContent = trimmed;
    const messageReplyTo = replyTo;

    setText('');
    cancelReply();

    try {
      await sendMessage({
        content: messageContent,
        original: null,
        kind: 'text',
        replyTo: messageReplyTo,
      });
    } catch (e) {
      console.error('Message send failed', e);
    }
  }, [text, replyTo, sendMessage, cancelReply]);

  const onSubmitEditing = useCallback(() => {
    if (!showSend) return;
    onSend();
  }, [showSend, onSend]);

  const handlePressVoice = useCallback(() => {
    Keyboard.dismiss();
    openVoice();
  }, [openVoice]);

  // ✅ 다크모드 대응 동적 색상 처리
  const inputBorderColor = theme.opponentBubble; 
  const placeholderColor = theme.accessoryIcon || 'rgba(150,150,150,0.8)'; // 테마 기반 플레이스홀더

  const handleRootLayout = useCallback(
    (e: any) => {
      const next = Math.max(0, Math.round(Number(e?.nativeEvent?.layout?.height ?? 0)));
      if (Math.abs(lastReportedHeightRef.current - next) < 1) return;
      lastReportedHeightRef.current = next;
      onBarHeightChange?.(next);
    },
    [onBarHeightChange],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: theme.inputBg, paddingBottom: rootPadBottom }]}
      onLayout={handleRootLayout}
    >
      
      {/* ✅ 최적화된 답장 프리뷰 연계 */}
      <View style={{ paddingHorizontal: 10, paddingTop: replyTo ? 4 : 0 }}>
        <InputReplyPreview
          replyTo={
            replyTo
              ? ({
                  ...(replyTo as any),
                  content:
                    (replyTo as any)?.__replyVisibleText ??
                    (replyTo as any)?.replyVisibleText ??
                    (replyTo as any)?.visibleText ??
                    (replyTo as any)?.__replyDisplayText ??
                    (replyTo as any)?.displayText ??
                    (replyTo as any)?.selectedText ??
                    (replyTo as any)?.previewText ??
                    (replyTo as any)?.content ??
                    '',
                } as any)
              : null
          }
          onCancel={cancelReply}
          theme={theme}
        />
      </View>

      <View
        pointerEvents={attachmentsOpen ? 'none' : 'auto'}
        style={[
          styles.row,
          { backgroundColor: theme.inputBg },
          attachmentsOpen && { opacity: 0 },
        ]}
      >
        {/* ✅ 2. 앞서 만든 상용화급 버튼 컴포넌트로 완벽 교체 적용 */}
        <InputAttachmentButtons 
          onToggleMenu={onPressAttachmentsToggle} 
          isOpen={attachmentsOpen} 
          theme={theme} 
        />

        {/* ✅ 3. 하드코딩 제거된 텍스트 인풋 폼 */}
        <View style={[styles.pill, { backgroundColor: theme.inputFieldBg, borderColor: inputBorderColor }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.opponentText }]}
            value={text}
            onChangeText={setText}
            placeholder={t('chat:input.placeholderLong')}
            placeholderTextColor={placeholderColor}
            multiline
            returnKeyType="send"
            onFocus={onFocusInput}
            onSubmitEditing={onSubmitEditing}
            maxFontSizeMultiplier={1.5} // ✅ 글자 크기 폭주 방지 (상용앱 필수)
            accessibilityLabel={t('chat:accessibility.messageInput')}
          />
        </View>

        {showSend ? (
          <Pressable 
            style={[styles.btn, { backgroundColor: theme.sendButtonActive }]} 
            onPress={onSend}
            hitSlop={15} // ✅ 터치 영역 확보
            accessibilityRole="button"
            accessibilityLabel={t('chat:accessibility.sendMessage')}
          >
            <SendIcon size={18} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable 
            style={[styles.btn, { backgroundColor: theme.voiceButton }]} 
            onPress={handlePressVoice}
            hitSlop={15} // ✅ 터치 영역 확보
            accessibilityRole="button"
            accessibilityLabel={t('chat:accessibility.voiceMessage')}
          >
            <Mic size={18} color="#ffffff" strokeWidth={2.6} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default React.memo(InputBar);

const styles = StyleSheet.create({
  root: { position: 'relative' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  pill: {
    flex: 1,
    borderWidth: 1, // 동적 테두리 색상으로 처리됨
    borderRadius: 20,
    paddingLeft: 14, // 좌측 여백 약간 넓힘 (타이핑 시 숨통 트이게)
    paddingRight: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  input: {
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontSize: 16,
  },
});