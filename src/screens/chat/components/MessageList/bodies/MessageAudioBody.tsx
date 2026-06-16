import React from 'react';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { MessageAudioBubble } from '../ui/MessageAudioBubble';
import { useAudioMessageController } from '../hooks/useAudioMessageController';
import { isMediaUri, isUrlLike } from './MessageItemBody.shared';

type Props = {
  msg: any;
  meta: any;
  originalObj: any;
  mediaUris: string[];
  displayText: any;
  msgIdStr: string;
  rawContent: any;
  rawOriginal: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  bubbleShadowStyle: any;
  replyBlockNode: React.ReactNode;
  dividerColor: string;
  openMessageActions: () => void;
};

function MessageAudioBody({
  msg,
  meta,
  originalObj,
  mediaUris,
  displayText,
  msgIdStr,
  rawContent,
  rawOriginal,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  bubbleShadowStyle,
  replyBlockNode,
  dividerColor,
  openMessageActions,
}: Props) {
  const { isPlaying, durMs, progress, toggleVoice } = useAudioMessageController({
    msgIdStr,
    rawContent,
    rawOriginal,
    maskOnly,
    meta,
  });
  const disp = String(displayText ?? '').trim();
  const uri =
    (msg as any).media_url ||
    (msg as any).mediaUrl ||
    meta?.url ||
    meta?.uri ||
    originalObj?.url ||
    originalObj?.uri ||
    mediaUris.find((u) => isMediaUri(u) || isUrlLike(u)) ||
    (isUrlLike(disp) ? disp : '');

  if (!uri) return null;

  return (
    <MessageAudioBubble
      uri={uri}
      isMe={isMe}
      maskOnly={maskOnly}
      selectionMode={selectionMode}
      interactionLocked={interactionLocked}
      theme={theme}
      bubbleShadowStyle={bubbleShadowStyle}
      replyBlockNode={replyBlockNode}
      dividerColor={dividerColor}
      durMs={durMs}
      progress={progress}
      isPlaying={isPlaying}
      waveform={meta?.waveform || originalObj?.waveform}
      onToggleVoice={toggleVoice}
      onLongPress={openMessageActions}
    />
  );
}

export default React.memo(MessageAudioBody);
