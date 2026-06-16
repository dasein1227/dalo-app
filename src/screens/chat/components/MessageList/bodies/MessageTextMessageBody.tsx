import React from 'react';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { MessageTextBody } from '../ui/MessageTextBody';
import { openUrl } from './MessageItemBody.shared';

type Props = {
  displayText: any;
  renderModelLink: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  searchQuery?: string;
  replyBlockNode: React.ReactNode;
  dividerColor: string;
  roomIdNum: number;
  renderBubbleShell: any;
  openMessageActions: () => void;
  translatingIndicatorNode: React.ReactNode;
};

function MessageTextMessageBody({
  displayText,
  renderModelLink,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  searchQuery,
  replyBlockNode,
  dividerColor,
  roomIdNum,
  renderBubbleShell,
  openMessageActions,
  translatingIndicatorNode,
}: Props) {
  const disp = String(displayText ?? '').trim();
  const {
    msgUrlFromText,
    effectivePreview,
    textWithoutUrl: dispForText,
    textIsOnlyUrl,
    clickableUrlOnly,
    shouldShowSkeleton,
    showLPCard,
  } = renderModelLink;

  return (
    <MessageTextBody
      isMe={isMe}
      maskOnly={maskOnly}
      selectionMode={selectionMode}
      interactionLocked={interactionLocked}
      theme={theme}
      searchQuery={searchQuery}
      replyBlockNode={replyBlockNode}
      dividerColor={dividerColor}
      displayText={disp}
      dispForText={dispForText}
      textIsOnlyUrl={textIsOnlyUrl}
      clickableUrlOnly={clickableUrlOnly}
      shouldShowSkeleton={shouldShowSkeleton}
      showLPCard={showLPCard}
      msgUrlFromText={msgUrlFromText}
      effectivePreview={effectivePreview}
      translatingIndicator={translatingIndicatorNode}
      roomId={roomIdNum}
      renderBubbleShell={renderBubbleShell}
      onLongPress={openMessageActions}
      onOpenUrl={openUrl}
    />
  );
}

export default React.memo(MessageTextMessageBody);
