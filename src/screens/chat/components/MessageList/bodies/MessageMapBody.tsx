import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageMapBubble } from '../ui/MessageMapBubble';

type Props = {
  msg: any;
  originalObj: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  bubbleShadowStyle: any;
  replyBlockNode: React.ReactNode;
  dividerColor: string;
  renderBubbleShell: any;
};

function MessageMapBody({
  msg,
  originalObj,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  bubbleShadowStyle,
  replyBlockNode,
  dividerColor,
  renderBubbleShell,
}: Props) {
  const { t } = useTranslation();
  const locationFallback = t('chat:messageBody.locationInfo');
  const o = originalObj || {};
  const lat = Number(o.lat ?? o.latitude ?? 0);
  const lng = Number(o.lng ?? o.lon ?? o.longitude ?? 0);
  const address = (() => {
    const c = String((msg as any).content ?? '').trim();
    if (c && c !== '[Location]') return c;
    return String(o.address ?? o.uri ?? o.url ?? o.fileUrl ?? '').trim() || locationFallback;
  })();

  if (!lat || !lng) return null;

  return (
    <MessageMapBubble
      lat={lat}
      lng={lng}
      address={address}
      isMe={isMe}
      maskOnly={maskOnly}
      interactionLocked={interactionLocked || selectionMode}
      bubbleShadowStyle={bubbleShadowStyle}
      replyBlockNode={replyBlockNode}
      dividerColor={dividerColor}
      renderBubbleShell={renderBubbleShell}
    />
  );
}

export default React.memo(MessageMapBody);
